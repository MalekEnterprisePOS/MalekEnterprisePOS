/**
 * What the admin has already looked at, so the bell in the top bar only shows what is NEW to them.
 *
 * Each kind of notification is remembered by a fingerprint (the ids of the things it is about). Once the admin has seen
 * "2 overdue invoices", it stays quiet. If a third invoice goes overdue the fingerprint changes and it shows as new again.
 * Contact-form messages are tracked by time: everything up to the newest message the admin has seen counts as seen.
 */
export type AttentionKey = "overdue" | "expiring" | "drafts" | "messages";

export interface SeenState {
  /** key -> the fingerprint that was on screen when the admin last looked. */
  seen: Record<string, string>;
  /** Contact messages created at or before this moment have been seen. */
  inquiriesSeenAt: string | null;
}

export const EMPTY_SEEN: SeenState = { seen: {}, inquiriesSeenAt: null };

/** A stable identity for a list of ids: the same set gives the same text whatever order it comes in. */
export const fingerprint = (ids: string[]): string => [...ids].sort().join("|");

export const isUnseen = (state: SeenState, key: AttentionKey, fp: string): boolean => state.seen[key] !== fp;

const ms = (iso: string | null | undefined): number => { const t = iso ? Date.parse(iso) : NaN; return Number.isFinite(t) ? t : 0; };

/** The newest of some ISO times, or null for none. */
export function newestTime(times: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  for (const t of times) if (t && ms(t) > ms(best)) best = t;
  return best;
}

/** How many contact messages arrived after the last one the admin saw. */
export function unseenInquiryCount(createdAtTimes: (string | null | undefined)[], state: SeenState): number {
  const mark = ms(state.inquiriesSeenAt);
  return createdAtTimes.filter((t) => ms(t) > mark).length;
}

/** Records that these items were on screen. */
export function markItemsSeen(state: SeenState, items: { key: AttentionKey; fingerprint: string }[]): SeenState {
  if (items.length === 0) return state;
  const seen = { ...state.seen };
  for (const i of items) seen[i.key] = i.fingerprint;
  return { ...state, seen };
}

/** Records that every message up to the newest one has been seen. The newest message's own time is used, not "now", so one that
 *  arrives in the moment between loading and marking is never hidden. */
export function markInquiriesSeen(state: SeenState, createdAtTimes: (string | null | undefined)[]): SeenState {
  const newest = newestTime([state.inquiriesSeenAt, ...createdAtTimes]);
  return newest === state.inquiriesSeenAt ? state : { ...state, inquiriesSeenAt: newest };
}

/** Combines what this browser remembers with what was saved to the admin's account (so it follows them between devices). */
export function mergeSeen(local: SeenState, remote: SeenState): SeenState {
  return { seen: { ...remote.seen, ...local.seen }, inquiriesSeenAt: newestTime([local.inquiriesSeenAt, remote.inquiriesSeenAt]) };
}

/** Reads a saved value of unknown shape, never throwing: anything unusable becomes "nothing seen yet". */
export function parseSeen(raw: unknown): SeenState {
  if (!raw || typeof raw !== "object") return EMPTY_SEEN;
  const o = raw as Record<string, unknown>;
  const seen: Record<string, string> = {};
  if (o.seen && typeof o.seen === "object") {
    for (const [k, v] of Object.entries(o.seen as Record<string, unknown>)) if (typeof v === "string") seen[k] = v;
  }
  const at = typeof o.inquiriesSeenAt === "string" && ms(o.inquiriesSeenAt) > 0 ? o.inquiriesSeenAt : null;
  return { seen, inquiriesSeenAt: at };
}

/** What the dashboard knows is outstanding (only the parts the bell needs). */
export interface AttentionInput {
  overdueIds: string[];
  expiringLicenceIds: string[];
  draftReleaseIds: string[];
  inquiryTimes: string[];
}

export interface BellEntry {
  key: AttentionKey;
  fingerprint: string;
  /** How many things this entry is about (overdue invoices, new messages, ...). */
  count: number;
  /** Not seen by this admin yet. */
  unseen: boolean;
}

/**
 * The entries the bell lists, in order of importance. Overdue invoices, expiring licences and draft releases stay listed for as
 * long as they are outstanding (they are real jobs), but are only "unseen" until the admin has looked. Contact messages are listed
 * only while there are new ones: once read, they are gone from the bell.
 */
export function bellEntries(a: AttentionInput, seen: SeenState): BellEntry[] {
  const out: BellEntry[] = [];
  const add = (key: AttentionKey, ids: string[]) => { const fp = fingerprint(ids); out.push({ key, fingerprint: fp, count: ids.length, unseen: isUnseen(seen, key, fp) }); };
  if (a.overdueIds.length > 0) add("overdue", a.overdueIds);
  if (a.expiringLicenceIds.length > 0) add("expiring", a.expiringLicenceIds);
  const fresh = unseenInquiryCount(a.inquiryTimes, seen);
  if (fresh > 0) out.push({ key: "messages", fingerprint: newestTime(a.inquiryTimes) ?? "", count: fresh, unseen: true });
  if (a.draftReleaseIds.length > 0) add("drafts", a.draftReleaseIds);
  return out;
}

/** How many entries the badge on the bell shows: only the new ones. */
export const badgeCount = (entries: BellEntry[]): number => entries.filter((e) => e.unseen).length;

/** The admin has looked at the bell (or the page the entries lead to): everything listed counts as seen. */
export function markBellSeen(seen: SeenState, entries: BellEntry[], a: AttentionInput): SeenState {
  return markInquiriesSeen(markItemsSeen(seen, entries.map((e) => ({ key: e.key, fingerprint: e.fingerprint }))), a.inquiryTimes);
}
