import { FieldValue, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { z } from "zod";
import { adminDb, HttpError, rateLimit, readJson, route } from "@/lib/firebase/admin";
import { alertAdminOnce } from "@/lib/licensing/alerts";
import { pickCheckSeconds, shouldRecordActivity } from "@/lib/licensing/policy";
import { checkDeviceSecret, generateDeviceSecret, hashDeviceSecret } from "@/lib/licensing/deviceSecret";
import { clockSkewSeconds, clockTooFarOff, devicesWithinLimit, effectiveDeviceLimit, humanizeSeconds, normalizeMac, renewedExpiry } from "@/lib/licensing/rules";
import { buildLease, deviceFields, deviceInfoSchema, licensingSettings, resolveLicense, terminalDocId } from "@/lib/licensing/server";
import { mapTerminal, type Data } from "@/lib/mappers";
import type { Terminal } from "@/types";

export const dynamic = "force-dynamic";

const deviceBody = {
  hardwareId: z.string().min(8).max(200),
  version: z.string().max(32).optional(),
  deviceName: z.string().trim().max(80).optional(),
  /** Handed to this PC when it registered. Proves it is the install that registered. */
  deviceSecret: z.string().max(100).optional(),
  ...deviceInfoSchema,
};

const bodySchema = z.object({
  token: z.string().max(64),
  ...Object.fromEntries(Object.entries(deviceBody).map(([k, v]) => [k, k === "hardwareId" ? v.optional() : v])) as { [K in keyof typeof deviceBody]: z.ZodOptional<(typeof deviceBody)[K]> },
  /** The PC's own clock (ISO text or epoch milliseconds), so a wound-back clock can be caught. */
  clientTime: z.union([z.string().max(40), z.number()]).optional(),
  /**
   * The shop's other PCs (its tills), checked in the SAME request. Only the shop's server PC reaches the internet, so it asks about
   * every till on their behalf. Doing it in one request instead of one request per till means the licence, its plan and its devices
   * are read from the database once instead of once per till.
   */
  clients: z.array(z.object(deviceBody)).max(200).optional(),
});

interface DeviceInput { hardwareId: string; deviceSecret?: string; clientTime?: string | number; version?: string; deviceName?: string; macAddress?: string; hostname?: string; os?: string; localIp?: string }

interface DeviceResult {
  terminalStatus: string | undefined;
  terminalOk: boolean;
  overLimit: boolean;
  clockInvalid: boolean;
  identityInvalid: boolean;
  skew: number | null;
  issuedSecret: string | undefined;
}

/**
 * The compact answer for one till inside a batched check: just what its Server PC needs to act on, with no signed lease (a till
 * reads the licence the Server PC publishes). `message` is only filled in when the till must stop.
 */
interface ClientVerdict { hardwareId: string; terminalStatus: string | undefined; action: "continue" | "block"; code: string | null; message: string; deviceSecret?: string }

/**
 * The licence check. Public endpoint, authenticated by the licence key itself. Every PC running the POS (the shop's server
 * and each till) should call it as soon as it starts and then every `checkAgainInSeconds` for as long as it has internet.
 *
 * It answers with an `action`: "continue" or "block". The POS must stop trading on "block", and `code` says why
 * (licence_revoked, licence_suspended, licence_expired, security_flag, terminal_disabled, terminal_removed,
 * device_identity_invalid, clock_invalid, device_limit_exceeded). It also returns the signed lease the POS caches, which is
 * what lets it keep going for a while when the internet is down.
 *
 * Each call records the PC's MAC address, hostname, OS, IP and clock offset, and checks four things about the PC itself:
 *  - its device secret (a copied install can't show it),
 *  - whether its MAC address changed since it registered,
 *  - whether its clock is wildly wrong (the way to cheat expiry dates),
 *  - whether the licence already has more active PCs than it allows (the newest ones are blocked).
 * A key the server doesn't know answers 401 with code "invalid_key": that is a block too.
 *
 * LOAD: the shop's server PC may list its tills in `clients` and gets one compact verdict for each in `clients` of the reply. All the
 * PCs' database writes go out as one batch, and an unchanged PC is only recorded every few minutes (Settings).
 */
export const POST = route(async (req) => {
  rateLimit(req, "pos-verify", 120);
  const body = bodySchema.safeParse(await readJson(req));
  if (!body.success) throw new HttpError(400, "token is required.");
  const db = adminDb();
  const resolved = await resolveLicense(db, body.data.token);
  const settings = await licensingSettings(db);

  // The licence record is rewritten at most every few minutes (Settings > activity recording) unless something real changed:
  // every PC in the shop checks every 1 to 3 minutes, and writing each one would be the website's biggest source of writes.
  const updates: Record<string, unknown> = { lastVerifiedAt: FieldValue.serverTimestamp(), lastActivityAt: FieldValue.serverTimestamp() };
  let licenceChanged = false;
  if (resolved.subscription) {
    if (resolved.subscription.terminalLimit !== resolved.license.terminalLimit) licenceChanged = true;
    updates.terminalLimit = resolved.subscription.terminalLimit;
    if (resolved.subscription.status === "ACTIVE") {
      const expiry = renewedExpiry(resolved.license.expiryDate, resolved.subscription.nextBillingDate, resolved.subscription.gracePeriodDays);
      if (expiry !== resolved.license.expiryDate) { updates.expiryDate = expiry; resolved.license.expiryDate = expiry; licenceChanged = true; }
    }
  }
  if (shouldRecordActivity(resolved.license.lastVerifiedAt, settings.activityWriteMinutes, licenceChanged)) await resolved.ref.update(updates);

  const deviceLimit = effectiveDeviceLimit(resolved.license, resolved.subscription);
  const docs = (await db.collection("terminals").where("licenseId", "==", resolved.license.id).get()).docs;
  const devices = docs.map((d) => mapTerminal(d.id, d.data() as Data));
  const rawById = new Map(docs.map((d) => [d.id, d.data() as Data]));
  const inLimit = devicesWithinLimit(devices, deviceLimit);
  const devicesInUse = devices.filter((d) => d.status === "ACTIVE").length;

  const writes: { ref: DocumentReference; patch: Record<string, unknown> }[] = [];
  const alerts: Promise<unknown>[] = [];
  const evaluate = (input: DeviceInput) => evaluateDevice({ req, db, resolved, settings, devices, rawById, inLimit, deviceLimit, devicesInUse, writes, alerts }, input);

  // The PC making the request.
  const own: DeviceResult = body.data.hardwareId ? await evaluate({ ...body.data, hardwareId: body.data.hardwareId }) : { terminalStatus: undefined, terminalOk: true, overLimit: false, clockInvalid: false, identityInvalid: false, skew: null, issuedSecret: undefined };

  // The shop's tills, if the server PC asked about them (never the requesting PC twice).
  const clientResults: { input: DeviceInput; result: DeviceResult }[] = [];
  for (const c of body.data.clients ?? []) {
    if (c.hardwareId === body.data.hardwareId) continue;
    clientResults.push({ input: c, result: await evaluate(c) });
  }

  // All the PCs' "seen" records in one batch instead of one write each.
  if (writes.length > 0) {
    const batch = db.batch();
    for (const w of writes) batch.update(w.ref, w.patch);
    await batch.commit();
  }
  await Promise.all(alerts);

  const checkEverySeconds = pickCheckSeconds(settings.checkIntervalMinutes * 60);
  const leaseFor = (r: DeviceResult) => buildLease(resolved, settings.offlineMinHours / 24, {
    operational: r.terminalOk, terminalStatus: r.terminalStatus, overLimit: r.overLimit, clockInvalid: r.clockInvalid, clockSkewSeconds: r.skew, identityInvalid: r.identityInvalid,
    deviceLimit, devicesInUse, checkEverySeconds, offlineMaxDays: settings.offlineMaxHours / 24,
  });

  const lease = leaseFor(own);
  const response: Record<string, unknown> = { ...lease, ...(own.issuedSecret ? { deviceSecret: own.issuedSecret } : {}) };
  if (body.data.clients) {
    response.clients = clientResults.map(({ input, result }): ClientVerdict => {
      const l = leaseFor(result);
      return { hardwareId: input.hardwareId, terminalStatus: result.terminalStatus, action: l.action, code: l.code, message: l.action === "block" ? l.message : "", ...(result.issuedSecret ? { deviceSecret: result.issuedSecret } : {}) };
    });
  }
  return NextResponse.json(response);
});

interface Ctx {
  req: Request;
  db: Firestore;
  resolved: Awaited<ReturnType<typeof resolveLicense>>;
  settings: Awaited<ReturnType<typeof licensingSettings>>;
  devices: Terminal[];
  rawById: Map<string, Data>;
  inLimit: Set<string>;
  deviceLimit: number;
  devicesInUse: number;
  writes: { ref: DocumentReference; patch: Record<string, unknown> }[];
  alerts: Promise<unknown>[];
}

/** Checks one PC against the licence: its device secret, MAC address, clock and place within the device limit. Queues (never performs) its database write. */
async function evaluateDevice(ctx: Ctx, input: DeviceInput): Promise<DeviceResult> {
  const { req, db, resolved, settings, devices, rawById, inLimit, deviceLimit, devicesInUse } = ctx;
  const result: DeviceResult = { terminalStatus: undefined, terminalOk: true, overLimit: false, clockInvalid: false, identityInvalid: false, skew: null, issuedSecret: undefined };
  const id = terminalDocId(resolved.license.id, input.hardwareId);
  const mine = devices.find((d) => d.id === id);
  if (!mine) { result.terminalStatus = "UNREGISTERED"; return result; }

  result.terminalStatus = mine.status;
  result.terminalOk = mine.status === "ACTIVE";
  // Removed, blocked and unlinked PCs leave no new trace. An active one is always evaluated, even when it is about to be refused,
  // so the admin can see exactly who is trying to use the licence.
  if (!result.terminalOk) return result;

  const termRef = db.collection("terminals").doc(id);
  const raw = rawById.get(id) ?? {};
  result.overLimit = !inLimit.has(id);
  const fields = deviceFields(req, input);
  const patch: Record<string, unknown> = { ...fields, lastSeenAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };

  // 1. Device secret.
  let secret = checkDeviceSecret(raw.secretHash, input.deviceSecret);
  if (secret === "none") {
    // First check from a device registered before secrets existed: issue one now, once, even if two checks arrive together.
    result.issuedSecret = await db.runTransaction(async (tx) => {
      const snap = await tx.get(termRef);
      if (snap.data()?.secretHash) return undefined;
      const s = generateDeviceSecret();
      tx.update(termRef, { secretHash: hashDeviceSecret(s), secretState: "bound" });
      return s;
    });
    secret = result.issuedSecret ? "bound" : checkDeviceSecret((await termRef.get()).data()?.secretHash, input.deviceSecret);
  }
  patch.secretState = secret;
  result.identityInvalid = settings.enforceDeviceSecret && (secret === "wrong" || secret === "missing");
  if (secret === "wrong") {
    ctx.alerts.push(alertAdminOnce(db, resolved.ref, "identity", { customerId: resolved.license.customerId,
      title: `Possible copied install on licence ${resolved.license.tokenPrefix}...`,
      message: `${resolved.businessName || "A customer"}'s PC "${mine.deviceName}" checked in with the right licence key and device ID but the wrong device secret. That usually means the install was copied to another PC.${settings.enforceDeviceSecret ? " It has been blocked." : " It is still working because device-secret blocking is switched off in Settings."}` }));
  }

  // 2. MAC address changed since it registered.
  const newMac = normalizeMac(input.macAddress);
  if (newMac && mine.macAddress && newMac !== mine.macAddress) {
    patch.macChanged = true; patch.previousMac = mine.macAddress; patch.macChangedAt = FieldValue.serverTimestamp();
    ctx.alerts.push(alertAdminOnce(db, resolved.ref, "macChanged", { customerId: resolved.license.customerId,
      title: `A PC changed its MAC address on licence ${resolved.license.tokenPrefix}...`,
      message: `${resolved.businessName || "A customer"}'s PC "${mine.deviceName}" now reports MAC ${newMac}, but registered with ${mine.macAddress}. This is normal after a network card change, but it can also mean the install was copied. Review it under Admin > Devices.` }));
  }

  // 3. Clock honesty (only for a PC that sends its own time: a till checked through its Server PC doesn't).
  result.skew = clockSkewSeconds(input.clientTime);
  if (result.skew !== null) patch.clockSkewSeconds = result.skew;
  result.clockInvalid = clockTooFarOff(result.skew, settings.clockToleranceMinutes);

  // 4. Over the device limit: tell the admin once a day.
  if (result.overLimit) {
    ctx.alerts.push(alertAdminOnce(db, resolved.ref, "overLimit", { customerId: resolved.license.customerId,
      title: `Licence ${resolved.license.tokenPrefix}... is over its device limit`,
      message: `${resolved.businessName || "A customer"} has ${devicesInUse} active devices but only ${deviceLimit} ${deviceLimit === 1 ? "is" : "are"} allowed. "${mine.deviceName}" was blocked. Raise the limit under Admin > Devices, or ask the customer to remove a PC they no longer use.` }));
  }
  if (result.clockInvalid && result.skew !== null) {
    ctx.alerts.push(alertAdminOnce(db, resolved.ref, "clock", { customerId: resolved.license.customerId,
      title: `A PC clock is wrong on licence ${resolved.license.tokenPrefix}...`,
      message: `${resolved.businessName || "A customer"}'s PC "${mine.deviceName}" has a clock about ${humanizeSeconds(result.skew)} ${result.skew > 0 ? "ahead of" : "behind"} the real time and was blocked until it is corrected.` }, 72));
  }

  // Record the PC as "seen" only when something changed or it has been a few minutes (see shouldRecordActivity). A MAC drift,
  // a different secret state or a clock that has moved always counts as a change, so alerts and the admin view stay exact.
  const known = mine as unknown as Record<string, string>;
  const fieldsChanged = Object.entries(fields).some(([k, v]) => known[k] !== v);
  const skewChanged = result.skew !== null && (mine.clockSkewSeconds === null || Math.abs(result.skew - mine.clockSkewSeconds) > 120);
  const stateChanged = patch.secretState !== mine.secretState || patch.macChanged === true;
  if (shouldRecordActivity(mine.lastSeenAt, settings.activityWriteMinutes, fieldsChanged || skewChanged || stateChanged)) ctx.writes.push({ ref: termRef, patch });
  return result;
}
