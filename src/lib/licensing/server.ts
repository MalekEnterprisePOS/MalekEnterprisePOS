import { createHash } from "node:crypto";
import type { DocumentReference, Firestore } from "firebase-admin/firestore";
import { z } from "zod";
import type { License, LicenseState, Subscription } from "@/types";
import { HttpError } from "@/lib/firebase/admin";
import { mapLicense, mapSettings, mapSubscription, type Data } from "@/lib/mappers";
import { todayISO } from "@/lib/dates";
import { pickOfflineAllowanceDays } from "./policy";
import { blockCode, computeLicenseState, effectiveDeviceLimit, humanizeSeconds, isOperational, normalizeMac, type BlockCode } from "./rules";
import { signLease } from "./lease";
import { hashToken, isWellFormedToken } from "./token";

export const terminalDocId = (licenseId: string, hardwareId: string) =>
  `${licenseId}_${createHash("sha256").update(hardwareId.trim()).digest("hex").slice(0, 16)}`;
export const hardwareHash = (hardwareId: string) => createHash("sha256").update(hardwareId.trim()).digest("hex");

export interface ResolvedLicense {
  ref: DocumentReference;
  license: License;
  subscription: Subscription | null;
  state: LicenseState;
  businessName: string;
}

/** Looks a licence up by the hash of the presented key. Unknown and malformed keys get the same answer. */
export async function resolveLicense(db: Firestore, token: unknown): Promise<ResolvedLicense> {
  if (typeof token !== "string" || !isWellFormedToken(token)) throw new HttpError(401, "That licence key isn't valid.", "invalid_key");
  const found = await db.collection("licenses").where("tokenHash", "==", hashToken(token)).limit(1).get();
  const doc = found.docs[0];
  if (!doc) throw new HttpError(401, "That licence key isn't valid.", "invalid_key");
  const license = mapLicense(doc.id, doc.data() as Data);
  const subDoc = license.subscriptionId ? await db.collection("subscriptions").doc(license.subscriptionId).get() : null;
  const subscription = subDoc?.exists ? mapSubscription(subDoc.id, subDoc.data() as Data) : null;
  const customer = await db.collection("customers").doc(license.customerId).get();
  const state = computeLicenseState(license, subscription?.status ?? null, todayISO());
  return { ref: doc.ref, license, subscription, state, businessName: String(customer.data()?.businessName ?? "") };
}

export async function offlineAllowanceDays(db: Firestore): Promise<number> {
  return (await licensingSettings(db)).offlineMinHours / 24;
}

/** The licensing numbers the POS routes need, read in one go. */
export async function licensingSettings(db: Firestore) {
  const s = await db.collection("settings").doc("app").get();
  return mapSettings(s.exists ? (s.data() as Data) : null).licensing;
}

/** What the POS tells us about the PC it runs on. Everything is optional: an older POS build simply sends none of it. */
export const deviceInfoSchema = {
  macAddress: z.string().max(40).optional(),
  hostname: z.string().trim().max(80).optional(),
  os: z.string().trim().max(120).optional(),
  localIp: z.string().trim().max(45).optional(),
};

/** The terminal-document fields to refresh from a check-in. Only values that were actually sent (and are usable) are included. */
export function deviceFields(req: Request, input: { macAddress?: string; hostname?: string; os?: string; localIp?: string; version?: string; deviceName?: string }): Record<string, string> {
  const out: Record<string, string> = {};
  const mac = normalizeMac(input.macAddress);
  if (mac) out.macAddress = mac;
  if (input.hostname) out.hostname = input.hostname;
  if (input.os) out.os = input.os;
  if (input.localIp) out.localIp = input.localIp;
  if (input.version) out.version = input.version;
  if (input.deviceName) out.deviceName = input.deviceName;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (ip) out.publicIp = ip.slice(0, 45);
  return out;
}

export { effectiveDeviceLimit };

const MESSAGES: Record<LicenseState, string> = {
  ACTIVE: "Licence is active.",
  GRACE: "Payment is overdue or the licence has just expired. The system keeps working for now, but please settle the account.",
  SUSPENDED: "This licence is suspended. Contact support to restore it.",
  EXPIRED: "This licence has expired. Contact support to renew it.",
  REVOKED: "This licence has been revoked.",
};

const FLAGGED_MESSAGE = "This licence was flagged for a security review (e.g. an unusual system clock change) and is temporarily blocked. Contact support to have it reviewed and cleared.";
const DISABLED_MESSAGE = "This terminal has been disabled or unlinked by the administrator.";
const REMOVED_MESSAGE = "This PC was removed from the licence. To use it again, activate it with your licence key.";
const IDENTITY_MESSAGE = "This PC could not prove it is the one that was registered on this licence. The account owner can remove it in My account and activate it again.";

export const DEFAULT_CHECK_SECONDS = 3 * 60;

interface LeaseExtra {
  terminalStatus?: string;
  operational?: boolean;
  /** This PC is active, but the licence already has more active PCs than its device limit allows. */
  overLimit?: boolean;
  /** This PC's clock is further off than the admin tolerates. */
  clockInvalid?: boolean;
  clockSkewSeconds?: number | null;
  /** This PC couldn't prove it is the install that registered (device secret), and the admin has asked for that to be enforced. */
  identityInvalid?: boolean;
  deviceLimit?: number;
  devicesInUse?: number;
  /** How soon the POS should ask again while it has internet. Pick it with pickCheckSeconds() so it is random. */
  checkEverySeconds?: number;
  /** When set, the offline allowance is a random number of days between the `offlineDays` argument (the shortest) and this (the longest). */
  offlineMaxDays?: number;
  /** For tests: replaces Math.random. */
  random?: () => number;
}

/**
 * The signed answer the POS stores locally and re-checks against its offline allowance.
 * `action` is the one thing a till has to obey: "continue" or "block". `code` says why it must stop.
 */
export function buildLease(r: ResolvedLicense, offlineDays: number, extra: LeaseExtra = {}) {
  const now = new Date();
  // A flagged licence is blocked regardless of payment state. Checked FIRST so nothing below can override it.
  const flagged = r.license.flagged === true;
  const code: BlockCode | null = blockCode({ state: r.state, flagged, terminalStatus: extra.terminalStatus, overLimit: extra.overLimit, clockInvalid: extra.clockInvalid, identityInvalid: extra.identityInvalid });
  const operational = !flagged && !extra.overLimit && !extra.clockInvalid && !extra.identityInvalid && (extra.operational ?? true) && isOperational(r.state);
  const deviceLimit = extra.deviceLimit ?? effectiveDeviceLimit(r.license, r.subscription);
  const checkAgainInSeconds = extra.checkEverySeconds ?? DEFAULT_CHECK_SECONDS;
  // The PC may trade offline for this long after this check. Drawn fresh for every lease, so it can't be planned around.
  const allowanceDays = extra.offlineMaxDays === undefined ? offlineDays : pickOfflineAllowanceDays(offlineDays, extra.offlineMaxDays, extra.random);
  const payload = {
    v: 1,
    licenseId: r.license.id,
    licensee: r.businessName,
    /** The subscription plan name, so the POS can show "Plan: Standard" instead of just the business name. */
    plan: r.subscription?.plan ?? null,
    state: r.state,
    subscriptionStatus: r.subscription?.status ?? null,
    terminalLimit: deviceLimit,
    /** Same number as terminalLimit; named for what it is now that an admin can set it per licence. */
    deviceLimit,
    expiryDate: r.license.expiryDate,
    issuedAt: now.toISOString(),
    /** The server's clock. A POS can compare it to its own to show "your clock is wrong" before it is ever blocked for it. */
    serverTime: now.toISOString(),
    /** The POS may keep trading without contacting us until this moment. */
    validUntil: operational ? new Date(now.getTime() + allowanceDays * 86_400_000).toISOString() : now.toISOString(),
    operational,
    /** Inside the signed lease, so the cached offline copy also tells the till WHY it is blocked. */
    flagged,
    blockCode: operational ? null : code,
    checkAgainInSeconds,
    terminalStatus: extra.overLimit ? "OVER_LIMIT" : (extra.terminalStatus ?? null),
  };
  const message = flagged ? FLAGGED_MESSAGE
    : extra.terminalStatus === "DISABLED" ? DISABLED_MESSAGE
    : extra.terminalStatus === "REVOKED" ? REMOVED_MESSAGE
    : extra.identityInvalid ? IDENTITY_MESSAGE
    : extra.clockInvalid ? `This PC's date and time is wrong by about ${humanizeSeconds(extra.clockSkewSeconds ?? 0)}. Correct the clock (switch on automatic date and time) and this PC will carry on.`
    : extra.overLimit ? `This PC is over the licence's limit of ${deviceLimit} device${deviceLimit === 1 ? "" : "s"}. Ask the administrator to raise the limit or remove a PC that is no longer used.`
    : MESSAGES[r.state];
  return {
    valid: operational, state: r.state, message,
    /** "continue" while the licence, the device and the limit are all fine; otherwise "block". The POS must stop trading on "block". */
    action: operational ? ("continue" as const) : ("block" as const),
    code: operational ? null : code,
    checkAgainInSeconds, deviceLimit, devicesInUse: extra.devicesInUse ?? null, serverTime: now.toISOString(),
    ...signLease(payload),
  };
}
