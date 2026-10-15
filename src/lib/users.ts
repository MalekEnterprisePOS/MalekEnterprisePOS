/**
 * The admin's "Users" view: everyone who has signed in to the portal PLUS every customer an admin created who has never
 * signed in, each with a single plain-English plan standing. Pure functions so the rules are easy to test.
 */
import type { Customer, Invoice, License, PortalUser, Subscription, Terminal } from "@/types";
import { daysBetween, todayISO } from "@/lib/dates";
import { computeLicenseState, effectiveDeviceLimit, isOnline } from "@/lib/licensing/rules";

export type PlanStanding =
  | "no_plan"          // signed in, never bought a plan
  | "awaiting_payment" // has an unpaid invoice and no working licence yet
  | "active"           // licence valid
  | "grace"            // payment late but tills still work
  | "expired"          // licence ran out and the grace period is over
  | "suspended";       // suspended, cancelled or revoked

export const STANDING_LABEL: Record<PlanStanding, string> = {
  no_plan: "No plan", awaiting_payment: "Awaiting payment", active: "Active", grace: "Payment late", expired: "Expired", suspended: "Suspended",
};
export const STANDING_ORDER: PlanStanding[] = ["no_plan", "awaiting_payment", "active", "grace", "expired", "suspended"];

export interface UserRow {
  /** Stable key: the sign-in uid, or "customer:<id>" for a customer who has never signed in. */
  key: string;
  signedIn: boolean;
  name: string;
  businessName: string;
  email: string;
  phone: string;
  provider: string;
  emailVerified: boolean;
  profileComplete: boolean;
  signedUpAt: string | null;
  lastLoginAt: string | null;
  loginCount: number;
  downloadClicks: number;
  lastDownloadAt: string | null;
  customerId: string | null;
  standing: PlanStanding;
  plan: string;
  terminals: number;
  expiryDate: string | null;
  /** Whole days until the licence expires (negative once it has). Null when there is no licence. */
  daysLeft: number | null;
  /** Active, but the licence runs out within 14 days. */
  expiringSoon: boolean;
  /** PCs registered and active on their licence, how many are online right now, and how many the licence allows. */
  devicesActive: number;
  devicesOnline: number;
  deviceLimit: number | null;
}

export interface UserSources { portalUsers: PortalUser[]; customers: Customer[]; subscriptions: Subscription[]; licenses: License[]; invoices: Invoice[]; terminals?: Terminal[] }

const norm = (e: string) => e.trim().toLowerCase();

function standingFor(customerId: string | null, src: UserSources, today: string) {
  if (!customerId) return { standing: "no_plan" as PlanStanding, plan: "", terminals: 0, expiryDate: null, daysLeft: null, expiringSoon: false, devicesActive: 0, devicesOnline: 0, deviceLimit: null };
  const subs = src.subscriptions.filter((s) => s.customerId === customerId);
  const sub = subs.find((s) => s.status !== "CANCELLED") ?? subs[0];
  const licences = src.licenses.filter((l) => l.customerId === customerId);
  const live = licences.filter((l) => !l.revoked && l.status !== "REVOKED").sort((a, b) => b.expiryDate.localeCompare(a.expiryDate))[0];
  const unpaid = src.invoices.some((i) => i.customerId === customerId && (i.status === "PENDING" || i.status === "OVERDUE"));
  const customer = src.customers.find((c) => c.id === customerId);
  const plan = sub?.plan || customer?.plan || "";
  const terminals = live?.terminalLimit ?? sub?.terminalLimit ?? customer?.terminals ?? 0;

  let standing: PlanStanding;
  if (live) {
    const state = computeLicenseState(live, sub?.status ?? null, today);
    standing = state === "ACTIVE" ? "active" : state === "GRACE" ? "grace" : state === "EXPIRED" ? "expired" : "suspended";
  } else if (licences.length > 0) standing = "suspended"; // every licence was revoked
  else if (unpaid) standing = "awaiting_payment";
  else if (sub?.status === "SUSPENDED" || sub?.status === "CANCELLED") standing = "suspended";
  else standing = "no_plan";

  const expiryDate = live?.expiryDate ?? null;
  const daysLeft = expiryDate ? daysBetween(today, expiryDate) : null;
  const mine = (src.terminals ?? []).filter((t) => t.customerId === customerId && t.status === "ACTIVE");
  return {
    standing, plan, terminals, expiryDate, daysLeft, expiringSoon: standing === "active" && daysLeft !== null && daysLeft <= 14,
    devicesActive: mine.length, devicesOnline: mine.filter((t) => isOnline(t.lastSeenAt)).length, deviceLimit: live ? effectiveDeviceLimit(live, sub ?? null) : null,
  };
}

export function buildUserRows(src: UserSources, today: string = todayISO()): UserRow[] {
  const byId = new Map(src.customers.map((c) => [c.id, c]));
  const byEmail = new Map(src.customers.filter((c) => c.email).map((c) => [norm(c.email), c]));
  const claimed = new Set<string>();
  const rows: UserRow[] = [];

  for (const u of src.portalUsers) {
    const customer = (u.customerId && byId.get(u.customerId)) || byEmail.get(norm(u.email)) || null;
    if (customer) claimed.add(customer.id);
    rows.push({
      key: u.id, signedIn: true, name: u.name || customer?.name || "", businessName: u.businessName || customer?.businessName || "", email: u.email, phone: u.phone || customer?.phone || "",
      provider: u.provider, emailVerified: u.emailVerified, profileComplete: u.profileComplete, signedUpAt: u.createdAt, lastLoginAt: u.lastLoginAt, loginCount: u.loginCount,
      downloadClicks: u.downloadClicks, lastDownloadAt: u.lastDownloadAt, customerId: customer?.id ?? null, ...standingFor(customer?.id ?? null, src, today),
    });
  }
  for (const c of src.customers) {
    if (claimed.has(c.id)) continue;
    rows.push({
      key: `customer:${c.id}`, signedIn: false, name: c.name, businessName: c.businessName, email: c.email, phone: c.phone, provider: "", emailVerified: false, profileComplete: true,
      signedUpAt: c.createdAt, lastLoginAt: null, loginCount: 0, downloadClicks: 0, lastDownloadAt: null, customerId: c.id, ...standingFor(c.id, src, today),
    });
  }
  return rows.sort((a, b) => (b.lastLoginAt ?? b.signedUpAt ?? "").localeCompare(a.lastLoginAt ?? a.signedUpAt ?? ""));
}

export interface UserSummary {
  total: number;
  signedIn: number;
  neverSignedIn: number;
  incompleteProfiles: number;
  expiringSoon: number;
  downloadClicks: number;
  byStanding: Record<PlanStanding, number>;
}

export function summarizeUsers(rows: UserRow[]): UserSummary {
  const byStanding = Object.fromEntries(STANDING_ORDER.map((s) => [s, 0])) as Record<PlanStanding, number>;
  for (const r of rows) byStanding[r.standing] += 1;
  return {
    total: rows.length, signedIn: rows.filter((r) => r.signedIn).length, neverSignedIn: rows.filter((r) => !r.signedIn).length,
    incompleteProfiles: rows.filter((r) => r.signedIn && !r.profileComplete).length, expiringSoon: rows.filter((r) => r.expiringSoon).length,
    downloadClicks: rows.reduce((t, r) => t + r.downloadClicks, 0), byStanding,
  };
}

/** Totals for the three download counters across all releases. */
export function summarizeDownloads(stats: { total: number; clicks: number; signedInClicks: number; guestClicks: number }[]) {
  const sum = (f: (s: (typeof stats)[number]) => number) => stats.reduce((t, s) => t + f(s), 0);
  return { clicks: sum((s) => s.clicks), completed: sum((s) => s.total), signedInClicks: sum((s) => s.signedInClicks), guestClicks: sum((s) => s.guestClicks) };
}
