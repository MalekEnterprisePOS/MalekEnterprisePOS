import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { hashDeviceSecret } from "@/lib/licensing/deviceSecret";
import { mapLicense } from "@/lib/mappers";
import type { ResolvedLicense } from "@/lib/licensing/server";

// Registration with the database faked: how the per-licence device limit and the PC's own details are handled.
const st = { deviceLimit: null as number | null, planTills: 2, existing: null as null | Record<string, unknown>, active: [] as { id: string; registeredAt: string }[], sets: [] as Record<string, unknown>[], updates: [] as Record<string, unknown>[], enforce: false, clockTol: 1440, alerts: [] as string[] };

vi.mock("@/lib/firebase/admin", async (orig) => {
  const real = await orig<typeof import("@/lib/firebase/admin")>();
  const termRef = { id: "TERMINAL" };
  return {
    ...real,
    adminDb: () => ({
      runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({
        get: async (target: unknown) => target === termRef
          ? { exists: st.existing !== null, data: () => st.existing }
          : { size: st.active.length, docs: st.active.map((a) => ({ id: a.id, data: () => ({ status: "ACTIVE", registeredAt: a.registeredAt, licenseId: "l1", customerId: "c1" }) })) },
        set: (_r: unknown, d: Record<string, unknown>) => { st.sets.push(d); },
        update: (_r: unknown, d: Record<string, unknown>) => { st.updates.push(d); },
      }),
      collection: (name: string) => ({
        doc: () => (name === "terminals" ? termRef : { get: async () => ({ exists: name === "settings", data: () => ({ licensing: { offlineMinHours: 168, offlineMaxHours: 360, checkIntervalMinutes: 15, clockToleranceMinutes: st.clockTol, enforceDeviceSecret: st.enforce } }) }) }),
        where: () => ({ where: () => ({}) }),
        add: async () => undefined,
      }),
    } as unknown as Firestore),
  };
});
vi.mock("@/lib/licensing/alerts", () => ({ alertAdminOnce: async (_d: unknown, _r: unknown, kind: string) => { st.alerts.push(kind); return true; }, notifyCustomer: async () => undefined }));
vi.mock("@/lib/firebase/serverAudit", () => ({ writeAudit: async () => undefined, serverAuditEntry: () => ({}) }));
vi.mock("@/lib/licensing/server", async (orig) => {
  const real = await orig<typeof import("@/lib/licensing/server")>();
  return {
    ...real,
    resolveLicense: async () => ({
      ref: { id: "l1", update: async () => undefined },
      license: mapLicense("l1", { customerId: "c1", subscriptionId: "s1", tokenPrefix: "MEP-AB12", terminalLimit: st.planTills, issueDate: "2026-01-01", expiryDate: "2999-01-01", status: "ACTIVE", revoked: false, deviceLimit: st.deviceLimit }),
      subscription: { plan: "Standard", terminalLimit: st.planTills }, state: "ACTIVE", businessName: "Acme",
    } as unknown as ResolvedLicense),
  };
});

import { POST as register } from "@/app/api/pos/terminals/register/route";

let n = 0;
const reg = (extra: Record<string, unknown> = {}) => register(new Request("http://localhost/api/pos/terminals/register", {
  method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": `198.51.100.${++n % 250 + 1}` },
  body: JSON.stringify({ token: "MEP-AAAA-BBBB-CCCC-DDDD-EEEE", hardwareId: "hardware-id-1-abcdef", deviceName: "TILL-3", version: "1.5.0", ...extra }),
}));
const active = (k: number) => Array.from({ length: k }, (_, i) => ({ id: `d${i}`, registeredAt: `2026-0${i + 1}-01T00:00:00Z` }));

beforeEach(() => { Object.assign(st, { deviceLimit: null, planTills: 2, existing: null, active: [], sets: [], updates: [], enforce: false, clockTol: 1440, alerts: [] }); });

describe("POST /api/pos/terminals/register: device limit and device details", () => {
  it("stores the MAC (cleaned up), computer name, OS and both IPs for a new PC", async () => {
    const res = await reg({ macAddress: "aa-bb-cc-dd-ee-ff", hostname: "SHOP-PC", os: "Windows 10", localIp: "192.168.0.7" });
    expect(res.status).toBe(201);
    expect(st.sets[0]).toMatchObject({ macAddress: "AA:BB:CC:DD:EE:FF", hostname: "SHOP-PC", os: "Windows 10", localIp: "192.168.0.7", publicIp: expect.stringMatching(/^198\.51\.100\./), status: "ACTIVE" });
  });
  it("still registers an older POS build that sends none of the new fields", async () => {
    const res = await reg();
    expect(res.status).toBe(201);
    expect(st.sets[0]).not.toHaveProperty("macAddress");
  });
  it("ignores a MAC address that isn't a real one", async () => {
    await reg({ macAddress: "00:00:00:00:00:00" });
    expect(st.sets[0]).not.toHaveProperty("macAddress");
  });
  it("the plan's tills are the limit when the admin hasn't set one", async () => {
    st.active = active(2);
    const res = await reg();
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "terminal_limit" });
  });
  it("an admin's higher limit lets a third PC register on a two-till plan", async () => {
    st.deviceLimit = 4; st.active = active(2);
    expect((await reg()).status).toBe(201);
  });
  it("an admin's lower limit stops a second PC registering, even on a bigger plan", async () => {
    st.planTills = 5; st.deviceLimit = 1; st.active = active(1);
    const res = await reg();
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "terminal_limit", error: expect.stringContaining("1 of 1") });
  });
  it("a PC that is already registered but no longer fits is told to block, not silently carried on", async () => {
    st.deviceLimit = 1; st.existing = { status: "ACTIVE" };
    st.active = [{ id: "d0", registeredAt: "2026-01-01T00:00:00Z" }, { id: "TERMINAL", registeredAt: "2026-06-01T00:00:00Z" }];
    const res = await reg();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ action: "block", code: "device_limit_exceeded", created: false });
  });
  it("an existing PC that fits gets 'continue' and its details refreshed", async () => {
    st.existing = { status: "ACTIVE" }; st.active = [{ id: "TERMINAL", registeredAt: "2026-01-01T00:00:00Z" }];
    const res = await reg({ macAddress: "AA:BB:CC:DD:EE:01", version: "1.6.0" });
    expect(await res.json()).toMatchObject({ action: "continue", code: null });
    expect(st.updates[0]).toMatchObject({ macAddress: "AA:BB:CC:DD:EE:01", version: "1.6.0" });
  });
});

describe("POST /api/pos/terminals/register: device secret, removed PCs and the clock", () => {
  it("a new PC gets a private device secret, shown once; only its hash is stored", async () => {
    const res = await reg();
    const j = await res.json();
    expect(j.deviceSecret).toMatch(/^dsk_/);
    expect(st.sets[0]).toMatchObject({ secretHash: hashDeviceSecret(j.deviceSecret), secretState: "bound", macChanged: false, removedBy: "" });
    expect(JSON.stringify(st.sets[0])).not.toContain(j.deviceSecret);
  });
  it("the same PC registering again with its secret is not given a second one", async () => {
    st.existing = { status: "ACTIVE", secretHash: hashDeviceSecret("dsk_mine") }; st.active = [{ id: "TERMINAL", registeredAt: "2026-01-01T00:00:00Z" }];
    const j = await (await reg({ deviceSecret: "dsk_mine" })).json();
    expect(j.deviceSecret).toBeUndefined();
    expect(st.updates[0]).toMatchObject({ secretState: "bound" });
  });
  it("a PC that was registered before secrets existed is given one", async () => {
    st.existing = { status: "ACTIVE" }; st.active = [{ id: "TERMINAL", registeredAt: "2026-01-01T00:00:00Z" }];
    const j = await (await reg()).json();
    expect(j.deviceSecret).toMatch(/^dsk_/);
    expect(st.updates[0]).toMatchObject({ secretHash: hashDeviceSecret(j.deviceSecret) });
  });
  it("a copy of the install (right id, wrong secret) is refused when blocking is on, and only flagged when it is off", async () => {
    st.existing = { status: "ACTIVE", secretHash: hashDeviceSecret("dsk_mine") }; st.active = [{ id: "TERMINAL", registeredAt: "2026-01-01T00:00:00Z" }];
    st.enforce = true;
    const blocked = await reg({ deviceSecret: "dsk_stolen" });
    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toMatchObject({ code: "device_secret_required" });
    st.enforce = false;
    expect((await reg({ deviceSecret: "dsk_stolen" })).status).toBe(200);
    expect(st.updates.at(-1)).toMatchObject({ secretState: "wrong" });
    expect(st.alerts).toContain("identity");
  });
  it("a changed MAC address is noted on the PC", async () => {
    st.existing = { status: "ACTIVE", macAddress: "AA:BB:CC:DD:EE:01", secretHash: hashDeviceSecret("s") }; st.active = [{ id: "TERMINAL", registeredAt: "2026-01-01T00:00:00Z" }];
    await reg({ deviceSecret: "s", macAddress: "AA:BB:CC:DD:EE:09" });
    expect(st.updates[0]).toMatchObject({ macChanged: true, previousMac: "AA:BB:CC:DD:EE:01", macAddress: "AA:BB:CC:DD:EE:09" });
  });
  it("a PC the customer removed can be activated again, as a fresh install with a new secret", async () => {
    st.existing = { status: "REVOKED", removedBy: "customer", secretHash: hashDeviceSecret("old") };
    const res = await reg();
    expect(res.status).toBe(201);
    const j = await res.json();
    expect(st.sets[0]).toMatchObject({ status: "ACTIVE", removedBy: "", secretHash: hashDeviceSecret(j.deviceSecret) });
  });
  it("a PC an admin unlinked can NOT come back by itself", async () => {
    st.existing = { status: "REVOKED", removedBy: "admin" };
    const res = await reg();
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "terminal_disabled" });
    expect(st.sets).toHaveLength(0);
  });
  it("a removed PC still has to fit inside the device limit to come back", async () => {
    st.existing = { status: "REVOKED", removedBy: "customer" }; st.active = active(2);
    const res = await reg();
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "terminal_limit" });
  });
  it("refuses a PC whose clock is days out, and explains", async () => {
    const res = await reg({ clientTime: new Date(Date.now() - 5 * 86_400_000).toISOString() });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "clock_invalid", error: expect.stringMatching(/5 days/) });
    expect(st.sets).toHaveLength(0);
  });
  it("stores how far off a sensible clock is", async () => {
    await reg({ clientTime: new Date(Date.now() + 120_000).toISOString() });
    expect(st.sets[0]?.clockSkewSeconds).toBeGreaterThan(100);
  });
});
