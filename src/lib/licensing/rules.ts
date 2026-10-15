import type { LicenseState, LicenseStatus, SubscriptionStatus, Terminal } from "@/types";
import { addDays, daysBetween } from "@/lib/dates";

export interface LicenseFacts {
  status: LicenseStatus;
  revoked: boolean;
  expiryDate: string;
  gracePeriodDays: number;
}

/**
 * The effective state combines the licence record with the customer's subscription standing.
 * ACTIVE and GRACE both allow the POS to operate; GRACE means "works, but show a payment warning".
 */
export function computeLicenseState(
  license: LicenseFacts,
  subscriptionStatus: SubscriptionStatus | null,
  today: string,
): LicenseState {
  if (license.revoked || license.status === "REVOKED") return "REVOKED";
  if (subscriptionStatus === "SUSPENDED" || subscriptionStatus === "CANCELLED") return "SUSPENDED";
  if (license.expiryDate < today) {
    return daysBetween(license.expiryDate, today) <= license.gracePeriodDays ? "GRACE" : "EXPIRED";
  }
  if (subscriptionStatus === "OVERDUE" || subscriptionStatus === "GRACE") return "GRACE";
  return "ACTIVE";
}

export const isOperational = (state: LicenseState) => state === "ACTIVE" || state === "GRACE";

export interface RegisterCheck {
  state: LicenseState;
  terminalLimit: number;
  activeTerminals: number;
  /** True when this exact device is already registered and active (re-registering is a no-op). */
  alreadyActive: boolean;
}

export function canRegisterTerminal(c: RegisterCheck): { ok: boolean; reason?: string; code?: "licence_inactive" | "terminal_limit" } {
  if (!isOperational(c.state)) return { ok: false, code: "licence_inactive", reason: `This licence is ${c.state.toLowerCase()}.` };
  if (c.alreadyActive) return { ok: true };
  if (c.activeTerminals >= c.terminalLimit) {
    return { ok: false, code: "terminal_limit", reason: `Terminal limit reached (${c.activeTerminals} of ${c.terminalLimit} in use).` };
  }
  return { ok: true };
}

/** A paid-up subscription keeps its licence valid through the next billing date plus the grace period. */
export function renewedExpiry(current: string, nextBillingDate: string, gracePeriodDays: number): string {
  const target = addDays(nextBillingDate, gracePeriodDays);
  return target > current ? target : current;
}

// ── Devices: how many may use a licence, and which ones are "in use" ─────────────────────────────

/** A device counts as online while its last check-in is newer than this (twice the default 15-minute check interval). */
export const ONLINE_WINDOW_MS = 30 * 60_000;

export const isOnline = (lastSeenAt: string | null, now: number = Date.now()): boolean => {
  const t = lastSeenAt ? Date.parse(lastSeenAt) : NaN;
  return Number.isFinite(t) && now - t <= ONLINE_WINDOW_MS;
};

/**
 * The most devices that may be active on a licence: the admin's own limit if they set one, otherwise the number of tills
 * on the subscription (the plan), otherwise the number stored on the licence itself.
 */
export function effectiveDeviceLimit(license: { deviceLimit: number | null; terminalLimit: number }, subscription: { terminalLimit: number } | null): number {
  return license.deviceLimit ?? subscription?.terminalLimit ?? license.terminalLimit;
}

/**
 * Turns whatever a PC reports as its MAC address into "AA:BB:CC:DD:EE:FF", or "" if it isn't a usable one. Accepts the usual
 * spellings (colons, dashes, dots, none) and refuses the all-zero and broadcast addresses that virtual adapters report.
 */
export function normalizeMac(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const hex = raw.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  if (hex.length !== 12 || /^0+$/.test(hex) || /^F+$/.test(hex)) return "";
  return hex.match(/.{2}/g)!.join(":");
}

type DeviceFact = Pick<Terminal, "id" | "status" | "registeredAt" | "createdAt">;

/**
 * Which ACTIVE devices fit inside `limit`. The oldest registrations keep their place, so lowering the limit (or a plan
 * downgrade) blocks the newest PCs, never the ones the shop has used for months. Returned in registration order.
 */
export function devicesWithinLimit(devices: DeviceFact[], limit: number): Set<string> {
  const active = devices.filter((d) => d.status === "ACTIVE")
    .sort((a, b) => (a.registeredAt ?? a.createdAt ?? "").localeCompare(b.registeredAt ?? b.createdAt ?? "") || a.id.localeCompare(b.id));
  return new Set(active.slice(0, Math.max(0, limit)).map((d) => d.id));
}

/** Machine-readable reason a till must stop, for the POS to act on. Null when it may carry on. */
export type BlockCode =
  | "licence_revoked" | "licence_suspended" | "licence_expired" | "security_flag"
  | "terminal_disabled" | "terminal_removed" | "device_identity_invalid" | "clock_invalid" | "device_limit_exceeded";

export function blockCode(o: { state: LicenseState; flagged: boolean; terminalStatus?: string | null; overLimit?: boolean; clockInvalid?: boolean; identityInvalid?: boolean }): BlockCode | null {
  if (o.flagged) return "security_flag";
  if (o.state === "REVOKED") return "licence_revoked";
  if (o.state === "SUSPENDED") return "licence_suspended";
  if (o.state === "EXPIRED") return "licence_expired";
  if (o.terminalStatus === "DISABLED") return "terminal_disabled";
  if (o.terminalStatus === "REVOKED") return "terminal_removed";
  if (o.identityInvalid) return "device_identity_invalid";
  if (o.clockInvalid) return "clock_invalid";
  if (o.overLimit) return "device_limit_exceeded";
  return null;
}

// ── Clock honesty ────────────────────────────────────────────────────────────────────────────

/** How far the PC's clock is from ours, in seconds (positive = the PC is ahead). Null if it sent no usable time. */
export function clockSkewSeconds(clientTime: unknown, nowMs: number = Date.now()): number | null {
  const t = typeof clientTime === "number" ? clientTime : typeof clientTime === "string" ? Date.parse(clientTime) : NaN;
  // Epoch seconds sent by mistake (10 digits) are turned into milliseconds.
  const ms = Number.isFinite(t) && t > 0 && t < 1e11 ? t * 1000 : t;
  return Number.isFinite(ms) ? Math.round((ms - nowMs) / 1000) : null;
}

/** True when the skew is beyond what the admin tolerates. A tolerance of 0 switches the check off. */
export function clockTooFarOff(skewSeconds: number | null, toleranceMinutes: number): boolean {
  return toleranceMinutes > 0 && skewSeconds !== null && Math.abs(skewSeconds) > toleranceMinutes * 60;
}

/** "3 days", "5 hours", "20 minutes": for messages a shopkeeper can act on. */
export function humanizeSeconds(seconds: number): string {
  const s = Math.abs(seconds);
  if (s >= 172_800) return `${Math.round(s / 86_400)} days`;
  if (s >= 3_600) { const h = Math.round(s / 3_600); return `${h} hour${h === 1 ? "" : "s"}`; }
  const m = Math.max(1, Math.round(s / 60));
  return `${m} minute${m === 1 ? "" : "s"}`;
}

// ── Customers managing their own devices and key ─────────────────────────────────────────────

export const SELF_REMOVAL_WINDOW_DAYS = 30;
/** After a customer generates a new key themselves, they must wait this long before doing it again. */
export const REGENERATE_COOLDOWN_HOURS = 24;

/** How many self-removals are left in the rolling 30 days, and when the oldest one stops counting. */
export function selfRemovalAllowance(selfRemovals: string[], perWindow: number, nowMs: number = Date.now()) {
  const windowMs = SELF_REMOVAL_WINDOW_DAYS * 86_400_000;
  const recent = selfRemovals.map((t) => Date.parse(t)).filter((t) => Number.isFinite(t) && nowMs - t < windowMs).sort((a, b) => a - b);
  const left = Math.max(0, perWindow - recent.length);
  const nextAvailableAt = left === 0 && recent.length > 0 && perWindow > 0 ? new Date((recent[recent.length - perWindow] ?? recent[0]!) + windowMs).toISOString() : null;
  return { used: recent.length, left, perWindow, nextAvailableAt };
}

/** When the customer may next generate a new key themselves (null = now). */
export function regenerateAvailableAt(lastRegeneratedAt: string | null, nowMs: number = Date.now()): string | null {
  const t = lastRegeneratedAt ? Date.parse(lastRegeneratedAt) : NaN;
  if (!Number.isFinite(t)) return null;
  const at = t + REGENERATE_COOLDOWN_HOURS * 3_600_000;
  return at > nowMs ? new Date(at).toISOString() : null;
}
