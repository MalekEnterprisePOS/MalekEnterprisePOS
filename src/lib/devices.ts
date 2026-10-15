import type { Terminal } from "@/types";
import { devicesWithinLimit, isOnline } from "@/lib/licensing/rules";

/** A PC whose clock is more than this far out (seconds) is flagged for the admin. The PC itself is only blocked beyond the Settings tolerance. */
export const CLOCK_WARN_SECONDS = 3600;

export type Attention = "mac_changed" | "identity" | "clock" | "over_limit";

export const ATTENTION_LABEL: Record<Attention, string> = {
  mac_changed: "MAC address changed",
  identity: "Failed the identity check",
  clock: "Clock is wrong",
  over_limit: "Over the device limit",
};

/** The ids of ACTIVE devices that don't fit inside their licence's device limit: the newest ones, exactly as the licence check blocks them. */
export function overLimitIds(terminals: Terminal[], limitOf: (licenseId: string) => number): Set<string> {
  const byLicence = new Map<string, Terminal[]>();
  for (const t of terminals) byLicence.set(t.licenseId, [...(byLicence.get(t.licenseId) ?? []), t]);
  const over = new Set<string>();
  for (const [licenseId, list] of byLicence) {
    const fits = devicesWithinLimit(list, limitOf(licenseId));
    for (const t of list) if (t.status === "ACTIVE" && !fits.has(t.id)) over.add(t.id);
  }
  return over;
}

/** What is wrong with a device, if anything. Only active devices are flagged: a blocked or removed one is already dealt with. */
export function deviceAttention(t: Terminal, over: Set<string>): Attention[] {
  if (t.status !== "ACTIVE") return [];
  const out: Attention[] = [];
  if (t.macChanged) out.push("mac_changed");
  if (t.secretState === "wrong") out.push("identity");
  if (t.clockSkewSeconds !== null && Math.abs(t.clockSkewSeconds) > CLOCK_WARN_SECONDS) out.push("clock");
  if (over.has(t.id)) out.push("over_limit");
  return out;
}

export interface DeviceSummary {
  total: number;
  active: number;
  online: number;
  blocked: number;
  removed: number;
  needAttention: number;
  overLimit: number;
}

export function summarizeDevices(terminals: Terminal[], over: Set<string>, now: number = Date.now()): DeviceSummary {
  const live = terminals.filter((t) => t.status !== "REVOKED");
  return {
    total: live.length,
    active: terminals.filter((t) => t.status === "ACTIVE").length,
    online: terminals.filter((t) => t.status === "ACTIVE" && isOnline(t.lastSeenAt, now)).length,
    blocked: terminals.filter((t) => t.status === "DISABLED").length,
    removed: terminals.filter((t) => t.status === "REVOKED").length,
    needAttention: terminals.filter((t) => deviceAttention(t, over).length > 0).length,
    overLimit: terminals.filter((t) => over.has(t.id)).length,
  };
}
