import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";

// The admin "Clear security flag" action with Firestore and sign-in faked.
const st = { admin: true as boolean, license: null as Record<string, unknown> | null, updates: [] as Record<string, unknown>[], audits: [] as Record<string, unknown>[] };

vi.mock("@/lib/firebase/admin", async (orig) => {
  const real = await orig<typeof import("@/lib/firebase/admin")>();
  return {
    ...real,
    requireAdmin: async () => { if (!st.admin) throw new real.HttpError(403, "Admins only."); return { uid: "a1", email: "admin@example.com" }; },
    adminDb: () => ({
      collection: () => ({ doc: () => ({
        get: async () => ({ exists: st.license !== null, id: "l1", data: () => st.license }),
        update: async (d: Record<string, unknown>) => { st.updates.push(d); },
      }) }),
    } as unknown as Firestore),
  };
});
vi.mock("@/lib/firebase/serverAudit", () => ({ writeAudit: async (_db: unknown, _a: unknown, e: Record<string, unknown>) => { st.audits.push(e); }, serverAuditEntry: () => ({}) }));

import { POST } from "@/app/api/admin/licenses/route";

const call = (body: unknown) => POST(new Request("http://localhost/api/admin/licenses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const lic = (over: Record<string, unknown> = {}) => ({ customerId: "c1", subscriptionId: "s1", tokenPrefix: "MEPOS-AB12", terminalLimit: 2, issueDate: "2026-01-01", expiryDate: "2027-01-01", status: "ACTIVE", revoked: false, ...over });

beforeEach(() => { Object.assign(st, { admin: true, license: null, updates: [], audits: [] }); });

describe("admin action: clear_flag", () => {
  it("unblocks a flagged licence, empties the reason, and keeps flaggedAt as history", async () => {
    st.license = lic({ flagged: true, flagReason: "Clock moved back" });
    const res = await call({ action: "clear_flag", licenseId: "l1" });
    expect(res.status).toBe(200);
    expect(st.updates[0]).toMatchObject({ flagged: false, flagReason: "" });
    expect(Object.keys(st.updates[0]!)).not.toContain("flaggedAt");
  });
  it("records who cleared it and what the reason was, since the document no longer keeps it", async () => {
    st.license = lic({ flagged: true, flagReason: "Clock moved back" });
    await call({ action: "clear_flag", licenseId: "l1" });
    expect(st.audits[0]).toMatchObject({ action: "license.flag_cleared", metadata: { licenseId: "l1", previousReason: "Clock moved back" } });
  });
  it("refuses to run on a licence that isn't flagged, and writes nothing", async () => {
    st.license = lic({ flagged: false });
    const res = await call({ action: "clear_flag", licenseId: "l1" });
    expect(res.status).toBe(400);
    expect(st.updates).toHaveLength(0);
    expect(st.audits).toHaveLength(0);
  });
  it("is admins-only", async () => {
    st.admin = false; st.license = lic({ flagged: true });
    expect((await call({ action: "clear_flag", licenseId: "l1" })).status).toBe(403);
    expect(st.updates).toHaveLength(0);
  });
  it("404s for an unknown licence", async () => {
    expect((await call({ action: "clear_flag", licenseId: "nope" })).status).toBe(404);
  });
});
