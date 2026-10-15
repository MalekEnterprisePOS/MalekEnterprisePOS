import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb, HttpError, rateLimit, readJson, route } from "@/lib/firebase/admin";
import { serverAuditEntry } from "@/lib/firebase/serverAudit";
import { SITE_URL } from "@/lib/constants";
import { mapSettings, type Data } from "@/lib/mappers";
import { queueAndSend } from "@/lib/notifications/server";
import { hardwareHash, resolveLicense } from "@/lib/licensing/server";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  token: z.string().max(64),
  // The POS sends "" when it has no device id; that must not make the whole report fail validation.
  hardwareId: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().min(8).max(200).optional()),
  reason: z.string().trim().min(1).max(300),
});

/**
 * A till reports tampering it detected locally (e.g. ClockGuard noticing the PC clock was wound back).
 * Authenticated by the licence key, like /verify. The report blocks the licence on the SERVER (see buildLease), so it
 * can't be undone by anything on the customer's PC; only an admin can clear it (Admin > Licences).
 * Repeat reports for an already-flagged licence are accepted and ignored, so a till that keeps reporting on every
 * start can't spam the audit log or your inbox.
 */
export const POST = route(async (req) => {
  rateLimit(req, "pos-flag", 20);
  const body = bodySchema.safeParse(await readJson(req));
  if (!body.success) throw new HttpError(400, "token and reason are required.");
  const db = adminDb();
  const resolved = await resolveLicense(db, body.data.token); // throws 401 for an unknown key: no valid key, no flagging
  const { license } = resolved;

  // Atomic: if two reports arrive at the same moment, exactly one of them wins the right to raise the alert.
  const newlyFlagged = await db.runTransaction(async (tx) => {
    const snap = await tx.get(resolved.ref);
    if (snap.data()?.flagged === true) return false;
    tx.update(resolved.ref, { flagged: true, flagReason: body.data.reason, flaggedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return true;
  });
  if (!newlyFlagged) return NextResponse.json({ ok: true, alreadyFlagged: true });

  await db.collection("auditLogs").add(serverAuditEntry(null, {
    action: "license.flagged_by_terminal", targetType: "customer", targetId: license.customerId, targetLabel: license.tokenPrefix,
    // Only a short fingerprint of the hardware id is stored, never the id itself.
    metadata: { licenseId: license.id, hardware: body.data.hardwareId ? hardwareHash(body.data.hardwareId).slice(0, 12) : null, reason: body.data.reason },
  }));

  const settings = mapSettings((await db.collection("settings").doc("app").get()).data() as Data | null);
  const to = settings.general.supportEmail || settings.general.salesEmail;
  await queueAndSend(db, `licflag_${license.id}_${Date.now()}`, {
    type: "general", customerId: license.customerId, recipient: to,
    title: `Licence ${license.tokenPrefix}... flagged for review`,
    message: `${resolved.businessName || "A customer"}'s till reported: ${body.data.reason}\n\nThis licence is now blocked until you clear it in Admin > Licences. Look into it first: the cause is usually a wrong PC clock, but it can also be an attempt to extend a licence.`,
    ctaLabel: "Open Licences", ctaUrl: `${SITE_URL}/admin/licenses`,
  });
  return NextResponse.json({ ok: true });
});
