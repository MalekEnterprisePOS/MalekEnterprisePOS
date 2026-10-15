import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb, HttpError, rateLimit, readJson, requireRecentLogin, requireUser, route } from "@/lib/firebase/admin";
import { findCustomerForUser } from "@/lib/account/server";
import { serverAuditEntry } from "@/lib/firebase/serverAudit";
import { notifyCustomer } from "@/lib/licensing/alerts";
import { selfRemovalAllowance } from "@/lib/licensing/rules";
import { licensingSettings } from "@/lib/licensing/server";
import { mapLicense, type Data } from "@/lib/mappers";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";
const body = z.object({ terminalId: z.string().min(1).max(200) });

/**
 * A customer frees a place on their own licence by removing one of their PCs, so they never have to wait for support when a
 * till PC dies or is replaced. Guarded because it is also the way to pass one licence around many PCs:
 *  - a verified email, and a sign-in within the last 5 minutes (re-confirmed with their password or Google),
 *  - the PC must be theirs, and still active (a PC an admin blocked can't be "removed" to dodge the block),
 *  - not while the licence is flagged for a security review, and never on a revoked licence,
 *  - at most `selfRemovalsPer30Days` removals per licence in any 30 days (admins can always remove more),
 *  - every removal is audited and the customer is emailed a notice.
 * The PC can be activated again later with the licence key (it then gets a brand-new device secret).
 */
export const POST = route(async (req) => {
  rateLimit(req, "account-device-remove", 10);
  const user = await requireUser(req);
  if (!user.emailVerified) throw new HttpError(403, "Verify your email address first - we sent you a link.");
  requireRecentLogin(user);
  const parsed = body.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, "Choose a device to remove.");
  const db = adminDb();
  const customer = await findCustomerForUser(db, user);
  if (!customer) throw new HttpError(404, "No account found.");
  const settings = await licensingSettings(db);
  if (settings.selfRemovalsPer30Days <= 0) throw new HttpError(403, "Removing devices yourself is switched off. Contact support and we'll do it for you.", "removal_disabled");

  const termRef = db.collection("terminals").doc(parsed.data.terminalId);
  const result = await db.runTransaction(async (tx) => {
    const termSnap = await tx.get(termRef);
    const term = (termSnap.data() ?? {}) as Data;
    // Same answer for "doesn't exist" and "belongs to someone else": never confirm another customer's device ids.
    if (!termSnap.exists || String(term.customerId) !== customer.id) throw new HttpError(404, "Device not found.");
    if (term.status !== "ACTIVE") throw new HttpError(403, term.status === "DISABLED" ? "This device was blocked by the administrator. Contact support." : "This device has already been removed.", "not_removable");
    const licRef = db.collection("licenses").doc(String(term.licenseId));
    const licSnap = await tx.get(licRef);
    if (!licSnap.exists || String(licSnap.data()?.customerId) !== customer.id) throw new HttpError(404, "Licence not found.");
    const lic = mapLicense(licSnap.id, licSnap.data() as Data);
    if (lic.revoked) throw new HttpError(403, "This licence has been revoked. Contact support.");
    if (lic.flagged) throw new HttpError(403, "This licence is under a security review, so devices can't be removed right now. Contact support.", "licence_flagged");
    const allowance = selfRemovalAllowance(lic.selfRemovals, settings.selfRemovalsPer30Days);
    if (allowance.left <= 0) {
      throw new HttpError(403, `You've already removed ${allowance.used} device${allowance.used === 1 ? "" : "s"} in the last 30 days, which is the most you can remove yourself.${allowance.nextAvailableAt ? ` You can remove another from ${formatDate(allowance.nextAvailableAt)}, or contact support to do it sooner.` : ""}`, "removal_limit");
    }
    const recent = lic.selfRemovals.filter((t) => Date.now() - Date.parse(t) < 30 * 86_400_000).map((t) => new Date(t));
    tx.update(termRef, { status: "REVOKED", removedBy: "customer", removedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    tx.update(licRef, { selfRemovals: [...recent, new Date()].slice(-20), updatedAt: FieldValue.serverTimestamp() });
    return { name: String(term.deviceName ?? "A device"), mac: String(term.macAddress ?? ""), prefix: lic.tokenPrefix, licenseId: lic.id, left: allowance.left - 1 };
  });

  await db.collection("auditLogs").add(serverAuditEntry({ uid: user.uid, email: user.email }, { action: "terminal.removed_by_customer", targetType: "terminal", targetId: termRef.id, targetLabel: result.name, metadata: { customerId: customer.id, licenseId: result.licenseId, mac: result.mac } }));
  await notifyCustomer(db, customer.id, "device_removed", {
    title: "A device was removed from your licence",
    message: `"${result.name}"${result.mac ? ` (${result.mac})` : ""} was removed from your Malek Enterprise POS licence ${result.prefix}... by ${user.email}. If this wasn't you, sign in to My account straight away and generate a new licence key, then contact support.`,
  });
  return NextResponse.json({ ok: true, removalsLeft: result.left });
});
