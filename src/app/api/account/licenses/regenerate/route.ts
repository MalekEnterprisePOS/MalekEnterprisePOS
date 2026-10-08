import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb, HttpError, rateLimit, readJson, requireRecentLogin, requireUser, route } from "@/lib/firebase/admin";
import { findCustomerForUser } from "@/lib/account/server";
import { serverAuditEntry } from "@/lib/firebase/serverAudit";
import { notifyCustomer } from "@/lib/licensing/alerts";
import { storeLicenseSecret } from "@/lib/licensing/issue";
import { regenerateAvailableAt } from "@/lib/licensing/rules";
import { generateLicenseToken, hashToken, tokenPrefix } from "@/lib/licensing/token";
import { mapLicense, type Data } from "@/lib/mappers";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";
const body = z.object({ licenseId: z.string().min(1).max(200) });

/**
 * A customer replaces their own licence key, for example if it was shared by mistake or an old PC they no longer trust still has it.
 * The old key stops working at once (every PC's next check is refused with code invalid_key); PCs already registered keep their
 * place and just need the new key typed in. Guarded like device removal: verified email, a sign-in within the last 5 minutes,
 * not on a revoked or flagged licence, once per 24 hours, audited, and the customer is emailed.
 */
export const POST = route(async (req) => {
  rateLimit(req, "account-regenerate", 5);
  const user = await requireUser(req);
  if (!user.emailVerified) throw new HttpError(403, "Verify your email address first - we sent you a link.");
  requireRecentLogin(user);
  const parsed = body.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, "Invalid request.");
  const db = adminDb();
  const customer = await findCustomerForUser(db, user);
  if (!customer) throw new HttpError(404, "No account found.");
  const ref = db.collection("licenses").doc(parsed.data.licenseId);
  const snap = await ref.get();
  if (!snap.exists || String(snap.data()?.customerId) !== customer.id) throw new HttpError(404, "Licence not found.");
  const lic = mapLicense(snap.id, snap.data() as Data);
  if (lic.revoked) throw new HttpError(403, "This licence has been revoked. Contact support.");
  if (lic.flagged) throw new HttpError(403, "This licence is under a security review, so its key can't be replaced right now. Contact support.", "licence_flagged");
  const next = regenerateAvailableAt(lic.lastRegeneratedAt);
  if (next) throw new HttpError(403, `You generated a new key recently. You can do it again from ${formatDate(next)}, or contact support.`, "regen_cooldown");

  const token = generateLicenseToken();
  // Claimed with the time it was last regenerated, so two clicks at once can't both go through.
  const claimed = await db.runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    if (regenerateAvailableAt(mapLicense(fresh.id, fresh.data() as Data).lastRegeneratedAt)) return false;
    tx.update(ref, { tokenHash: hashToken(token), tokenPrefix: tokenPrefix(token), lastRegeneratedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return true;
  });
  if (!claimed) throw new HttpError(403, "A new key was just generated. Refresh the page to see it.", "regen_cooldown");
  await storeLicenseSecret(db, lic.id, token);
  await db.collection("auditLogs").add(serverAuditEntry({ uid: user.uid, email: user.email }, { action: "license.regenerated_by_customer", targetType: "customer", targetId: customer.id, targetLabel: tokenPrefix(token), metadata: { licenseId: lic.id, previousPrefix: lic.tokenPrefix } }));
  await notifyCustomer(db, customer.id, "key_regenerated", {
    title: "Your licence key was replaced",
    message: `A new licence key (starting ${tokenPrefix(token)}...) was generated for your Malek Enterprise POS licence by ${user.email}. The old key no longer works, so enter the new one on each PC. If this wasn't you, contact support straight away.`,
  });
  return NextResponse.json({ ok: true, token });
});
