import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { HttpError } from "@/lib/firebase/admin";
import { mapLicense } from "@/lib/mappers";
import { buildLease, type ResolvedLicense } from "@/lib/licensing/server";

const base = { customerId: "c1", subscriptionId: "s1", tokenPrefix: "MEPOS-AB12", terminalLimit: 2, issueDate: "2026-01-01", expiryDate: "2027-01-01", status: "ACTIVE", revoked: false };
const resolved = (over: Record<string, unknown> = {}, state: ResolvedLicense["state"] = "ACTIVE"): ResolvedLicense => ({
  ref: {} as ResolvedLicense["ref"], license: mapLicense("l1", { ...base, ...over }), subscription: null, state, businessName: "Acme Hardware",
});
const parse = (r: ReturnType<typeof buildLease>) => JSON.parse(r.lease) as Record<string, unknown>;

describe("licence data model", () => {
  it("treats licences created before this feature as not flagged", () => {
    const l = mapLicense("old", base);
    expect(l).toMatchObject({ flagged: false, flagReason: "", flaggedAt: null });
  });
  it("reads the flag fields when present", () => {
    const l = mapLicense("x", { ...base, flagged: true, flagReason: "Clock moved back", flaggedAt: "2026-09-30T10:00:00.000Z" });
    expect(l).toMatchObject({ flagged: true, flagReason: "Clock moved back" });
    expect(l.flaggedAt).toBe("2026-09-30T10:00:00.000Z");
  });
});

describe("buildLease with a flagged licence", () => {
  it("is unchanged for a normal licence", () => {
    const r = buildLease(resolved(), 7);
    expect(r.valid).toBe(true);
    expect(r.message).toBe("Licence is active.");
    expect(parse(r)).toMatchObject({ operational: true, flagged: false });
  });
  it("blocks an otherwise perfectly active, paid-up licence", () => {
    const r = buildLease(resolved({ flagged: true, flagReason: "clock" }, "ACTIVE"), 7);
    expect(r.valid).toBe(false);
    expect(r.message).toMatch(/flagged for a security review/);
    expect(parse(r)).toMatchObject({ operational: false, flagged: true, state: "ACTIVE" });
  });
  it("cannot be overridden by the caller saying the terminal is fine", () => {
    expect(buildLease(resolved({ flagged: true }), 7, { operational: true }).valid).toBe(false);
  });
  it("gives no offline allowance: the cached lease is already expired", () => {
    const p = parse(buildLease(resolved({ flagged: true }), 7));
    expect(new Date(String(p.validUntil)).getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    const ok = parse(buildLease(resolved(), 7));
    expect(new Date(String(ok.validUntil)).getTime()).toBeGreaterThan(Date.now() + 6 * 86_400_000);
  });
  it("keeps the normal non-flag messages for other blocked states", () => {
    expect(buildLease(resolved({}, "SUSPENDED"), 7).message).toMatch(/suspended/);
  });
});

// ---- POST /api/pos/license/flag --------------------------------------------------------------------------------------
const flagState = { alreadyFlagged: false, updates: [] as Record<string, unknown>[], audits: [] as Record<string, unknown>[], mails: [] as Record<string, unknown>[], unknownKey: false };

vi.mock("@/lib/firebase/admin", async (orig) => {
  const real = await orig<typeof import("@/lib/firebase/admin")>();
  return {
    ...real,
    adminDb: () => ({
      runTransaction: async (fn: (tx: unknown) => Promise<boolean>) => fn({
        get: async () => ({ data: () => ({ flagged: flagState.alreadyFlagged }) }),
        update: (_ref: unknown, data: Record<string, unknown>) => { flagState.updates.push(data); flagState.alreadyFlagged = true; },
      }),
      collection: (name: string) => ({
        add: async (d: Record<string, unknown>) => { flagState.audits.push({ name, ...d }); },
        doc: () => ({ get: async () => ({ data: () => ({ general: { supportEmail: "help@example.com", salesEmail: "sales@example.com" } }) }) }),
      }),
    } as unknown as Firestore),
  };
});
vi.mock("@/lib/licensing/server", async (orig) => {
  const real = await orig<typeof import("@/lib/licensing/server")>();
  return { ...real, resolveLicense: async () => { if (flagState.unknownKey) throw new HttpError(401, "That licence key isn't valid."); return resolved(); } };
});
vi.mock("@/lib/notifications/server", () => ({ queueAndSend: async (_db: unknown, _id: string, m: Record<string, unknown>) => { flagState.mails.push(m); return true; } }));

import { POST as flagRoute } from "@/app/api/pos/license/flag/route";

let ip = 0;
const report = (body: unknown) => flagRoute(new Request("http://localhost/api/pos/license/flag", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": `10.9.0.${++ip}` }, body: JSON.stringify(body) }));
const valid = { token: "MEPOS-AAAA-BBBB-CCCC-DDDD", hardwareId: "HW-1234567890-ABCDEF", reason: "This PC's clock appears to have been set backward." };

beforeEach(() => { Object.assign(flagState, { alreadyFlagged: false, updates: [], audits: [], mails: [], unknownKey: false }); });

describe("POST /api/pos/license/flag", () => {
  it("flags the licence, writes an audit entry, and alerts support", async () => {
    const res = await report(valid);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(flagState.updates).toHaveLength(1);
    expect(flagState.updates[0]).toMatchObject({ flagged: true, flagReason: valid.reason });
    expect(flagState.audits[0]).toMatchObject({ action: "license.flagged_by_terminal" });
    expect(flagState.mails[0]).toMatchObject({ recipient: "help@example.com" });
    expect(String(flagState.mails[0]!.message)).toContain("Acme Hardware");
  });
  it("accepts the empty hardwareId the POS sends when it has none, instead of rejecting the report", async () => {
    const res = await report({ ...valid, hardwareId: "" });
    expect(res.status).toBe(200);
    expect(flagState.updates).toHaveLength(1);
  });
  it("never stores the raw hardware id in the audit trail", async () => {
    await report(valid);
    expect(JSON.stringify(flagState.audits)).not.toContain(valid.hardwareId);
  });
  it("ignores a repeat report: no second audit entry and no second alert", async () => {
    await report(valid);
    const again = await report(valid);
    expect(await again.json()).toEqual({ ok: true, alreadyFlagged: true });
    expect(flagState.updates).toHaveLength(1);
    expect(flagState.audits).toHaveLength(1);
    expect(flagState.mails).toHaveLength(1);
  });
  it("rejects an unknown licence key and changes nothing", async () => {
    flagState.unknownKey = true;
    expect((await report(valid)).status).toBe(401);
    expect(flagState.updates).toHaveLength(0);
  });
  it("rejects a missing reason or an oversized one", async () => {
    expect((await report({ token: valid.token })).status).toBe(400);
    expect((await report({ ...valid, reason: "x".repeat(301) })).status).toBe(400);
    expect(flagState.updates).toHaveLength(0);
  });
});
