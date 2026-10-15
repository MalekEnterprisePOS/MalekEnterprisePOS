import { beforeEach, describe, expect, it, vi } from "vitest";

// The checkout and session routes with the database and sign-in faked, to prove the order of events and the guards.
const state = {
  user: { uid: "u1", email: "a@b.co", emailVerified: true, name: "Ann", provider: "google.com" } as null | { uid: string; email: string; emailVerified: boolean; name?: string; provider?: string },
  order: vi.fn(async () => ({ invoiceId: "inv1", customerId: "c1", total: 115 })),
  checkout: vi.fn(async () => ({ url: "https://pay.yoco.com/abc", invoiceNumber: "INV-1" })),
  touch: vi.fn(async () => undefined),
};

vi.mock("@/lib/firebase/admin", async (orig) => {
  const real = await orig<typeof import("@/lib/firebase/admin")>();
  return { ...real, adminDb: () => ({}), requireUser: async () => { if (!state.user) throw new real.HttpError(401, "Sign in to continue."); return state.user; } };
});
vi.mock("@/lib/account/server", () => ({ createOrder: (...a: unknown[]) => (state.order as (...x: unknown[]) => unknown)(...a), findCustomerForUser: async () => null }));
vi.mock("@/lib/billing/checkout", () => ({ startInvoiceCheckout: (...a: unknown[]) => (state.checkout as (...x: unknown[]) => unknown)(...a) }));
vi.mock("@/lib/account/portalUsers", () => ({ touchPortalUser: (...a: unknown[]) => (state.touch as (...x: unknown[]) => unknown)(...a), saveProfile: async () => undefined }));

import { POST as checkout } from "@/app/api/account/checkout/route";
import { POST as session } from "@/app/api/account/session/route";

let n = 0;
const post = (path: string, body: unknown) => new Request(`http://localhost${path}`, { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": `10.1.0.${++n}` }, body: JSON.stringify(body) });
const ORDER = { planId: "standard", terminals: 2, billingFrequency: "monthly" };

beforeEach(() => {
  state.user = { uid: "u1", email: "a@b.co", emailVerified: true, name: "Ann", provider: "google.com" };
  state.order.mockClear(); state.checkout.mockClear(); state.touch.mockClear();
  vi.stubEnv("PAYMENT_PROVIDER", "yoco"); vi.stubEnv("YOCO_SECRET_KEY", "sk_test_x");
});

describe("POST /api/account/checkout", () => {
  it("creates the order, then returns the hosted payment page for exactly that invoice", async () => {
    const res = await checkout(post("/api/account/checkout", ORDER));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, url: "https://pay.yoco.com/abc", invoiceId: "inv1" });
    expect(state.checkout).toHaveBeenCalledWith(expect.anything(), "inv1", { ownerCustomerId: "c1" });
  });
  it("refuses before creating any invoice when online payments are switched off", async () => {
    vi.stubEnv("PAYMENT_PROVIDER", "");
    const res = await checkout(post("/api/account/checkout", ORDER));
    expect(res.status).toBe(503);
    expect(state.order).not.toHaveBeenCalled();
  });
  it("needs a sign-in and a valid order", async () => {
    state.user = null;
    expect((await checkout(post("/api/account/checkout", ORDER))).status).toBe(401);
    state.user = { uid: "u1", email: "a@b.co", emailVerified: true };
    expect((await checkout(post("/api/account/checkout", { ...ORDER, terminals: 0 }))).status).toBe(400);
    expect(state.order).not.toHaveBeenCalled();
  });
});

describe("POST /api/account/session", () => {
  it("records the sign-in with the sign-up details from the form", async () => {
    const res = await session(post("/api/account/session", { name: "Ann", businessName: "Ann's Shop", phone: "0821234567" }));
    expect(res.status).toBe(200);
    expect(state.touch).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ uid: "u1", provider: "google.com" }), null, { details: { name: "Ann", businessName: "Ann's Shop", phone: "0821234567" }, countLogin: true });
  });
  it("still records a plain sign-in when the body is empty or junk", async () => {
    const res = await session(post("/api/account/session", { name: 42 }));
    expect(res.status).toBe(200);
    expect(state.touch).toHaveBeenCalledWith(expect.anything(), expect.anything(), null, { details: undefined, countLogin: true });
  });
  it("refuses a guest", async () => {
    state.user = null;
    expect((await session(post("/api/account/session", {}))).status).toBe(401);
    expect(state.touch).not.toHaveBeenCalled();
  });
});
