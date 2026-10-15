import { describe, expect, it } from "vitest";
import type { Terminal } from "@/types";
import { deviceAttention, overLimitIds, summarizeDevices } from "@/lib/devices";
import { estimateLoad, FREE_DAILY_READS } from "@/lib/licensing/load";
import { shouldRecordActivity } from "@/lib/licensing/policy";
import { mapTerminal } from "@/lib/mappers";
import { terminalDetailsSchema } from "@/lib/validation/schemas";

const term = (id: string, over: Partial<Terminal> = {}): Terminal => ({
  id, createdAt: null, updatedAt: null, customerId: "c1", licenseId: "l1", shopId: null, shopName: "", deviceName: id, hardwareIdShort: id, status: "ACTIVE", localIp: "", version: "1.1.0",
  macAddress: "", hostname: "", os: "", publicIp: "", clockSkewSeconds: null, macChanged: false, previousMac: "", secretState: "bound", removedBy: "", adminLabel: "", note: "",
  registeredAt: `2026-0${id.length}-01T00:00:00.000Z`, lastSeenAt: null, ...over,
});

describe("which devices need the admin's attention", () => {
  it("flags a changed MAC, a failed identity check and a clock that is hours out, but not a device that merely hasn't proven itself", () => {
    const none = new Set<string>();
    expect(deviceAttention(term("a"), none)).toEqual([]);
    expect(deviceAttention(term("a", { macChanged: true }), none)).toEqual(["mac_changed"]);
    expect(deviceAttention(term("a", { secretState: "wrong" }), none)).toEqual(["identity"]);
    expect(deviceAttention(term("a", { secretState: "missing" }), none)).toEqual([]); // an older POS that doesn't store the secret yet: normal
    expect(deviceAttention(term("a", { clockSkewSeconds: 4000 }), none)).toEqual(["clock"]);
    expect(deviceAttention(term("a", { clockSkewSeconds: -4000 }), none)).toEqual(["clock"]);
    expect(deviceAttention(term("a", { clockSkewSeconds: 300 }), none)).toEqual([]);
  });
  it("blocked and removed devices are never flagged (already handled)", () => {
    expect(deviceAttention(term("a", { status: "DISABLED", macChanged: true }), new Set())).toEqual([]);
    expect(deviceAttention(term("a", { status: "REVOKED", secretState: "wrong" }), new Set())).toEqual([]);
  });
  it("finds the newest devices beyond a licence's limit, per licence, ignoring blocked ones", () => {
    const list = [term("a", { registeredAt: "2026-01-01T00:00:00.000Z" }), term("bb", { registeredAt: "2026-02-01T00:00:00.000Z" }), term("ccc", { registeredAt: "2026-03-01T00:00:00.000Z" }),
      term("d", { status: "DISABLED", registeredAt: "2026-00-01T00:00:00.000Z" }), term("x1", { licenseId: "l2", registeredAt: "2026-01-01T00:00:00.000Z" })];
    const over = overLimitIds(list, (l) => (l === "l1" ? 2 : 1));
    expect([...over]).toEqual(["ccc"]);
    expect(deviceAttention(list[2]!, over)).toEqual(["over_limit"]);
  });
  it("summarises the fleet for the cards", () => {
    const now = Date.parse("2026-10-05T12:00:00Z");
    const list = [term("a", { lastSeenAt: "2026-10-05T11:55:00Z" }), term("bb", { lastSeenAt: "2026-10-04T11:55:00Z", macChanged: true }), term("ccc", { status: "DISABLED" }), term("dddd", { status: "REVOKED" })];
    expect(summarizeDevices(list, new Set(), now)).toEqual({ total: 3, active: 2, online: 1, blocked: 1, removed: 1, needAttention: 1, overLimit: 0 });
  });
  it("reads the admin label and note, defaulting to empty", () => {
    expect(mapTerminal("t", { customerId: "c", licenseId: "l" })).toMatchObject({ adminLabel: "", note: "" });
    expect(mapTerminal("t", { adminLabel: "Front till", note: "Replaced PSU" })).toMatchObject({ adminLabel: "Front till", note: "Replaced PSU" });
  });
  it("the edit form accepts normal text, trims it, and refuses overlong text", () => {
    expect(terminalDetailsSchema.parse({ adminLabel: "  Front till ", shopName: "Main shop", note: "" })).toEqual({ adminLabel: "Front till", shopName: "Main shop", note: "" });
    expect(terminalDetailsSchema.safeParse({ adminLabel: "x".repeat(81), shopName: "", note: "" }).success).toBe(false);
    expect(terminalDetailsSchema.safeParse({ adminLabel: "", shopName: "", note: "x".repeat(501) }).success).toBe(false);
  });
});

describe("limiting database writes", () => {
  const now = Date.parse("2026-10-05T12:00:00Z");
  const ago = (min: number) => new Date(now - min * 60_000).toISOString();
  it("a recently recorded, unchanged PC is not written again", () => {
    expect(shouldRecordActivity(ago(1), 5, false, now)).toBe(false);
    expect(shouldRecordActivity(ago(4.9), 5, false, now)).toBe(false);
  });
  it("it is recorded once the interval has passed", () => {
    expect(shouldRecordActivity(ago(5), 5, false, now)).toBe(true);
    expect(shouldRecordActivity(ago(60), 5, false, now)).toBe(true);
  });
  it("anything that changed is recorded at once", () => {
    expect(shouldRecordActivity(ago(0.1), 5, true, now)).toBe(true);
  });
  it("a PC never recorded before, or with a time in the future, is recorded", () => {
    expect(shouldRecordActivity(null, 5, false, now)).toBe(true);
    expect(shouldRecordActivity(new Date(now + 3_600_000).toISOString(), 5, false, now)).toBe(true);
  });
  it("the interval can't be stretched past 15 minutes (the admin pages call a PC offline after 30)", () => {
    expect(shouldRecordActivity(ago(16), 600, false, now)).toBe(true);
    expect(shouldRecordActivity(ago(10), 600, false, now)).toBe(false);
  });
});

describe("the database load estimate", () => {
  it("a shop makes one request per cycle however many PCs it has, about 720 a day at the 3-minute setting", () => {
    const one = estimateLoad({ devicesPerLicence: [1], checkIntervalMinutes: 3, activityWriteMinutes: 5 });
    const twenty = estimateLoad({ devicesPerLicence: [20], checkIntervalMinutes: 3, activityWriteMinutes: 5 });
    expect(one.avgWaitSeconds).toBe(120);
    expect(one.requestsPerDay).toBe(720);
    expect(twenty.requestsPerDay).toBe(720);            // twenty PCs, still one request per cycle
    expect(twenty.checksPerDay).toBe(720 * 20);          // ...but all twenty are checked in it
  });
  it("one-request checking makes reads grow with the number of PCs, not with its square, and shows what it saves", () => {
    const small = estimateLoad({ devicesPerLicence: [2], checkIntervalMinutes: 3, activityWriteMinutes: 5 });
    const big = estimateLoad({ devicesPerLicence: [20], checkIntervalMinutes: 3, activityWriteMinutes: 5 });
    expect(big.readsPerDay / small.readsPerDay).toBeLessThan(10);   // ten times the PCs, far less than ten times the reads
    expect(big.readsWithoutBatching).toBe(big.readsPerDay * 20);    // the old way re-read the devices once per PC
    expect(small.readsWithoutBatching).toBe(small.readsPerDay * 2);
  });
  it("the recording limit cuts writes, and a longer interval cuts them more", () => {
    const five = estimateLoad({ devicesPerLicence: [4, 4, 4], checkIntervalMinutes: 3, activityWriteMinutes: 5 });
    const fifteen = estimateLoad({ devicesPerLicence: [4, 4, 4], checkIntervalMinutes: 3, activityWriteMinutes: 15 });
    expect(five.writesPerDay).toBeLessThan(five.writesWithoutThrottle / 2);
    expect(fifteen.writesPerDay).toBeLessThan(five.writesPerDay);
  });
  it("a shorter maximum wait means more requests", () => {
    const three = estimateLoad({ devicesPerLicence: [3], checkIntervalMinutes: 3, activityWriteMinutes: 5 });
    const one = estimateLoad({ devicesPerLicence: [3], checkIntervalMinutes: 1, activityWriteMinutes: 5 });
    expect(one.requestsPerDay).toBeGreaterThan(three.requestsPerDay);
    expect(one.avgWaitSeconds).toBe(60);
  });
  it("nothing online means no load, and the free allowance constant is the documented one", () => {
    expect(estimateLoad({ devicesPerLicence: [], checkIntervalMinutes: 3, activityWriteMinutes: 5 })).toMatchObject({ checksPerDay: 0, requestsPerDay: 0, readsPerDay: 0, writesPerDay: 0 });
    expect(FREE_DAILY_READS).toBe(50_000);
  });
  it("is honest about scale: a hundred typical shops (a server PC and three tills) use about 576,000 reads a day, well past the free 50,000", () => {
    const e = estimateLoad({ devicesPerLicence: Array.from({ length: 100 }, () => 4), checkIntervalMinutes: 3, activityWriteMinutes: 5 });
    expect(e.requestsPerDay).toBe(72_000);              // 100 shops x 720 requests
    expect(e.readsPerDay).toBe(576_000);                // x 8 reads (4 fixed + 4 devices)
    expect(e.readsPerDay).toBeGreaterThan(FREE_DAILY_READS);
    expect(e.readsWithoutBatching).toBe(e.readsPerDay * 4); // checking each till separately would have been four times as many
  });
});
