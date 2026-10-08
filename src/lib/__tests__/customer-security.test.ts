import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { HttpError } from "@/lib/httpError";
import { regenerateAvailableAt, REGENERATE_COOLDOWN_HOURS, selfRemovalAllowance } from "@/lib/licensing/rules";

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
/** What Firestore really hands back for a stored time. */
const ts = (msAgo: number) => { const d = new Date(Date.now() - msAgo); return { toDate: () => d }; };

describe("self-removal allowance", () => {
  it("counts only removals in the last 30 days", () => {
    expect(selfRemovalAllowance([ago(5), ago(40)], 3)).toMatchObject({ used: 1, left: 2 });
    expect(selfRemovalAllowance([], 3)).toMatchObject({ used: 0, left: 3, nextAvailableAt: null });
  });
  it("when the allowance is used up, says when the oldest removal stops counting", () => {
    const a = selfRemovalAllowance([ago(20), ago(10), ago(1)], 3);
    expect(a.left).toBe(0);
    expect(Date.parse(a.nextAvailableAt!)).toBeGreaterThan(Date.now() + 9 * DAY);
    expect(Date.parse(a.nextAvailableAt!)).toBeLessThan(Date.now() + 11 * DAY);
  });
  it("a limit of 0 means nobody can remove anything themselves", () => {
    expect(selfRemovalAllowance([], 0)).toMatchObject({ left: 0, nextAvailableAt: null });
  });
});

describe("key regeneration cooldown", () => {
  it("is free to use when never done, or done more than a day ago", () => {
    expect(regenerateAvailableAt(null)).toBeNull();
    expect(regenerateAvailableAt(new Date(Date.now() - (REGENERATE_COOLDOWN_HOURS + 1) * 3_600_000).toISOString())).toBeNull();
  });
  it("otherwise says when it opens again", () => {
    const at = regenerateAvailableAt(new Date(Date.now() - 3_600_000).toISOString());
    expect(Date.parse(at!)).toBeGreaterThan(Date.now() + 22 * 3_600_000);
  });
});

// ── the two routes, with the database faked ────────────────────────────────────────────────
type Rec = Record<string, unknown>;
const st = {
  fresh: true, verified: true, customerFound: true, removalsPerWindow: 3,
  terminal: null as Rec | null, license: null as Rec | null,
  updates: [] as { kind: string; id: string; data: Rec }[], audits: [] as Rec[], notices: [] as { key: string; title: string }[], secrets: [] as string[],
};
const baseLicense = (over: Rec = {}): Rec => ({ customerId: "c1", subscriptionId: "s1", tokenPrefix: "MEP-AB12", terminalLimit: 2, issueDate: "2026-01-01", expiryDate: "2999-01-01", status: "ACTIVE", revoked: false, flagged: false, ...over });
const baseTerminal = (over: Rec = {}): Rec => ({ customerId: "c1", licenseId: "l1", deviceName: "TILL-1", macAddress: "AA:BB:CC:DD:EE:01", status: "ACTIVE", ...over });

vi.mock("@/lib/firebase/admin", async (orig) => {
  const real = await orig<typeof import("@/lib/firebase/admin")>();
  const docOf = (kind: string, id: string) => {
    const data = () => (kind === "terminals" ? st.terminal : kind === "licenses" ? st.license : kind === "settings" ? { licensing: { selfRemovalsPer30Days: st.removalsPerWindow } } : {}) ?? undefined;
    return { kind, id, get: async () => ({ exists: data() !== undefined && data() !== null, id, data }), update: async (d: Rec) => { st.updates.push({ kind, id, data: d }); } };
  };
  return {
    ...real,
    requireUser: async () => ({ uid: "u1", email: "a@b.co", emailVerified: st.verified, authTime: st.fresh ? Math.floor(Date.now() / 1000) - 30 : Math.floor(Date.now() / 1000) - 3600 }),
    adminDb: () => ({
      collection: (kind: string) => ({ doc: (id: string) => docOf(kind, id), add: async (d: Rec) => { if (kind === "auditLogs") st.audits.push(d); } }),
      runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({
        get: async (ref: { kind: string; id: string; get: () => Promise<unknown> }) => ref.get(),
        update: (ref: { kind: string; id: string }, data: Rec) => { st.updates.push({ kind: ref.kind, id: ref.id, data }); },
      }),
    } as unknown as Firestore),
  };
});
vi.mock("@/lib/account/server", () => ({ findCustomerForUser: async () => (st.customerFound ? { id: "c1", businessName: "Acme", email: "a@b.co" } : null) }));
vi.mock("@/lib/licensing/alerts", () => ({ notifyCustomer: async (_d: unknown, _c: string, key: string, o: { title: string }) => { st.notices.push({ key, title: o.title }); }, alertAdminOnce: async () => true }));
vi.mock("@/lib/licensing/issue", () => ({ storeLicenseSecret: async (_d: unknown, _id: string, token: string) => { st.secrets.push(token); return true; } }));

import { POST as removeDevice } from "@/app/api/account/devices/remove/route";
import { POST as regenerate } from "@/app/api/account/licenses/regenerate/route";

let n = 0;
const post = (path: string, body: unknown) => new Request(`http://localhost${path}`, { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": `10.9.0.${++n % 250 + 1}` }, body: JSON.stringify(body) });
const remove = (id = "t1") => removeDevice(post("/api/account/devices/remove", { terminalId: id }));
const regen = () => regenerate(post("/api/account/licenses/regenerate", { licenseId: "l1" }));
const err = async (res: Response) => (await res.json()) as { error?: string; code?: string };

beforeEach(() => {
  Object.assign(st, { fresh: true, verified: true, customerFound: true, removalsPerWindow: 3, terminal: baseTerminal(), license: baseLicense(), updates: [], audits: [], notices: [], secrets: [] });
});

describe("POST /api/account/devices/remove", () => {
  it("removes the customer's own active device, frees its place, audits it and emails them", async () => {
    const res = await remove();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, removalsLeft: 2 });
    expect(st.updates.find((u) => u.kind === "terminals")?.data).toMatchObject({ status: "REVOKED", removedBy: "customer" });
    expect(st.updates.find((u) => u.kind === "licenses")?.data.selfRemovals).toHaveLength(1);
    expect(st.audits[0]).toMatchObject({ action: "terminal.removed_by_customer" });
    expect(st.notices).toEqual([{ key: "device_removed", title: expect.stringContaining("removed") }]);
  });
  it("needs a very recent sign-in: an old session is told to confirm again, and nothing changes", async () => {
    st.fresh = false;
    const res = await remove();
    expect(res.status).toBe(401);
    expect(await err(res)).toMatchObject({ code: "reauth_required" });
    expect(st.updates).toHaveLength(0);
  });
  it("needs a verified email", async () => {
    st.verified = false;
    expect((await remove()).status).toBe(403);
    expect(st.updates).toHaveLength(0);
  });
  it("won't touch another customer's device, and answers exactly like 'not found'", async () => {
    st.terminal = baseTerminal({ customerId: "someone-else" });
    const res = await remove();
    expect(res.status).toBe(404);
    st.terminal = null;
    expect((await remove("nope")).status).toBe(404);
    expect(st.updates).toHaveLength(0);
  });
  it("can't be used to dodge an admin block, or to remove a device twice", async () => {
    st.terminal = baseTerminal({ status: "DISABLED" });
    expect(await err(await remove())).toMatchObject({ code: "not_removable" });
    st.terminal = baseTerminal({ status: "REVOKED" });
    expect(await err(await remove())).toMatchObject({ code: "not_removable" });
    expect(st.updates).toHaveLength(0);
  });
  it("is refused on a flagged or revoked licence", async () => {
    st.license = baseLicense({ flagged: true });
    expect(await err(await remove())).toMatchObject({ code: "licence_flagged" });
    st.license = baseLicense({ revoked: true });
    expect((await remove()).status).toBe(403);
    expect(st.updates).toHaveLength(0);
  });
  it("stops after the monthly allowance, saying when it opens again", async () => {
    st.license = baseLicense({ selfRemovals: [ts(20 * DAY), ts(10 * DAY), ts(1 * DAY)] });
    const res = await remove();
    expect(res.status).toBe(403);
    expect(await err(res)).toMatchObject({ code: "removal_limit", error: expect.stringContaining("3 devices") });
    expect(st.updates).toHaveLength(0);
  });
  it("removals older than 30 days no longer count", async () => {
    st.license = baseLicense({ selfRemovals: [ts(40 * DAY), ts(35 * DAY), ts(31 * DAY)] });
    expect((await remove()).status).toBe(200);
  });
  it("the admin can switch self-removal off", async () => {
    st.removalsPerWindow = 0;
    expect(await err(await remove())).toMatchObject({ code: "removal_disabled" });
    expect(st.updates).toHaveLength(0);
  });
  it("needs an account, and a device id", async () => {
    st.customerFound = false;
    expect((await remove()).status).toBe(404);
    expect((await removeDevice(post("/api/account/devices/remove", {}))).status).toBe(400);
  });
});

describe("POST /api/account/licenses/regenerate", () => {
  it("replaces the key, stores the new one, audits it and emails the customer", async () => {
    const res = await regen();
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.token).toMatch(/^MEP-/);
    const upd = st.updates.find((u) => u.kind === "licenses")?.data;
    expect(upd).toMatchObject({ tokenPrefix: j.token.slice(0, 8) });
    expect(upd?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(upd?.tokenHash).not.toBe(j.token);
    expect(st.secrets).toEqual([j.token]);
    expect(st.audits[0]).toMatchObject({ action: "license.regenerated_by_customer" });
    expect(JSON.stringify(st.audits[0])).not.toContain(j.token);
    expect(st.notices.map((x) => x.key)).toEqual(["key_regenerated"]);
  });
  it("needs a recent sign-in and a verified email", async () => {
    st.fresh = false;
    expect(await err(await regen())).toMatchObject({ code: "reauth_required" });
    st.fresh = true; st.verified = false;
    expect((await regen()).status).toBe(403);
    expect(st.updates).toHaveLength(0);
  });
  it("only once a day", async () => {
    st.license = baseLicense({ lastRegeneratedAt: ts(3_600_000) });
    const res = await regen();
    expect(res.status).toBe(403);
    expect(await err(res)).toMatchObject({ code: "regen_cooldown" });
    expect(st.updates).toHaveLength(0);
  });
  it("never on someone else's, a revoked or a flagged licence", async () => {
    st.license = baseLicense({ customerId: "other" });
    expect((await regen()).status).toBe(404);
    st.license = baseLicense({ revoked: true });
    expect((await regen()).status).toBe(403);
    st.license = baseLicense({ flagged: true });
    expect(await err(await regen())).toMatchObject({ code: "licence_flagged" });
    expect(st.updates).toHaveLength(0);
  });
});

describe("requireRecentLogin", () => {
  it("accepts a sign-in from the last five minutes and refuses older or missing ones", async () => {
    const { requireRecentLogin } = await vi.importActual<typeof import("@/lib/firebase/admin")>("@/lib/firebase/admin");
    const now = 1_800_000_000_000;
    expect(() => requireRecentLogin({ authTime: now / 1000 - 60 }, 300, now)).not.toThrow();
    expect(() => requireRecentLogin({ authTime: now / 1000 - 301 }, 300, now)).toThrow(HttpError);
    expect(() => requireRecentLogin({}, 300, now)).toThrow(/confirm it's you/);
  });
});
