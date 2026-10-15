import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { MAX_OFFLINE_DAYS, MIN_OFFLINE_DAYS, pickCheckSeconds, pickOfflineAllowanceDays } from "@/lib/licensing/policy";
import { mapSettings } from "@/lib/mappers";
import { settingsSchema } from "@/lib/validation/schemas";
import { blockCode, clockSkewSeconds, clockTooFarOff, devicesWithinLimit, effectiveDeviceLimit, humanizeSeconds, isOnline, normalizeMac, ONLINE_WINDOW_MS } from "@/lib/licensing/rules";
import { HttpError } from "@/lib/httpError";
import { mapLicense } from "@/lib/mappers";
import type { LicenseState } from "@/types";
import type { ResolvedLicense } from "@/lib/licensing/server";

// ── pure rules ─────────────────────────────────────────────────────────────────────────────
describe("MAC addresses", () => {
  it("accepts every common spelling and writes it one way", () => {
    for (const raw of ["aa:bb:cc:dd:ee:ff", "AA-BB-CC-DD-EE-FF", "aabb.ccdd.eeff", "aabbccddeeff", " AA:bb:CC:dd:EE:ff "]) expect(normalizeMac(raw)).toBe("AA:BB:CC:DD:EE:FF");
  });
  it("refuses junk and the fake addresses virtual adapters report", () => {
    for (const raw of ["", "hello", "AA:BB:CC", "00:00:00:00:00:00", "FF:FF:FF:FF:FF:FF", "AA:BB:CC:DD:EE:FF:00", undefined, null, 42]) expect(normalizeMac(raw)).toBe("");
  });
});

describe("device limit", () => {
  it("uses the admin's own limit first, then the plan's tills, then the licence's own number", () => {
    expect(effectiveDeviceLimit({ deviceLimit: 5, terminalLimit: 2 }, { terminalLimit: 3 })).toBe(5);
    expect(effectiveDeviceLimit({ deviceLimit: null, terminalLimit: 2 }, { terminalLimit: 3 })).toBe(3);
    expect(effectiveDeviceLimit({ deviceLimit: null, terminalLimit: 2 }, null)).toBe(2);
  });
  it("the licence mapper only keeps a sensible whole-number limit", () => {
    const base = { customerId: "c", tokenPrefix: "MEP-AAAA", terminalLimit: 2, issueDate: "2026-01-01", expiryDate: "2027-01-01" };
    expect(mapLicense("l", { ...base, deviceLimit: 4 }).deviceLimit).toBe(4);
    for (const bad of [0, -1, 2.5, "3", null, undefined]) expect(mapLicense("l", { ...base, deviceLimit: bad }).deviceLimit).toBeNull();
  });
  it("when too many PCs are active, the oldest registrations keep their place", () => {
    const d = (id: string, registeredAt: string, status: "ACTIVE" | "DISABLED" = "ACTIVE") => ({ id, status, registeredAt, createdAt: registeredAt });
    const devices = [d("new", "2026-09-30T10:00:00Z"), d("old", "2026-01-01T10:00:00Z"), d("blocked", "2026-02-01T10:00:00Z", "DISABLED"), d("mid", "2026-05-01T10:00:00Z")];
    expect([...devicesWithinLimit(devices, 2)].sort()).toEqual(["mid", "old"]);
    expect([...devicesWithinLimit(devices, 3)].sort()).toEqual(["mid", "new", "old"]);
    expect(devicesWithinLimit(devices, 0).size).toBe(0);
  });
  it("online means checked in within the last half hour", () => {
    const now = Date.parse("2026-10-03T12:00:00Z");
    expect(isOnline(new Date(now - 60_000).toISOString(), now)).toBe(true);
    expect(isOnline(new Date(now - ONLINE_WINDOW_MS - 1000).toISOString(), now)).toBe(false);
    expect(isOnline(null, now)).toBe(false);
  });
  it("names the reason a PC must stop, flag first", () => {
    const c = (state: LicenseState, over: object = {}) => blockCode({ state, flagged: false, ...over });
    expect(c("ACTIVE")).toBeNull();
    expect(c("GRACE")).toBeNull();
    expect(c("ACTIVE", { flagged: true })).toBe("security_flag");
    expect(c("REVOKED", { flagged: true })).toBe("security_flag");
    expect(c("REVOKED")).toBe("licence_revoked");
    expect(c("SUSPENDED")).toBe("licence_suspended");
    expect(c("EXPIRED")).toBe("licence_expired");
    expect(c("ACTIVE", { terminalStatus: "DISABLED" })).toBe("terminal_disabled");
    expect(c("ACTIVE", { terminalStatus: "REVOKED" })).toBe("terminal_removed");
    expect(c("ACTIVE", { identityInvalid: true })).toBe("device_identity_invalid");
    expect(c("ACTIVE", { clockInvalid: true })).toBe("clock_invalid");
    expect(c("ACTIVE", { overLimit: true })).toBe("device_limit_exceeded");
  });
});

describe("the timing policy", () => {
  it("checks are random between 1 and 3 minutes and never longer", () => {
    expect(pickCheckSeconds(180, () => 0)).toBe(60);
    expect(pickCheckSeconds(180, () => 1)).toBe(180);
    expect(pickCheckSeconds(180, () => 0.5)).toBe(120);
    expect(pickCheckSeconds(900, () => 1)).toBe(180);   // a larger setting is held to 3 minutes
    expect(pickCheckSeconds(60, () => 0.9)).toBe(60);
    expect(pickCheckSeconds(30, () => 0.9)).toBe(30);   // a tiny maximum is respected
    for (let i = 0; i < 200; i++) { const s = pickCheckSeconds(180); expect(s).toBeGreaterThanOrEqual(60); expect(s).toBeLessThanOrEqual(180); }
  });
  it("the offline allowance is random between the shortest and longest, held to 0 to 15 days", () => {
    expect(pickOfflineAllowanceDays(7, 15, () => 0)).toBe(7);
    expect(pickOfflineAllowanceDays(7, 15, () => 1)).toBe(15);
    expect(pickOfflineAllowanceDays(7, 15, () => 0.5)).toBe(11);
    expect(pickOfflineAllowanceDays(7, 60, () => 1)).toBe(MAX_OFFLINE_DAYS);
    expect(pickOfflineAllowanceDays(30, 40, () => 0.5)).toBe(15);
    expect(pickOfflineAllowanceDays(10, 5, () => 0.9)).toBe(10); // longest below shortest collapses to the shortest
    expect(pickOfflineAllowanceDays(0, 0, () => 0.9)).toBe(0);    // strict mode: no offline trading
    expect(MIN_OFFLINE_DAYS).toBe(7);
  });
  it("Settings: defaults are 3 minutes and 7 to 15 days, and old stored values can't break the policy", () => {
    const d = mapSettings(null).licensing;
    expect(d).toMatchObject({ checkIntervalMinutes: 3, offlineMinHours: 168, offlineMaxHours: 360 });
    const old = mapSettings({ licensing: { checkIntervalMinutes: 15, offlineMinHours: 900 } }).licensing;
    expect(old).toMatchObject({ checkIntervalMinutes: 3, offlineMinHours: 360, offlineMaxHours: 360 });
    // saved before hours existed: the old day values carry over (7 days = 168 hours, 10 days = 240 hours)
    expect(mapSettings({ licensing: { offlineGraceDays: 7, offlineMaxDays: 10 } }).licensing).toMatchObject({ offlineMinHours: 168, offlineMaxHours: 240 });
    expect(mapSettings({ licensing: { offlineGraceDays: 30 } }).licensing).toMatchObject({ offlineMinHours: 360, offlineMaxHours: 360 });
    expect(mapSettings({ licensing: { checkIntervalMinutes: 0 } }).licensing.checkIntervalMinutes).toBe(1);
  });
  it("Settings form: refuses an interval over 3 minutes, an allowance over 15 days, or a longest shorter than the shortest", () => {
    const ok = { ...mapSettings(null), licensing: { ...mapSettings(null).licensing } };
    expect(settingsSchema.safeParse(ok).success).toBe(true);
    const bad = (patch: object) => settingsSchema.safeParse({ ...ok, licensing: { ...ok.licensing, ...patch } });
    expect(bad({ checkIntervalMinutes: 4 }).success).toBe(false);
    expect(bad({ offlineMaxHours: 361 }).success).toBe(false);
    expect(bad({ offlineMinHours: 100, offlineMaxHours: 99 }).success).toBe(false);
    expect(bad({ offlineMinHours: 0, offlineMaxHours: 0 }).success).toBe(true);
    expect(bad({ offlineMinHours: 12, offlineMaxHours: 48 }).success).toBe(true); // a short, hours-long allowance is allowed
  });
});

describe("clock rules", () => {
  const now = Date.parse("2026-10-03T12:00:00Z");
  it("works out the skew from ISO text, milliseconds or seconds", () => {
    expect(clockSkewSeconds("2026-10-03T12:05:00Z", now)).toBe(300);
    expect(clockSkewSeconds(now - 60_000, now)).toBe(-60);
    expect(clockSkewSeconds(Math.floor(now / 1000) + 30, now)).toBe(30);
    for (const bad of [undefined, null, "yesterday", "", NaN]) expect(clockSkewSeconds(bad, now)).toBeNull();
  });
  it("only complains beyond the tolerance, and never when it is 0", () => {
    expect(clockTooFarOff(3599, 60)).toBe(false);
    expect(clockTooFarOff(-3601, 60)).toBe(true);
    expect(clockTooFarOff(999999, 0)).toBe(false);
    expect(clockTooFarOff(null, 60)).toBe(false);
  });
  it("says it in words", () => { expect(humanizeSeconds(-3 * 86400)).toBe("3 days"); expect(humanizeSeconds(7200)).toBe("2 hours"); expect(humanizeSeconds(90)).toBe("2 minutes"); });
});

// ── the licence check the POS calls ────────────────────────────────────────────────────────
interface Dev { id: string; status: string; registeredAt: string; lastSeenAt?: string | null; secretHash?: string; macAddress?: string; extra?: Record<string, unknown> }
const st = {
  state: "ACTIVE" as LicenseState, flagged: false, deviceLimit: null as number | null, planTills: 2, invalidKey: false,
  devices: [] as Dev[], termUpdates: [] as { id: string; data: Record<string, unknown> }[], checkMinutes: 15,
  enforce: false, clockTol: 1440, alerts: [] as string[], activityMinutes: 5, licUpdates: [] as Record<string, unknown>[], licVerified: null as string | null, licTills: null as number | null, terminalQueries: 0, batchCommits: 0,
};
/** What Firestore really hands back for a stored time. */
const asTs = (iso: string | null | undefined) => (iso ? { toDate: () => new Date(iso) } : null);
const rawOf = (id: string) => { const d = st.devices.find((x) => x.id === id); return d ? { licenseId: "l1", customerId: "c1", deviceName: d.id, status: d.status, registeredAt: d.registeredAt, lastSeenAt: asTs(d.lastSeenAt), secretHash: d.secretHash, macAddress: d.macAddress ?? "", ...(d.extra ?? {}) } : {}; };

vi.mock("@/lib/firebase/admin", async (orig) => {
  const real = await orig<typeof import("@/lib/firebase/admin")>();
  return {
    ...real,
    adminDb: () => ({
      batch: () => {
        const ops: { id: string; data: Record<string, unknown> }[] = [];
        return { update: (ref: { id: string }, data: Record<string, unknown>) => { ops.push({ id: ref.id, data }); }, commit: async () => { st.batchCommits++; st.termUpdates.push(...ops); } };
      },
      runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({
        get: async (ref: { id: string }) => ({ exists: true, data: () => rawOf(ref.id) }),
        update: (ref: { id: string }, data: Record<string, unknown>) => { st.termUpdates.push({ id: ref.id, data }); },
      }),
      collection: (name: string) => ({
        doc: (id: string) => ({
          id,
          get: async () => ({ exists: name === "settings", data: () => (name === "settings" ? { licensing: { offlineMinHours: 168, offlineMaxHours: 360, checkIntervalMinutes: st.checkMinutes, clockToleranceMinutes: st.clockTol, enforceDeviceSecret: st.enforce, activityWriteMinutes: st.activityMinutes } } : rawOf(id)) }),
          update: async (data: Record<string, unknown>) => { if (name === "terminals") st.termUpdates.push({ id, data }); },
        }),
        where: () => ({ get: async () => { st.terminalQueries++; return { docs: st.devices.map((d) => ({ id: d.id, data: () => rawOf(d.id) })) }; } }),
      }),
    } as unknown as Firestore),
  };
});
vi.mock("@/lib/licensing/alerts", () => ({ alertAdminOnce: async (_db: unknown, _ref: unknown, kind: string) => { st.alerts.push(kind); return true; }, notifyCustomer: async () => undefined }));
vi.mock("@/lib/licensing/server", async (orig) => {
  const real = await orig<typeof import("@/lib/licensing/server")>();
  return {
    ...real,
    resolveLicense: async () => {
      if (st.invalidKey) throw new HttpError(401, "That licence key isn't valid.", "invalid_key");
      const license = mapLicense("l1", { customerId: "c1", subscriptionId: "s1", tokenPrefix: "MEP-AB12", terminalLimit: st.licTills ?? st.planTills, issueDate: "2026-01-01", expiryDate: "2999-01-06", status: "ACTIVE", revoked: st.state === "REVOKED", flagged: st.flagged, deviceLimit: st.deviceLimit, lastVerifiedAt: asTs(st.licVerified) });
      return { ref: { id: "l1", update: async (d: Record<string, unknown>) => { st.licUpdates.push(d); } }, license, subscription: { plan: "Standard", terminalLimit: st.planTills, status: "ACTIVE", nextBillingDate: "2999-01-01", gracePeriodDays: 5 }, state: st.state, businessName: "Acme" } as unknown as ResolvedLicense;
    },
  };
});

import { POST as verify } from "@/app/api/pos/license/verify/route";
import { hashDeviceSecret } from "@/lib/licensing/deviceSecret";
import { terminalDocId } from "@/lib/licensing/server";

let n = 0;
const HW = (i: number) => `hardware-id-${i}-abcdef`;
const idOf = (i: number) => terminalDocId("l1", HW(i));
const dev = (i: number, status = "ACTIVE", registeredAt = `2026-0${i}-01T00:00:00Z`, extra: Partial<Dev> = {}): Dev => ({ id: idOf(i), status, registeredAt, ...extra });
const check = (i: number | null, extra: Record<string, unknown> = {}, ip?: string) => verify(new Request("http://localhost/api/pos/license/verify", {
  method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": ip ?? `203.0.113.${++n % 250 + 1}` },
  body: JSON.stringify({ token: "MEP-AAAA-BBBB-CCCC-DDDD-EEEE", ...(i === null ? {} : { hardwareId: HW(i) }), ...extra }),
}));
const update = (key: string) => st.termUpdates.find((u) => key in u.data)?.data;

beforeEach(() => { Object.assign(st, { state: "ACTIVE", flagged: false, deviceLimit: null, planTills: 2, invalidKey: false, devices: [], termUpdates: [], checkMinutes: 15, enforce: false, clockTol: 1440, alerts: [], activityMinutes: 5, licUpdates: [], licVerified: null, licTills: null, terminalQueries: 0, batchCommits: 0 }); });

describe("POST /api/pos/license/verify: continue or block", () => {
  it("continues for a healthy registered PC, and records its MAC, name, OS and IPs", async () => {
    st.devices = [dev(1)];
    const res = await check(1, { macAddress: "aa-bb-cc-dd-ee-ff", hostname: "TILL-1", os: "Windows 11", localIp: "192.168.1.20", version: "1.5.0" });
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j).toMatchObject({ action: "continue", code: null, valid: true, deviceLimit: 2, devicesInUse: 1 });
    expect(j.checkAgainInSeconds).toBeGreaterThanOrEqual(60);
    expect(j.checkAgainInSeconds).toBeLessThanOrEqual(180);
    expect(update("macAddress")).toMatchObject({ macAddress: "AA:BB:CC:DD:EE:FF", hostname: "TILL-1", os: "Windows 11", localIp: "192.168.1.20", version: "1.5.0", publicIp: expect.stringMatching(/^203\.0\.113\./) });
  });
  it("the wait before the next check is random, within the Settings maximum, and never over 3 minutes", async () => {
    st.devices = [dev(1)];
    st.checkMinutes = 1;
    expect((await (await check(1)).json()).checkAgainInSeconds).toBe(60);
    st.checkMinutes = 3;
    const seen = new Set<number>();
    for (let i = 0; i < 25; i++) {
      const s = (await (await check(1)).json()).checkAgainInSeconds as number;
      expect(s).toBeGreaterThanOrEqual(60);
      expect(s).toBeLessThanOrEqual(180);
      seen.add(s);
    }
    expect(seen.size).toBeGreaterThan(5); // genuinely varies from check to check
    st.checkMinutes = 15; // an old stored value can't push it past 3 minutes
    for (let i = 0; i < 10; i++) expect((await (await check(1)).json()).checkAgainInSeconds).toBeLessThanOrEqual(180);
  });
  it("the signed lease lets the PC trade offline for a random 7 to 15 days", async () => {
    st.devices = [dev(1)];
    const days = new Set<number>();
    for (let i = 0; i < 25; i++) {
      const lease = JSON.parse((await (await check(1)).json()).lease) as { issuedAt: string; validUntil: string };
      const d = (Date.parse(lease.validUntil) - Date.parse(lease.issuedAt)) / 86_400_000;
      expect(d).toBeGreaterThanOrEqual(7 - 0.001);
      expect(d).toBeLessThanOrEqual(15 + 0.001);
      days.add(Math.round(d * 100));
    }
    expect(days.size).toBeGreaterThan(5);
  });
  it("a blocked PC gets no offline time at all", async () => {
    st.devices = [dev(1)]; st.state = "REVOKED";
    const lease = JSON.parse((await (await check(1)).json()).lease) as { issuedAt: string; validUntil: string; operational: boolean };
    expect(lease.operational).toBe(false);
    expect(Date.parse(lease.validUntil)).toBeLessThanOrEqual(Date.parse(lease.issuedAt));
  });
  it("blocks a revoked, suspended or expired licence, saying which", async () => {
    st.devices = [dev(1)];
    for (const [state, code] of [["REVOKED", "licence_revoked"], ["SUSPENDED", "licence_suspended"], ["EXPIRED", "licence_expired"]] as const) {
      st.state = state;
      expect(await (await check(1)).json()).toMatchObject({ action: "block", code, valid: false });
    }
  });
  it("blocks a flagged licence even though payment is fine", async () => {
    st.devices = [dev(1)]; st.flagged = true;
    expect(await (await check(1)).json()).toMatchObject({ action: "block", code: "security_flag" });
  });
  it("blocks a PC the admin disabled, and leaves no new trace of it", async () => {
    st.devices = [dev(1, "DISABLED")];
    const j = await (await check(1, { macAddress: "AA:BB:CC:DD:EE:FF" })).json();
    expect(j).toMatchObject({ action: "block", code: "terminal_disabled", message: expect.stringContaining("disabled") });
    expect(st.termUpdates).toHaveLength(0);
  });
  it("tells a PC the customer removed that it was removed", async () => {
    st.devices = [dev(1, "REVOKED")];
    expect(await (await check(1)).json()).toMatchObject({ action: "block", code: "terminal_removed", message: expect.stringContaining("removed") });
  });
  it("blocks the NEWEST PCs when more are active than the limit allows, keeps the old ones going, and alerts the admin", async () => {
    st.planTills = 2; st.devices = [dev(1), dev(2), dev(3)];
    expect(await (await check(1)).json()).toMatchObject({ action: "continue" });
    expect(await (await check(2)).json()).toMatchObject({ action: "continue" });
    expect(st.alerts).toEqual([]);
    const third = await (await check(3)).json();
    expect(third).toMatchObject({ action: "block", code: "device_limit_exceeded", devicesInUse: 3, deviceLimit: 2, message: expect.stringContaining("limit of 2") });
    expect(JSON.parse(third.lease)).toMatchObject({ operational: false, terminalStatus: "OVER_LIMIT", blockCode: "device_limit_exceeded" });
    expect(st.alerts).toEqual(["overLimit"]);
  });
  it("an admin's custom limit beats the plan: 3 devices on a 2-till plan are fine with a limit of 3", async () => {
    st.planTills = 2; st.deviceLimit = 3; st.devices = [dev(1), dev(2), dev(3)];
    expect(await (await check(3)).json()).toMatchObject({ action: "continue", deviceLimit: 3 });
  });
  it("lowering the limit takes effect at the next check", async () => {
    st.deviceLimit = 1; st.devices = [dev(1), dev(2)];
    expect(await (await check(1)).json()).toMatchObject({ action: "continue" });
    expect(await (await check(2)).json()).toMatchObject({ action: "block", code: "device_limit_exceeded" });
  });
  it("a disabled PC doesn't use up a place", async () => {
    st.planTills = 2; st.devices = [dev(1), dev(2, "DISABLED"), dev(3)];
    expect(await (await check(3)).json()).toMatchObject({ action: "continue", devicesInUse: 2 });
  });
  it("an unregistered PC is allowed to check (the server PC checks before it registers its tills)", async () => {
    st.devices = [dev(1)];
    expect(await (await check(9)).json()).toMatchObject({ action: "continue" });
    expect(await (await check(null)).json()).toMatchObject({ action: "continue" });
  });
  it("an unknown key is refused with code invalid_key, which the POS treats as a block", async () => {
    st.invalidKey = true;
    const res = await check(1);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "invalid_key" });
  });
});

describe("POST /api/pos/license/verify: is this really the PC that registered?", () => {
  it("a device registered before secrets existed is handed one on its next check, once", async () => {
    st.devices = [dev(1)];
    const j = await (await check(1)).json();
    expect(j.deviceSecret).toMatch(/^dsk_/);
    expect(update("secretHash")).toMatchObject({ secretHash: hashDeviceSecret(j.deviceSecret), secretState: "bound" });
  });
  it("a PC that shows the right secret carries on and isn't given another", async () => {
    st.devices = [dev(1, "ACTIVE", "2026-01-01T00:00:00Z", { secretHash: hashDeviceSecret("dsk_mine") })];
    const j = await (await check(1, { deviceSecret: "dsk_mine" })).json();
    expect(j).toMatchObject({ action: "continue" });
    expect(j.deviceSecret).toBeUndefined();
    expect(update("secretState")).toMatchObject({ secretState: "bound" });
  });
  it("a PC with the WRONG secret (a copied install) is flagged and the admin is told, but keeps working until blocking is switched on", async () => {
    st.devices = [dev(1, "ACTIVE", "2026-01-01T00:00:00Z", { secretHash: hashDeviceSecret("dsk_mine") })];
    expect(await (await check(1, { deviceSecret: "dsk_stolen" })).json()).toMatchObject({ action: "continue" });
    expect(update("secretState")).toMatchObject({ secretState: "wrong" });
    expect(st.alerts).toContain("identity");
  });
  it("with blocking switched on, a wrong or missing secret is blocked", async () => {
    st.enforce = true;
    st.devices = [dev(1, "ACTIVE", "2026-01-01T00:00:00Z", { secretHash: hashDeviceSecret("dsk_mine") })];
    expect(await (await check(1, { deviceSecret: "dsk_stolen" })).json()).toMatchObject({ action: "block", code: "device_identity_invalid" });
    expect(await (await check(1)).json()).toMatchObject({ action: "block", code: "device_identity_invalid" });
    expect(await (await check(1, { deviceSecret: "dsk_mine" })).json()).toMatchObject({ action: "continue" });
  });
  it("a changed MAC address is flagged, remembered and reported, but is not a block", async () => {
    st.devices = [dev(1, "ACTIVE", "2026-01-01T00:00:00Z", { macAddress: "AA:BB:CC:DD:EE:01", secretHash: hashDeviceSecret("s") })];
    expect(await (await check(1, { deviceSecret: "s", macAddress: "AA:BB:CC:DD:EE:02" })).json()).toMatchObject({ action: "continue" });
    expect(update("macChanged")).toMatchObject({ macChanged: true, previousMac: "AA:BB:CC:DD:EE:01", macAddress: "AA:BB:CC:DD:EE:02" });
    expect(st.alerts).toContain("macChanged");
  });
  it("the same MAC again changes nothing", async () => {
    st.devices = [dev(1, "ACTIVE", "2026-01-01T00:00:00Z", { macAddress: "AA:BB:CC:DD:EE:01", secretHash: hashDeviceSecret("s") })];
    await check(1, { deviceSecret: "s", macAddress: "aa-bb-cc-dd-ee-01" });
    expect(update("macChanged")).toBeUndefined();
    expect(st.alerts).toEqual([]);
  });
});

describe("POST /api/pos/license/verify: checking the shop's tills in one request", () => {
  const clientOf = (i: number, extra: Record<string, unknown> = {}) => ({ hardwareId: HW(i), ...extra });
  const verdicts = async (res: Response) => ((await res.json()).clients ?? []) as { hardwareId: string; action: string; code: string | null; message: string; terminalStatus?: string; deviceSecret?: string }[];

  it("answers for every till in one go, and reads the licence's devices from the database ONCE however many tills there are", async () => {
    st.planTills = 12; st.devices = [dev(1), ...Array.from({ length: 9 }, (_, k) => dev(k + 2, "ACTIVE", `2026-0${(k % 9) + 1}-02T00:00:00Z`))];
    const res = await check(1, { clients: [2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => clientOf(i)) });
    const v = await verdicts(res);
    expect(v).toHaveLength(9);
    expect(v.every((x) => x.action === "continue" && x.code === null)).toBe(true);
    expect(st.terminalQueries).toBe(1); // ten PCs checked, one read of the device list (was ten reads of ten devices each)
  });

  it("each till gets its own verdict: blocked, removed, over the limit, unknown", async () => {
    st.planTills = 3;
    st.devices = [dev(1, "ACTIVE", "2026-01-01T00:00:00Z"), dev(2, "ACTIVE", "2026-02-01T00:00:00Z"), dev(3, "ACTIVE", "2026-03-01T00:00:00Z"), dev(4, "DISABLED"), dev(5, "REVOKED"), dev(6, "ACTIVE", "2026-06-01T00:00:00Z")];
    const v = await verdicts(await check(1, { clients: [2, 3, 4, 5, 6, 9].map((i) => clientOf(i)) }));
    const by = Object.fromEntries(v.map((x) => [x.hardwareId, x]));
    expect(by[HW(2)]).toMatchObject({ action: "continue", code: null, message: "" });
    expect(by[HW(3)]).toMatchObject({ action: "continue" });
    expect(by[HW(4)]).toMatchObject({ action: "block", code: "terminal_disabled" });
    expect(by[HW(5)]).toMatchObject({ action: "block", code: "terminal_removed" });
    expect(by[HW(6)]).toMatchObject({ action: "block", code: "device_limit_exceeded" }); // the 4th active PC on a 3-till licence
    expect(by[HW(9)]).toMatchObject({ action: "continue", terminalStatus: "UNREGISTERED" }); // never registered: the server PC then registers it
  });

  it("a blocked till's reason is spelled out, an allowed till's reply stays tiny", async () => {
    st.devices = [dev(1), dev(2, "DISABLED"), dev(3, "ACTIVE", "2026-03-01T00:00:00Z", { secretHash: hashDeviceSecret("s3") })];
    const v = await verdicts(await check(1, { clients: [clientOf(2), clientOf(3, { deviceSecret: "s3" })] }));
    expect(v[0]!.message).toMatch(/disabled/i);
    expect(v[1]).toEqual({ hardwareId: HW(3), terminalStatus: "ACTIVE", action: "continue", code: null, message: "" });
  });

  it("a licence that is blocked blocks every till in the reply too", async () => {
    st.state = "REVOKED"; st.devices = [dev(1), dev(2), dev(3)];
    const res = await check(1, { clients: [clientOf(2), clientOf(3)] });
    const j = await res.json();
    expect(j).toMatchObject({ action: "block", code: "licence_revoked" });
    expect((j.clients as { code: string }[]).map((c) => c.code)).toEqual(["licence_revoked", "licence_revoked"]);
  });

  it("all the PCs' 'seen' records go out as ONE batched write", async () => {
    st.planTills = 5; st.devices = [dev(1), dev(2), dev(3), dev(4)];
    await check(1, { clients: [clientOf(2), clientOf(3), clientOf(4)] });
    expect(st.batchCommits).toBe(1);
    const seenWrites = st.termUpdates.filter((u) => "lastSeenAt" in u.data); // (the one-time secret hand-outs are separate)
    expect(seenWrites.map((u) => u.id).sort()).toEqual([1, 2, 3, 4].map(idOf).sort());
  });

  it("an unchanged till seen a minute ago is not written again, even inside a batch", async () => {
    const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
    st.planTills = 3; st.licVerified = minsAgo(1);
    const settled = (i: number, seen: string) => dev(i, "ACTIVE", `2026-0${i}-01T00:00:00Z`, { lastSeenAt: seen, secretHash: hashDeviceSecret("s"), extra: { secretState: "bound", publicIp: "198.51.100.7" } });
    st.devices = [settled(1, minsAgo(1)), settled(2, minsAgo(1)), settled(3, minsAgo(8))];
    await check(1, { deviceSecret: "s" , clients: [clientOf(2, { deviceSecret: "s" }), clientOf(3, { deviceSecret: "s" })] }, "198.51.100.7");
    expect(st.termUpdates.map((u) => u.id)).toEqual([idOf(3)]); // only the one not recorded for 8 minutes
  });

  it("the requesting PC is never checked twice, and the tills are only reported when asked for", async () => {
    st.devices = [dev(1), dev(2)];
    expect(await verdicts(await check(1, { clients: [clientOf(1), clientOf(2)] }))).toHaveLength(1);
    const plain = await (await check(1)).json();
    expect(plain.clients).toBeUndefined();
  });

  it("a till with a wrong device secret is flagged and alerted, and blocked once blocking is on", async () => {
    st.devices = [dev(1), dev(2, "ACTIVE", "2026-02-01T00:00:00Z", { secretHash: hashDeviceSecret("real") })];
    let v = await verdicts(await check(1, { clients: [clientOf(2, { deviceSecret: "copied" })] }));
    expect(v[0]).toMatchObject({ action: "continue" });
    expect(st.alerts).toContain("identity");
    st.enforce = true;
    v = await verdicts(await check(1, { clients: [clientOf(2, { deviceSecret: "copied" })] }));
    expect(v[0]).toMatchObject({ action: "block", code: "device_identity_invalid" });
  });

  it("a till registered before secrets existed is handed one in the reply", async () => {
    st.devices = [dev(1), dev(2)];
    const v = await verdicts(await check(1, { clients: [clientOf(2)] }));
    expect(v[0]!.deviceSecret).toMatch(/^dsk_/);
  });

  it("a till is checked with ITS OWN details, never the requesting PC's clock", async () => {
    st.planTills = 3; st.devices = [dev(1), dev(2)];
    await check(1, { clientTime: new Date(Date.now() - 5 * 86_400_000).toISOString(), clients: [clientOf(2, { macAddress: "AA:BB:CC:00:00:02", hostname: "TILL-2" })] });
    const forTill = st.termUpdates.find((u) => u.id === idOf(2) && "lastSeenAt" in u.data)!.data;
    expect(forTill).toMatchObject({ macAddress: "AA:BB:CC:00:00:02", hostname: "TILL-2" });
    expect(forTill).not.toHaveProperty("clockSkewSeconds");
  });

  it("refuses a request listing more than 200 tills, and a malformed till", async () => {
    st.devices = [dev(1)];
    const many = Array.from({ length: 201 }, (_, i) => ({ hardwareId: `hardware-id-${i}-abcdef` }));
    expect((await check(1, { clients: many })).status).toBe(400);
    expect((await check(1, { clients: [{ hardwareId: "x" }] })).status).toBe(400);
  });
});

describe("POST /api/pos/license/verify: keeping database writes down", () => {
  const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
  const IP = "198.51.100.7";
  const same = { hostname: "TILL-1", os: "Windows 11", localIp: "192.168.1.20", version: "1.1.0", publicIp: IP, macAddress: "AA:BB:CC:DD:EE:01" };
  const body = { hostname: "TILL-1", os: "Windows 11", localIp: "192.168.1.20", version: "1.1.0", macAddress: "AA:BB:CC:DD:EE:01", deviceSecret: "s" };
  const known = (seen: string, extra: Record<string, unknown> = {}): Dev => dev(1, "ACTIVE", "2026-01-01T00:00:00Z", { lastSeenAt: seen, secretHash: hashDeviceSecret("s"), macAddress: "AA:BB:CC:DD:EE:01", extra: { ...same, secretState: "bound", deviceName: "test", ...extra } });

  it("an unchanged PC seen a minute ago is NOT written again, and the licence record isn't either", async () => {
    st.devices = [known(minsAgo(1))]; st.licVerified = minsAgo(1);
    expect(await (await check(1, body, IP)).json()).toMatchObject({ action: "continue" });
    expect(st.termUpdates).toHaveLength(0);
    expect(st.licUpdates).toHaveLength(0);
  });
  it("it is still told to continue, with the same answer, whether or not it was recorded", async () => {
    st.devices = [known(minsAgo(1))]; st.licVerified = minsAgo(1);
    const j = await (await check(1, body, IP)).json();
    expect(j).toMatchObject({ action: "continue", code: null, valid: true, deviceLimit: 2 });
  });
  it("after the recording interval it is written (the PC and the licence)", async () => {
    st.devices = [known(minsAgo(6))]; st.licVerified = minsAgo(6);
    await check(1, body, IP);
    expect(update("lastSeenAt")).toBeDefined();
    expect(st.licUpdates).toHaveLength(1);
  });
  it("the interval is the Settings value", async () => {
    st.activityMinutes = 2; st.devices = [known(minsAgo(3))]; st.licVerified = minsAgo(3);
    await check(1, body, IP);
    expect(update("lastSeenAt")).toBeDefined();
    st.termUpdates = []; st.activityMinutes = 10;
    await check(1, body, IP);
    expect(st.termUpdates).toHaveLength(0);
  });
  it("a changed version, IP or hostname is written at once", async () => {
    st.devices = [known(minsAgo(1))]; st.licVerified = minsAgo(1);
    await check(1, { ...body, version: "1.2.0" }, IP);
    expect(update("version")).toMatchObject({ version: "1.2.0" });
    st.termUpdates = [];
    await check(1, body, "198.51.100.99");
    expect(update("publicIp")).toMatchObject({ publicIp: "198.51.100.99" });
  });
  it("a clock that has moved is written at once, but jitter of a couple of minutes is not", async () => {
    st.devices = [known(minsAgo(1), { clockSkewSeconds: 0 })]; st.licVerified = minsAgo(1);
    await check(1, { ...body, clientTime: new Date(Date.now() + 60_000).toISOString() }, IP);
    expect(st.termUpdates).toHaveLength(0);
    await check(1, { ...body, clientTime: new Date(Date.now() + 10 * 60_000).toISOString() }, IP);
    expect(update("clockSkewSeconds")).toBeDefined();
  });
  it("a changed MAC address and a failed identity check are always written and always alerted", async () => {
    st.devices = [known(minsAgo(1))]; st.licVerified = minsAgo(1);
    await check(1, { ...body, macAddress: "AA:BB:CC:DD:EE:99" }, IP);
    expect(update("macChanged")).toMatchObject({ macChanged: true });
    st.termUpdates = []; st.alerts = [];
    await check(1, { ...body, deviceSecret: "stolen" }, IP);
    expect(update("secretState")).toMatchObject({ secretState: "wrong" });
    expect(st.alerts).toContain("identity");
  });
  it("a licence whose number of tills changed on the plan is written at once, even if it was recorded a minute ago", async () => {
    st.licTills = 3; st.planTills = 5; // the licence record still says 3, the plan now says 5
    st.devices = [known(minsAgo(1))]; st.licVerified = minsAgo(1);
    await check(1, body, IP);
    expect(st.licUpdates).toHaveLength(1);
    expect(st.licUpdates[0]).toMatchObject({ terminalLimit: 5 });
  });
});

describe("POST /api/pos/license/verify: the PC's clock", () => {
  const later = (ms: number) => new Date(Date.now() + ms).toISOString();
  it("records how far off the clock is, and carries on when it is only a little", async () => {
    st.devices = [dev(1)];
    const j = await (await check(1, { clientTime: later(5 * 60_000) })).json();
    expect(j).toMatchObject({ action: "continue" });
    expect(update("clockSkewSeconds")?.clockSkewSeconds).toBeGreaterThan(250);
  });
  it("blocks a PC whose clock is days out, explains how to fix it, and unblocks by itself once it is right", async () => {
    st.devices = [dev(1)];
    const bad = await (await check(1, { clientTime: later(-3 * 86_400_000) })).json();
    expect(bad).toMatchObject({ action: "block", code: "clock_invalid", message: expect.stringMatching(/3 days.*Correct the clock/) });
    expect(await (await check(1, { clientTime: later(0) })).json()).toMatchObject({ action: "continue" });
  });
  it("a tolerance of 0 switches the check off", async () => {
    st.devices = [dev(1)]; st.clockTol = 0;
    expect(await (await check(1, { clientTime: later(-30 * 86_400_000) })).json()).toMatchObject({ action: "continue" });
  });
  it("an older POS that sends no time is not blocked", async () => {
    st.devices = [dev(1)];
    expect(await (await check(1)).json()).toMatchObject({ action: "continue" });
  });
  it("epoch seconds sent by mistake are understood", async () => {
    st.devices = [dev(1)];
    expect(await (await check(1, { clientTime: Math.floor(Date.now() / 1000) })).json()).toMatchObject({ action: "continue" });
  });
});

// ── the admin command ──────────────────────────────────────────────────────────────────────
describe("admin action: set_device_limit", () => {
  const adm = { updates: [] as Record<string, unknown>[], audits: [] as Record<string, unknown>[], admin: true };
  beforeEach(() => { adm.updates = []; adm.audits = []; adm.admin = true; vi.resetModules(); });

  async function run(body: unknown) {
    vi.doMock("@/lib/firebase/admin", async (orig) => {
      const real = await orig<typeof import("@/lib/firebase/admin")>();
      return {
        ...real,
        requireAdmin: async () => { if (!adm.admin) throw new real.HttpError(403, "Admins only."); return { uid: "a1", email: "admin@example.com" }; },
        adminDb: () => ({ collection: () => ({ doc: () => ({ get: async () => ({ exists: true, id: "l1", data: () => ({ customerId: "c1", subscriptionId: "s1", tokenPrefix: "MEP-AB12", terminalLimit: 2, issueDate: "2026-01-01", expiryDate: "2027-01-01", status: "ACTIVE", revoked: false, deviceLimit: 2 }) }), update: async (d: Record<string, unknown>) => { adm.updates.push(d); } }) }) } as unknown as Firestore),
      };
    });
    vi.doMock("@/lib/firebase/serverAudit", () => ({ writeAudit: async (_d: unknown, _a: unknown, e: Record<string, unknown>) => { adm.audits.push(e); }, serverAuditEntry: () => ({}) }));
    const { POST } = await import("@/app/api/admin/licenses/route");
    return POST(new Request("http://localhost/api/admin/licenses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  }

  it("saves a limit and audits the change", async () => {
    const res = await run({ action: "set_device_limit", licenseId: "l1", deviceLimit: 6 });
    expect(res.status).toBe(200);
    expect(adm.updates[0]).toMatchObject({ deviceLimit: 6 });
    expect(adm.audits[0]).toMatchObject({ action: "license.device_limit_changed", metadata: { licenseId: "l1", from: 2, to: 6 } });
  });
  it("null puts the licence back on the plan's number of tills", async () => {
    expect((await run({ action: "set_device_limit", licenseId: "l1", deviceLimit: null })).status).toBe(200);
    expect(adm.updates[0]).toMatchObject({ deviceLimit: null });
  });
  it("refuses zero, fractions and silly numbers, and writes nothing", async () => {
    for (const deviceLimit of [0, -3, 2.5, 5000, "4"]) expect((await run({ action: "set_device_limit", licenseId: "l1", deviceLimit })).status).toBe(400);
    expect(adm.updates).toHaveLength(0);
  });
  it("is admins-only", async () => {
    adm.admin = false;
    expect((await run({ action: "set_device_limit", licenseId: "l1", deviceLimit: 4 })).status).toBe(403);
    expect(adm.updates).toHaveLength(0);
  });
});
