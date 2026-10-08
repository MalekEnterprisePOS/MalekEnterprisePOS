import { describe, expect, it } from "vitest";
import type { Customer, Invoice, License, PortalUser, Subscription } from "@/types";
import { buildUserRows, summarizeDownloads, summarizeUsers, type UserSources } from "@/lib/users";
import { isProfileComplete, profileProblem, profileSchema } from "@/lib/account/profile";
import { mapDownloadStats, mapPortalUser, mapSetupGuide } from "@/lib/mappers";
import { DEFAULT_SETUP_GUIDE } from "@/lib/constants";

const TODAY = "2026-10-03";

const cust = (id: string, over: Partial<Customer> = {}): Customer => ({ id, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: null, name: "N", businessName: `Shop ${id}`, email: `${id}@x.co`, phone: "0821234567", address: "", country: "South Africa", terminals: 1, pricePerTerminal: 100, currency: "ZAR", plan: "Standard", status: "active", subscriptionStatus: "NONE", notes: "", ...over });
const user = (id: string, over: Partial<PortalUser> = {}): PortalUser => ({ id, createdAt: "2026-09-02T00:00:00.000Z", updatedAt: null, email: `${id}@x.co`, name: "N", businessName: "S", phone: "0821234567", address: "", country: "South Africa", provider: "password", emailVerified: true, customerId: null, loginCount: 2, lastLoginAt: "2026-10-01T08:00:00.000Z", downloadClicks: 0, lastDownloadAt: null, profileComplete: true, ...over });
const sub = (customerId: string, over: Partial<Subscription> = {}): Subscription => ({ id: `s_${customerId}`, createdAt: null, updatedAt: null, customerId, plan: "Standard", terminalLimit: 2, pricePerTerminal: 100, currency: "ZAR", billingFrequency: "monthly", startDate: "2026-09-01", nextBillingDate: "2026-11-01", status: "ACTIVE", gracePeriodDays: 5, autoRenewal: true, discountPercent: 0, ...over });
const lic = (customerId: string, over: Partial<License> = {}): License => ({ id: `l_${customerId}`, createdAt: null, updatedAt: null, customerId, subscriptionId: `s_${customerId}`, tokenPrefix: "MEP-AAAA", terminalLimit: 2, issueDate: "2026-09-01", expiryDate: "2026-11-06", gracePeriodDays: 5, status: "ACTIVE", revoked: false, lastVerifiedAt: null, lastActivityAt: null, flagged: false, flagReason: "", flaggedAt: null, deviceLimit: null, lastRegeneratedAt: null, selfRemovals: [], ...over });
const inv = (customerId: string, status: Invoice["status"]): Invoice => ({ id: `i_${customerId}`, createdAt: null, updatedAt: null, number: "INV-1", customerId, subscriptionId: null, issueDate: "2026-10-01", dueDate: "2026-10-08", status, lines: [], subtotal: 100, vatRate: 0.15, vatAmount: 15, total: 115, currency: "ZAR", paidAt: null, paidBy: null, paymentMethod: null, paymentNote: "" });

const src = (over: Partial<UserSources>): UserSources => ({ portalUsers: [], customers: [], subscriptions: [], licenses: [], invoices: [], ...over });
const standingOf = (s: UserSources, key: string) => buildUserRows(s, TODAY).find((r) => r.key === key)?.standing;

describe("user plan standing", () => {
  it("signed in but never bought anything is 'no plan'", () => {
    expect(standingOf(src({ portalUsers: [user("u1")] }), "u1")).toBe("no_plan");
  });
  it("an unpaid invoice and no licence yet is 'awaiting payment'", () => {
    const s = src({ portalUsers: [user("u1", { customerId: "c1" })], customers: [cust("c1")], invoices: [inv("c1", "PENDING")] });
    expect(standingOf(s, "u1")).toBe("awaiting_payment");
  });
  it("a valid licence is 'active' and flags expiry within 14 days", () => {
    const base = src({ portalUsers: [user("u1", { customerId: "c1" })], customers: [cust("c1")], subscriptions: [sub("c1")] });
    const far = buildUserRows({ ...base, licenses: [lic("c1")] }, TODAY)[0]!;
    expect(far.standing).toBe("active");
    expect(far.expiringSoon).toBe(false);
    expect(far.daysLeft).toBe(34);
    const soon = buildUserRows({ ...base, licenses: [lic("c1", { expiryDate: "2026-10-10" })] }, TODAY)[0]!;
    expect(soon.expiringSoon).toBe(true);
    expect(soon.daysLeft).toBe(7);
  });
  it("past the expiry date but inside the grace period is 'grace'; beyond it is 'expired'", () => {
    const base = src({ portalUsers: [user("u1", { customerId: "c1" })], customers: [cust("c1")], subscriptions: [sub("c1")] });
    expect(standingOf({ ...base, licenses: [lic("c1", { expiryDate: "2026-10-01" })] }, "u1")).toBe("grace");
    expect(standingOf({ ...base, licenses: [lic("c1", { expiryDate: "2026-09-01" })] }, "u1")).toBe("expired");
  });
  it("a suspended subscription or revoked licence is 'suspended'", () => {
    const base = src({ portalUsers: [user("u1", { customerId: "c1" })], customers: [cust("c1")] });
    expect(standingOf({ ...base, subscriptions: [sub("c1", { status: "SUSPENDED" })], licenses: [lic("c1")] }, "u1")).toBe("suspended");
    expect(standingOf({ ...base, subscriptions: [sub("c1")], licenses: [lic("c1", { revoked: true, status: "REVOKED" })] }, "u1")).toBe("suspended");
  });
});

describe("matching people to customers", () => {
  it("links by customerId, or by email when the link isn't stored yet, and never lists the same customer twice", () => {
    const s = src({
      portalUsers: [user("u1", { customerId: "c1", email: "different@x.co" }), user("u2", { email: "c2@x.co" })],
      customers: [cust("c1"), cust("c2"), cust("c3")], subscriptions: [sub("c1"), sub("c2")], licenses: [lic("c1"), lic("c2")],
    });
    const rows = buildUserRows(s, TODAY);
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.key === "u1")?.customerId).toBe("c1");
    expect(rows.find((r) => r.key === "u2")?.customerId).toBe("c2");
  });
  it("shows a customer the admin created, who never signed in, as 'never signed in'", () => {
    const rows = buildUserRows(src({ customers: [cust("c9")] }), TODAY);
    expect(rows[0]).toMatchObject({ key: "customer:c9", signedIn: false, loginCount: 0 });
  });
  it("summarises counts for the dashboard and the filter pills", () => {
    const s = src({
      portalUsers: [user("u1"), user("u2", { customerId: "c1", profileComplete: false }), user("u3", { customerId: "c2", downloadClicks: 4 })],
      customers: [cust("c1"), cust("c2"), cust("c3")], subscriptions: [sub("c2")], licenses: [lic("c2", { expiryDate: "2026-10-12" })],
    });
    const sum = summarizeUsers(buildUserRows(s, TODAY));
    expect(sum.total).toBe(4);
    expect(sum.signedIn).toBe(3);
    expect(sum.neverSignedIn).toBe(1);
    expect(sum.byStanding.active).toBe(1);
    expect(sum.byStanding.no_plan).toBe(3);
    expect(sum.expiringSoon).toBe(1);
    expect(sum.incompleteProfiles).toBe(1);
    expect(sum.downloadClicks).toBe(4);
  });
});

describe("profile details", () => {
  it("accepts normal South African phone formats", () => {
    for (const phone of ["082 123 4567", "0821234567", "+27 82 123 4567", "(011) 555-0100"]) {
      expect(isProfileComplete({ name: "Sipho Khumalo", businessName: "Khumalo Hardware", phone })).toBe(true);
    }
  });
  it("asks for whatever is missing, in plain words", () => {
    expect(profileProblem({ name: "", businessName: "Shop", phone: "0821234567" })).toMatch(/full name/i);
    expect(profileProblem({ name: "Sipho", businessName: "", phone: "0821234567" })).toMatch(/shop or business/i);
    expect(profileProblem({ name: "Sipho", businessName: "Shop", phone: "abc" })).toMatch(/phone/i);
  });
  it("fills defaults and trims", () => {
    const r = profileSchema.parse({ name: "  Sipho  ", businessName: " Shop ", phone: " 0821234567 " });
    expect(r).toEqual({ name: "Sipho", businessName: "Shop", phone: "0821234567", address: "", country: "South Africa" });
  });
});

describe("mappers for the new data", () => {
  it("download stats from before click counting still show sensible clicks", () => {
    expect(mapDownloadStats("r", { total: 10 })).toMatchObject({ total: 10, clicks: 10, signedInClicks: 0, guestClicks: 0 });
    expect(mapDownloadStats("r", { total: 10, clicks: 14, signedInClicks: 9, guestClicks: 5 })).toMatchObject({ clicks: 14, signedInClicks: 9, guestClicks: 5 });
    const t = summarizeDownloads([mapDownloadStats("a", { total: 3, clicks: 5, signedInClicks: 2, guestClicks: 3 }), mapDownloadStats("b", { total: 1, clicks: 1 })]);
    expect(t).toEqual({ clicks: 6, completed: 4, signedInClicks: 2, guestClicks: 3 });
  });
  it("portal user mapper never throws on a sparse document", () => {
    expect(mapPortalUser("u", {})).toMatchObject({ id: "u", email: "", customerId: null, loginCount: 0, profileComplete: false, country: "South Africa" });
  });
  it("setup guide falls back to the built-in text, and keeps an admin's own text once saved", () => {
    const empty = mapSetupGuide(null);
    expect(empty.steps).toHaveLength(DEFAULT_SETUP_GUIDE.steps.length);
    expect(empty.headline).toBe(DEFAULT_SETUP_GUIDE.headline);
    const custom = mapSetupGuide({ headline: "Hi", steps: [{ title: "One", body: "Do it" }, { title: "", body: "" }], help: [], whatsapp: "+27 82 123 4567", videoUrl: "http://insecure.example" });
    expect(custom.steps).toEqual([{ title: "One", body: "Do it" }]);
    expect(custom.help).toEqual([]);
    expect(custom.whatsapp).toBe("27821234567");
    expect(custom.videoUrl).toBe("");
  });
});
