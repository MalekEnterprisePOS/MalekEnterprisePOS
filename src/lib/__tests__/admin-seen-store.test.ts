import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The store with the browser's storage and the database faked.
const remote = { exists: false, data: {} as unknown, saved: [] as unknown[], failRead: false, failWrite: false };
const storage = new Map<string, string>();

vi.mock("firebase/firestore", () => ({
  getDoc: async () => { if (remote.failRead) throw new Error("denied"); return { exists: () => remote.exists, data: () => remote.data }; },
  setDoc: async (_ref: unknown, value: unknown) => { if (remote.failWrite) throw new Error("denied"); remote.saved.push(value); },
}));
vi.mock("@/services/base", () => ({ docRef: (c: string, id: string) => ({ c, id }) }));

async function freshStore() {
  vi.resetModules();
  return import("@/services/adminSeenStore");
}

beforeEach(() => {
  vi.useFakeTimers();
  storage.clear(); remote.exists = false; remote.data = {}; remote.saved = []; remote.failRead = false; remote.failWrite = false;
  vi.stubGlobal("localStorage", { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => { storage.set(k, v); }, removeItem: (k: string) => { storage.delete(k); } });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("the admin's 'already seen' memory", () => {
  it("starts empty, and a change is visible immediately to anything listening (the badge clears at once)", async () => {
    const s = await freshStore();
    s.initSeen("admin1");
    const calls: number[] = [];
    s.subscribeSeen(() => calls.push(1));
    s.updateSeen((x) => ({ ...x, seen: { overdue: "inv1" } }));
    expect(s.getSeen().seen).toEqual({ overdue: "inv1" });
    expect(calls).toHaveLength(1);
  });

  it("is remembered after a page reload (this browser)", async () => {
    let s = await freshStore();
    s.initSeen("admin1");
    s.updateSeen((x) => ({ ...x, seen: { overdue: "inv1" }, inquiriesSeenAt: "2026-10-05T00:00:00.000Z" }));
    s = await freshStore();                       // a new page load: nothing in memory
    s.initSeen("admin1");
    expect(s.getSeen()).toEqual({ seen: { overdue: "inv1" }, inquiriesSeenAt: "2026-10-05T00:00:00.000Z" });
  });

  it("is kept separately for each admin on the same browser", async () => {
    const s = await freshStore();
    s.initSeen("admin1");
    s.updateSeen((x) => ({ ...x, seen: { overdue: "inv1" } }));
    const t = await freshStore();
    t.initSeen("admin2");
    expect(t.getSeen().seen).toEqual({});
  });

  it("is saved to the admin's account a moment later, once, even after several quick changes", async () => {
    const s = await freshStore();
    s.initSeen("admin1");
    s.updateSeen((x) => ({ ...x, seen: { overdue: "a" } }));
    s.updateSeen((x) => ({ ...x, seen: { overdue: "a", expiring: "b" } }));
    expect(remote.saved).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(remote.saved).toEqual([{ seen: { overdue: "a", expiring: "b" }, inquiriesSeenAt: null }]);
  });

  it("follows the admin to another device: what the account remembers is merged in", async () => {
    remote.exists = true; remote.data = { seen: { drafts: "r1" }, inquiriesSeenAt: "2026-10-04T00:00:00.000Z" };
    const s = await freshStore();
    s.initSeen("admin1");
    await vi.advanceTimersByTimeAsync(0);
    expect(s.getSeen()).toEqual({ seen: { drafts: "r1" }, inquiriesSeenAt: "2026-10-04T00:00:00.000Z" });
  });

  it("if the account can't be read or written (rules not deployed yet), it still works in this browser", async () => {
    remote.failRead = true; remote.failWrite = true;
    const s = await freshStore();
    s.initSeen("admin1");
    s.updateSeen((x) => ({ ...x, seen: { overdue: "inv1" } }));
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.getSeen().seen).toEqual({ overdue: "inv1" });
  });

  it("a change that changes nothing causes no work", async () => {
    const s = await freshStore();
    s.initSeen("admin1");
    const calls: number[] = [];
    s.subscribeSeen(() => calls.push(1));
    s.updateSeen((x) => x);
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toHaveLength(0);
    expect(remote.saved).toHaveLength(0);
  });

  it("corrupt saved data in the browser is ignored", async () => {
    storage.set("mep.admin.seen.v1:admin1", "{not json");
    const s = await freshStore();
    s.initSeen("admin1");
    expect(s.getSeen()).toEqual({ seen: {}, inquiriesSeenAt: null });
  });
});
