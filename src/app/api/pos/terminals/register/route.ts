import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb, HttpError, rateLimit, readJson, route } from "@/lib/firebase/admin";
import { writeAudit } from "@/lib/firebase/serverAudit";
import { alertAdminOnce } from "@/lib/licensing/alerts";
import { pickCheckSeconds } from "@/lib/licensing/policy";
import { checkDeviceSecret, generateDeviceSecret, hashDeviceSecret } from "@/lib/licensing/deviceSecret";
import { canRegisterTerminal, clockSkewSeconds, clockTooFarOff, devicesWithinLimit, effectiveDeviceLimit, humanizeSeconds, normalizeMac } from "@/lib/licensing/rules";
import { buildLease, deviceFields, deviceInfoSchema, hardwareHash, licensingSettings, resolveLicense, terminalDocId } from "@/lib/licensing/server";
import { mapTerminal, type Data } from "@/lib/mappers";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  token: z.string().max(64),
  hardwareId: z.string().min(8).max(200),
  deviceName: z.string().trim().min(1).max(80),
  version: z.string().max(32).default(""),
  shopName: z.string().max(80).default(""),
  deviceSecret: z.string().max(100).optional(),
  clientTime: z.union([z.string().max(40), z.number()]).optional(),
  ...deviceInfoSchema,
});

/**
 * A till activating itself with a licence key. The device limit (the admin's own limit for this licence, or the plan's
 * tills) is enforced inside a transaction so two tills registering at the same moment can't both squeeze past it.
 *
 * Security: a new PC is given a private device secret, returned ONCE in `deviceSecret`; the POS must keep it and send it on
 * every later call. The PC's MAC address, hostname, OS and IP are stored, and a PC with a badly wrong clock is refused.
 * A PC the customer removed themselves can register again; one an admin disabled or unlinked can't.
 */
export const POST = route(async (req) => {
  rateLimit(req, "pos-register", 20);
  const parsed = bodySchema.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid request.");
  const input = parsed.data;
  const db = adminDb();
  const resolved = await resolveLicense(db, input.token);
  const settings = await licensingSettings(db);
  const termRef = db.collection("terminals").doc(terminalDocId(resolved.license.id, input.hardwareId));
  const activeQuery = db.collection("terminals").where("licenseId", "==", resolved.license.id).where("status", "==", "ACTIVE");

  const skew = clockSkewSeconds(input.clientTime);
  if (clockTooFarOff(skew, settings.clockToleranceMinutes)) {
    throw new HttpError(403, `This PC's date and time is wrong by about ${humanizeSeconds(skew ?? 0)}. Correct the clock (switch on automatic date and time), then activate again.`, "clock_invalid");
  }

  const deviceLimit = effectiveDeviceLimit(resolved.license, resolved.subscription);
  const outcome = await db.runTransaction(async (tx) => {
    const [existing, active] = await Promise.all([tx.get(termRef), tx.get(activeQuery)]);
    const old = (existing.exists ? existing.data() : null) as Data | null;
    const existingStatus = old ? String(old.status ?? "ACTIVE") : null;
    const removedByCustomer = existingStatus === "REVOKED" && old?.removedBy === "customer";
    if (existingStatus && existingStatus !== "ACTIVE" && !removedByCustomer) throw new HttpError(403, "This terminal was disabled or unlinked by the administrator. Contact support to re-enable it.", "terminal_disabled");

    const check = canRegisterTerminal({
      state: resolved.state,
      terminalLimit: deviceLimit,
      activeTerminals: active.size,
      alreadyActive: existingStatus === "ACTIVE",
    });
    if (!check.ok) throw new HttpError(403, check.reason ?? "Registration isn't allowed.", check.code);

    const common = { ...deviceFields(req, input), lastSeenAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), ...(skew !== null ? { clockSkewSeconds: skew } : {}) };

    // A brand-new PC, or one the customer removed and is now activating again: a fresh record with a new device secret.
    if (!old || removedByCustomer) {
      const secret = generateDeviceSecret();
      tx.set(termRef, {
        ...common, customerId: resolved.license.customerId, licenseId: resolved.license.id, shopId: null, shopName: input.shopName,
        hardwareIdHash: hardwareHash(input.hardwareId), hardwareIdShort: hardwareHash(input.hardwareId).slice(0, 8), status: "ACTIVE",
        secretHash: hashDeviceSecret(secret), secretState: "bound", macChanged: false, previousMac: "", removedBy: "",
        registeredAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(),
      });
      return { created: true, overLimit: false, deviceSecret: secret as string | undefined, secretProblem: false };
    }

    // The same PC again (its heartbeat). It must show the device secret it was given.
    let secret = checkDeviceSecret(old.secretHash, input.deviceSecret);
    let issued: string | undefined;
    if (secret === "none") { issued = generateDeviceSecret(); secret = "bound"; }
    const problem = secret === "wrong" || secret === "missing";
    if (problem && settings.enforceDeviceSecret) {
      throw new HttpError(403, "This PC is already registered on this licence under a different install. The account owner can remove it in My account, then activate it again.", "device_secret_required");
    }
    const patch: Record<string, unknown> = { ...common, secretState: secret, ...(issued ? { secretHash: hashDeviceSecret(issued) } : {}) };
    const newMac = normalizeMac(input.macAddress);
    if (newMac && typeof old.macAddress === "string" && old.macAddress && newMac !== old.macAddress) { patch.macChanged = true; patch.previousMac = old.macAddress; patch.macChangedAt = FieldValue.serverTimestamp(); }
    tx.update(termRef, patch);
    // An existing PC that no longer fits (the admin lowered the limit) is told to stop rather than silently carried on.
    const overLimit = !devicesWithinLimit((active.docs ?? []).map((d) => mapTerminal(d.id, d.data() as Data)), deviceLimit).has(termRef.id);
    return { created: false, overLimit, deviceSecret: issued, secretProblem: secret === "wrong" };
  });

  if (outcome.created) {
    await writeAudit(db, null, { action: "terminal.registered", targetType: "terminal", targetId: termRef.id, targetLabel: input.deviceName, metadata: { customerId: resolved.license.customerId, licenseId: resolved.license.id } });
  }
  if (outcome.secretProblem) {
    await alertAdminOnce(db, resolved.ref, "identity", { customerId: resolved.license.customerId, title: `Possible copied install on licence ${resolved.license.tokenPrefix}...`,
      message: `${resolved.businessName || "A customer"}'s PC "${input.deviceName}" tried to register with the wrong device secret. That usually means the install was copied to another PC.` });
  }
  await resolved.ref.update({ lastActivityAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  const lease = buildLease(resolved, settings.offlineMinHours / 24, { terminalStatus: "ACTIVE", overLimit: outcome.overLimit, deviceLimit, checkEverySeconds: pickCheckSeconds(settings.checkIntervalMinutes * 60), offlineMaxDays: settings.offlineMaxHours / 24 });
  return NextResponse.json({ ...lease, terminalId: termRef.id, created: outcome.created, ...(outcome.deviceSecret ? { deviceSecret: outcome.deviceSecret } : {}) }, { status: outcome.created ? 201 : 200 });
});
