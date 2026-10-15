/**
 * The timing rules every POS must follow, in one place.
 *
 *  - While a PC has internet it asks the licence server whether it may keep trading at RANDOM moments, never more than
 *    3 minutes apart (random so a PC can't predict, and so many shops don't all hit the server on the same second).
 *  - If a PC loses internet it may keep trading for a RANDOM 7 to 15 days, counted from its last successful check, then it
 *    must reach the server again or nobody can log in. The days are drawn each time a fresh lease is issued.
 *
 * The POS app enforces the same hard limits itself (it never trusts a longer wait, whatever the server says), so these are
 * also the ceilings the Settings page will accept.
 */
export const MIN_ONLINE_CHECK_SECONDS = 60;
export const MAX_ONLINE_CHECK_SECONDS = 180;
export const MIN_OFFLINE_DAYS = 7;
export const MAX_OFFLINE_DAYS = 15;

type Rand = () => number;

/** A random wait, in whole seconds, between 60 s and `maxSeconds` (never above 3 minutes). A tiny max (under 60 s) is used as is. */
export function pickCheckSeconds(maxSeconds: number, rand: Rand = Math.random): number {
  const hi = Math.min(MAX_ONLINE_CHECK_SECONDS, Math.max(1, Math.floor(maxSeconds)));
  const lo = Math.min(MIN_ONLINE_CHECK_SECONDS, hi);
  return Math.round(lo + (hi - lo) * rand());
}

/**
 * A random offline allowance, in days (fractions allowed), between `minDays` and `maxDays`, both held to 0 to 15.
 * 0 means strict: no offline trading at all. A max below the min collapses to the min.
 */
export function pickOfflineAllowanceDays(minDays: number, maxDays: number, rand: Rand = Math.random): number {
  const lo = Math.min(MAX_OFFLINE_DAYS, Math.max(0, minDays));
  const hi = Math.min(MAX_OFFLINE_DAYS, Math.max(lo, maxDays));
  return lo + (hi - lo) * rand();
}

// ── Keeping the database load under control ──────────────────────────────────────────────────

export const DEFAULT_ACTIVITY_WRITE_MINUTES = 5;
export const MAX_ACTIVITY_WRITE_MINUTES = 15;

/**
 * Whether a licence check should be WRITTEN to the database as "seen just now". A PC checks every 1 to 3 minutes, but recording
 * every one of those would be most of the website's database writes while adding nothing: "online" only needs to be accurate to a
 * few minutes. So an unchanged, recently recorded PC isn't written again until `minutes` have passed. Anything that changed
 * (a new IP, version, MAC, clock, identity state, an alert) is always written straight away. Must stay below the 30 minutes after
 * which the admin sees a PC as offline, hence the 15 minute ceiling.
 */
export function shouldRecordActivity(lastRecordedAt: string | null, minutes: number, changed: boolean, nowMs: number = Date.now()): boolean {
  if (changed) return true;
  const t = lastRecordedAt ? Date.parse(lastRecordedAt) : NaN;
  if (!Number.isFinite(t)) return true;           // never recorded
  if (t > nowMs) return true;                     // a time in the future can't be trusted
  const m = Math.min(MAX_ACTIVITY_WRITE_MINUTES, Math.max(1, minutes));
  return nowMs - t >= m * 60_000;
}
