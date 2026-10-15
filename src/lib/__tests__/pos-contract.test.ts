import { generateKeyPairSync } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import { HttpError } from "@/lib/firebase/admin";
import { signLease, signingKeyInfo } from "@/lib/licensing/lease";
import { canRegisterTerminal } from "@/lib/licensing/rules";
import { mapLicense } from "@/lib/mappers";
import type { ResolvedLicense } from "@/lib/licensing/server";

// What the POS (Java) relies on from the website: machine-readable refusal codes, a validated signing key, and a lenient flag report.

const st = { terminalDoc: null as null | { status: string }, activeCount: 0, state: "ACTIVE" as ResolvedLicense["state"] };

vi.mock("@/lib/firebase/admin", async (orig) => {
  const real = await orig<typeof import("@/lib/firebase/admin")>();
  const termRef = { update: () => undefined };
  return {
    ...real,
    adminDb: () => ({
      runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({
        get: async (target: unknown) => target === termRef ? { exists: st.terminalDoc !== null, data: () => st.terminalDoc } : { size: st.activeCount },
        update: () => undefined, set: () => undefined,
      }),
      collection: (name: string) => ({
        doc: () => (name === "terminals" ? termRef : { get: async () => ({ data: () => ({}) }) }),
        where: () => ({ where: () => ({}) }),
        add: async () => undefined,
      }),
    } as unknown as Firestore),
  };
});
vi.mock("@/lib/firebase/serverAudit", () => ({ writeAudit: async () => undefined, serverAuditEntry: () => ({}) }));
vi.mock("@/lib/licensing/server", async (orig) => {
  const real = await orig<typeof import("@/lib/licensing/server")>();
  const license = mapLicense("l1", { customerId: "c1", subscriptionId: "s1", tokenPrefix: "MEP-AB12", terminalLimit: 3, issueDate: "2026-01-01", expiryDate: "2027-01-01", status: "ACTIVE", revoked: false });
  return { ...real, resolveLicense: async () => ({ ref: { update: async () => undefined }, license, subscription: { plan: "Standard", terminalLimit: 3 }, state: st.state, businessName: "Acme" }) };
});

import { POST as register } from "@/app/api/pos/terminals/register/route";

let n = 0;
const reg = () => register(new Request("http://localhost/api/pos/terminals/register", {
  method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": `10.7.0.${++n}` },
  body: JSON.stringify({ token: "MEP-AAAA", hardwareId: "hw-1234567890", deviceName: "TILL-1", version: "1.0.0" }),
}));

beforeEach(() => { st.terminalDoc = null; st.activeCount = 0; st.state = "ACTIVE"; });

describe("POST /api/pos/terminals/register: refusals the POS can act on", () => {
  it("registers a new till under the limit", async () => {
    st.activeCount = 1;
    const res = await reg();
    expect(res.status).toBe(201);
    expect((await res.json()).created).toBe(true);
  });
  it("till limit reached -> 403 with code terminal_limit", async () => {
    st.activeCount = 3;
    const res = await reg();
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "terminal_limit", error: expect.stringContaining("3 of 3") });
  });
  it("a till an admin disabled -> 403 with code terminal_disabled", async () => {
    st.terminalDoc = { status: "DISABLED" };
    const res = await reg();
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "terminal_disabled" });
  });
  it("an already-registered till re-registers fine even when the limit is full (its heartbeat)", async () => {
    st.terminalDoc = { status: "ACTIVE" }; st.activeCount = 3;
    expect((await reg()).status).toBe(200);
  });
  it("a suspended licence -> 403 with code licence_inactive (distinct from the till-specific codes)", async () => {
    st.state = "SUSPENDED";
    expect(await (await reg()).json()).toMatchObject({ code: "licence_inactive" });
  });
  it("canRegisterTerminal reports the same codes", () => {
    expect(canRegisterTerminal({ state: "ACTIVE", terminalLimit: 1, activeTerminals: 1, alreadyActive: false }).code).toBe("terminal_limit");
    expect(canRegisterTerminal({ state: "REVOKED", terminalLimit: 1, activeTerminals: 0, alreadyActive: false }).code).toBe("licence_inactive");
    expect(canRegisterTerminal({ state: "ACTIVE", terminalLimit: 1, activeTerminals: 0, alreadyActive: false }).code).toBeUndefined();
  });
  it("HttpError carries an optional code", () => { expect(new HttpError(403, "x", "c").code).toBe("c"); expect(new HttpError(400, "x").code).toBeUndefined(); });
});

describe("licence signing key validation", () => {
  const pemOf = (type: "ed25519" | "rsa") => (type === "rsa" ? generateKeyPairSync("rsa", { modulusLength: 2048 }) : generateKeyPairSync("ed25519")).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const asEnv = (pem: string) => pem.replace(/\n/g, "\\n"); // the form `npm run signing-key` prints

  it("not set -> not configured", () => { vi.stubEnv("LICENSE_SIGNING_PRIVATE_KEY", ""); expect(signingKeyInfo()).toEqual({ configured: false, valid: false }); });
  it("a real Ed25519 key is valid and yields the public key to paste into the POS", () => {
    vi.stubEnv("LICENSE_SIGNING_PRIVATE_KEY", asEnv(pemOf("ed25519")));
    const info = signingKeyInfo();
    expect(info.valid).toBe(true);
    expect(info.publicKey).toMatch(/^[A-Za-z0-9+/]{59}=$/); // 44-byte Ed25519 SPKI in base64 (59 chars + one "=")
  });
  it("a random hex string (the mistake that was made) is rejected with an actionable message", () => {
    vi.stubEnv("LICENSE_SIGNING_PRIVATE_KEY", "ff8479429b7b60491d43a8860e0ebe54a0bbbc0376ae133a6ec93d6b45fbfa7c");
    const info = signingKeyInfo();
    expect(info.valid).toBe(false);
    expect(info.problem).toMatch(/not a valid PEM/);
    expect(info.problem).toMatch(/npm run signing-key/);
  });
  it("an RSA key is rejected: the POS verifies Ed25519 only", () => {
    vi.stubEnv("LICENSE_SIGNING_PRIVATE_KEY", asEnv(pemOf("rsa")));
    expect(signingKeyInfo().problem).toMatch(/Ed25519/);
  });
  it("signing with a broken key answers 503 server_misconfigured, not a mystery 500", () => {
    vi.stubEnv("LICENSE_SIGNING_PRIVATE_KEY", "not-a-key");
    try { signLease({ a: 1 }); expect.unreachable(); } catch (e) { expect(e).toMatchObject({ status: 503, code: "server_misconfigured" }); }
  });
  it("with no key the lease is still produced, unsigned (the POS then refuses it with a clear message)", () => {
    vi.stubEnv("LICENSE_SIGNING_PRIVATE_KEY", "");
    expect(signLease({ a: 1 })).toEqual({ lease: '{"a":1}', signature: null });
  });
});
