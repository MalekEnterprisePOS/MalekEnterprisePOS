import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The payment webhook route with Firestore and the invoice-settling code faked: proves signature checking, how the
// invoice is found, and that only verified payments reach applyPaymentEvent (which activates the licence).
const applied: unknown[] = [];
let checkoutLookup: string | null = null;

vi.mock("@/lib/firebase/admin", async (orig) => {
  const real = await orig<typeof import("@/lib/firebase/admin")>();
  return {
    ...real,
    adminDb: () => ({ collection: () => ({ where: () => ({ limit: () => ({ get: async () => ({ docs: checkoutLookup ? [{ id: checkoutLookup }] : [] }) }) }) }) }),
  };
});
vi.mock("@/lib/billing/payments", () => ({ applyPaymentEvent: async (_db: unknown, event: unknown, provider: string) => { applied.push({ event, provider }); return { recorded: "succeeded" }; } }));

import { POST } from "@/app/api/webhooks/payments/route";

const KEY = Buffer.from("test-signing-key-for-webhooks-123");
const SECRET = `whsec_${KEY.toString("base64")}`;
let n = 0;
const send = (body: string, opts: { sign?: boolean; ageSeconds?: number } = {}) => {
  const ts = Math.floor(Date.now() / 1000) - (opts.ageSeconds ?? 0);
  const id = `msg_${++n}`;
  const sig = opts.sign === false ? "v1,AAAA" : `v1,${createHmac("sha256", KEY).update(`${id}.${ts}.${body}`).digest("base64")}`;
  return POST(new Request("http://localhost/api/webhooks/payments", {
    method: "POST", body, headers: { "webhook-id": id, "webhook-timestamp": String(ts), "webhook-signature": sig, "x-forwarded-for": `10.1.0.${n}` },
  }));
};
const evt = (metadata: Record<string, unknown>, type = "payment.succeeded") =>
  JSON.stringify({ id: "evt", type, payload: { id: "p_1", amount: 120750, currency: "ZAR", metadata } });

beforeEach(() => { applied.length = 0; checkoutLookup = null; vi.stubEnv("PAYMENT_PROVIDER", "yoco"); vi.stubEnv("YOCO_WEBHOOK_SECRET", SECRET); });

describe("payments webhook (Yoco)", () => {
  it("rejects an unsigned / forged request and does not touch any invoice", async () => {
    expect((await send(evt({ invoiceId: "inv_1" }), { sign: false })).status).toBe(401);
    expect(applied).toHaveLength(0);
  });
  it("rejects a replayed old request even with a valid signature", async () => {
    expect((await send(evt({ invoiceId: "inv_1" }), { ageSeconds: 3600 })).status).toBe(401);
    expect(applied).toHaveLength(0);
  });
  it("applies a verified payment to the invoice named in our metadata (R1,207.50 from 120750 cents)", async () => {
    const res = await send(evt({ invoiceId: "inv_1", checkoutId: "ch_1" }));
    expect(res.status).toBe(200);
    expect(applied).toEqual([{ provider: "yoco", event: { type: "payment.succeeded", reference: "p_1", invoiceId: "inv_1", checkoutRef: "ch_1", amount: 1207.5, currency: "ZAR" } }]);
  });
  it("finds the invoice by checkout id when the metadata didn't come back", async () => {
    checkoutLookup = "inv_from_lookup";
    const res = await send(evt({ checkoutId: "ch_9" }));
    expect(res.status).toBe(200);
    expect((applied[0] as { event: { invoiceId: string } }).event.invoiceId).toBe("inv_from_lookup");
  });
  it("answers 200 'unmatched' (so Yoco stops retrying) when no invoice can be found", async () => {
    const res = await send(evt({ checkoutId: "ch_unknown" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ unmatched: true });
    expect(applied).toHaveLength(0);
  });
  it("acknowledges but ignores events it doesn't act on, such as refunds", async () => {
    const res = await send(evt({ invoiceId: "inv_1" }, "refund.succeeded"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ignored: true });
    expect(applied).toHaveLength(0);
  });
});
