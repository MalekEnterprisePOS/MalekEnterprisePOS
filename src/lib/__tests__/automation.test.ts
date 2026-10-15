import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GatewayError, getGateway } from "@/lib/billing/gateway";
import { reminderStage } from "@/lib/billing/lifecycle";
import * as msg from "@/lib/billing/messages";
import { payLinkSecret, payLinkUrl, signPayToken, verifyPayToken } from "@/lib/billing/paylink";
import { createYocoCheckout, onlinePaymentsEnabled, verifyYocoSignature, YocoGateway } from "@/lib/billing/yoco";
import { safeNext } from "@/lib/account/safeNext";
import { mapSettings } from "@/lib/mappers";
import { formatZAR } from "@/lib/utils";
import { escapeHtml, renderEmail, safeUrl } from "@/lib/notifications/templates";

afterEach(() => { vi.unstubAllEnvs(); });
const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;

// ---- Yoco webhooks (Standard Webhooks) ------------------------------------------------------------------------------
const KEY_BYTES = Buffer.from("super-secret-signing-key-32bytes!!");
const SECRET = `whsec_${KEY_BYTES.toString("base64")}`;
const NOW = 1_800_000_000_000;
const signed = (id: string, ts: number, body: string, key: Buffer | string = KEY_BYTES) => `v1,${createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64")}`;
const headers = (id: string, ts: number, sig: string) => new Headers({ "webhook-id": id, "webhook-timestamp": String(ts), "webhook-signature": sig });

const event = (over: Record<string, unknown> = {}, metadata: Record<string, unknown> = { checkoutId: "ch_1", invoiceId: "inv_1" }) =>
  JSON.stringify({ id: "evt_1", type: "payment.succeeded", createdDate: "2026-09-30T10:00:00Z", payload: { id: "p_abc", type: "payment", amount: 57500, currency: "ZAR", status: "succeeded", metadata }, ...over });

describe("Yoco webhook signature", () => {
  const ts = NOW / 1000;
  const body = event();

  it("accepts a correctly signed, fresh event", () => {
    expect(() => verifyYocoSignature(body, headers("msg_1", ts, signed("msg_1", ts, body)), SECRET, NOW)).not.toThrow();
  });
  it("rejects a tampered body", () => {
    const sig = signed("msg_1", ts, body);
    expect(() => verifyYocoSignature(body.replace("57500", "100"), headers("msg_1", ts, sig), SECRET, NOW)).toThrow(GatewayError);
  });
  it("rejects a signature made with the wrong secret", () => {
    expect(() => verifyYocoSignature(body, headers("msg_1", ts, signed("msg_1", ts, body, Buffer.from("other"))), SECRET, NOW)).toThrow(/Invalid signature/);
  });
  it("rejects a replayed (stale) event even when the signature is valid", () => {
    const old = ts - 3600;
    expect(() => verifyYocoSignature(body, headers("msg_1", old, signed("msg_1", old, body)), SECRET, NOW)).toThrow(/timestamp/);
  });
  it("rejects missing headers", () => {
    expect(() => verifyYocoSignature(body, new Headers(), SECRET, NOW)).toThrow(/Missing/);
  });
  it("accepts when one of several space-separated signatures matches (key rotation)", () => {
    const multi = `v1,${Buffer.from("junk").toString("base64")} ${signed("msg_1", ts, body)}`;
    expect(() => verifyYocoSignature(body, headers("msg_1", ts, multi), SECRET, NOW)).not.toThrow();
  });
  it("also accepts a literal-string key derivation", () => {
    const literal = "abc123secret";
    expect(() => verifyYocoSignature(body, headers("m", ts, signed("m", ts, body, literal)), `whsec_${literal}`, NOW)).not.toThrow();
  });
});

describe("YocoGateway.verifyAndParse", () => {
  const gw = new YocoGateway(SECRET);
  const ts = Math.floor(Date.now() / 1000);
  const parse = (body: string) => gw.verifyAndParse(body, headers("msg_1", ts, signed("msg_1", ts, body)));

  it("turns cents into rands and reads the invoice from our metadata", () => {
    expect(parse(event())).toEqual({ type: "payment.succeeded", reference: "p_abc", invoiceId: "inv_1", checkoutRef: "ch_1", amount: 575, currency: "ZAR" });
  });
  it("falls back to the checkout id when our metadata is missing", () => {
    const e = parse(event({}, { checkoutId: "ch_9" }));
    expect(e?.invoiceId).toBe("");
    expect(e?.checkoutRef).toBe("ch_9");
  });
  it("acknowledges (returns null for) events it doesn't act on, such as refunds", () => {
    expect(parse(event({ type: "refund.succeeded" }))).toBeNull();
  });
  it("rejects an incomplete but correctly signed event", () => {
    expect(() => parse(JSON.stringify({ type: "payment.succeeded", payload: {} }))).toThrow(/Incomplete/);
  });
  it("is selected by getGateway only when the webhook secret is present", () => {
    expect(() => getGateway(env({ PAYMENT_PROVIDER: "yoco" }))).toThrow(/YOCO_WEBHOOK_SECRET/);
    expect(getGateway(env({ PAYMENT_PROVIDER: "yoco", YOCO_WEBHOOK_SECRET: SECRET })).name).toBe("yoco");
  });
});

describe("Yoco checkout creation", () => {
  const input = { secretKey: "sk_test_x", amountCents: 57500, successUrl: "https://s/ok", cancelUrl: "https://s/c", failureUrl: "https://s/f", metadata: { invoiceId: "inv_1" } };
  const reply = (status: number, json: unknown) => vi.fn(async () => new Response(JSON.stringify(json), { status })) as unknown as typeof fetch;

  it("posts cents + ZAR with the bearer key and returns the redirect", async () => {
    const f = reply(200, { id: "ch_1", redirectUrl: "https://c.yoco.com/abc" });
    await expect(createYocoCheckout(input, f)).resolves.toEqual({ id: "ch_1", redirectUrl: "https://c.yoco.com/abc" });
    const [url, init] = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]!;
    expect(url).toBe("https://payments.yoco.com/api/checkouts");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk_test_x");
    expect(JSON.parse(String(init.body))).toMatchObject({ amount: 57500, currency: "ZAR", metadata: { invoiceId: "inv_1" } });
  });
  it("maps a rejected key to a clear 503", async () => {
    await expect(createYocoCheckout(input, reply(401, {}))).rejects.toMatchObject({ status: 503 });
  });
  it("maps other failures and network errors to 502", async () => {
    await expect(createYocoCheckout(input, reply(500, {}))).rejects.toMatchObject({ status: 502 });
    await expect(createYocoCheckout(input, vi.fn(async () => { throw new Error("offline"); }) as unknown as typeof fetch)).rejects.toMatchObject({ status: 502 });
  });
  it("refuses a redirect that isn't https", async () => {
    await expect(createYocoCheckout(input, reply(200, { id: "ch_1", redirectUrl: "http://evil.example" }))).rejects.toMatchObject({ status: 502 });
  });
  it("online payments need BOTH the yoco provider and the secret key", () => {
    expect(onlinePaymentsEnabled(env({ PAYMENT_PROVIDER: "yoco" }))).toBe(false);
    expect(onlinePaymentsEnabled(env({ PAYMENT_PROVIDER: "yoco", YOCO_SECRET_KEY: "sk_test_x" }))).toBe(true);
    expect(onlinePaymentsEnabled(env({ PAYMENT_PROVIDER: "mock", YOCO_SECRET_KEY: "sk_test_x" }))).toBe(false);
  });
});

// ---- signed pay links -----------------------------------------------------------------------------------------------
describe("pay links", () => {
  const secret = "a".repeat(32);
  it("verifies only the invoice it was signed for", () => {
    const t = signPayToken("inv_1", secret);
    expect(verifyPayToken("inv_1", t, secret)).toBe(true);
    expect(verifyPayToken("inv_2", t, secret)).toBe(false);
    expect(verifyPayToken("inv_1", t, "b".repeat(32))).toBe(false);
    expect(verifyPayToken("inv_1", `${t}x`, secret)).toBe(false);
    expect(verifyPayToken("../etc", t, secret)).toBe(false);
  });
  it("derives its secret from PAY_LINK_SECRET, else CRON_SECRET, else nothing", () => {
    expect(payLinkSecret(env({ PAY_LINK_SECRET: "x".repeat(20) }))).toBe("x".repeat(20));
    expect(payLinkSecret(env({ CRON_SECRET: "cron" }))).toMatch(/^[0-9a-f]{64}$/);
    expect(payLinkSecret(env({}))).toBeNull();
  });
  it("falls back to the account page when no secret exists", () => {
    expect(payLinkUrl("inv_1", env({}))).toMatch(/\/account$/);
    expect(payLinkUrl("inv_1", env({ CRON_SECRET: "cron" }))).toMatch(/\/api\/pay\/inv_1\?t=/);
  });
});

// ---- reminder ladder ------------------------------------------------------------------------------------------------
describe("reminderStage", () => {
  const at = (dueDate: string, today: string, grace = 5, before = 3) => reminderStage({ dueDate, today, reminderDaysBefore: before, graceDays: grace });
  it("is quiet until the heads-up window opens", () => { expect(at("2026-10-10", "2026-10-01")).toBeNull(); });
  it("sends the heads-up inside the window, then on the due date", () => {
    expect(at("2026-10-10", "2026-10-07")).toBe("due_soon");
    expect(at("2026-10-10", "2026-10-09")).toBe("due_soon"); // a missed day can't skip it
    expect(at("2026-10-10", "2026-10-10")).toBe("due_today");
  });
  it("goes overdue, then warns on the last grace day, then stops", () => {
    expect(at("2026-10-10", "2026-10-11")).toBe("overdue");
    expect(at("2026-10-10", "2026-10-14")).toBe("overdue");
    expect(at("2026-10-10", "2026-10-15")).toBe("final_warning"); // 5 days late = last day of a 5-day grace
    expect(at("2026-10-10", "2026-10-16")).toBeNull();           // suspended: the suspension email takes over
  });
  it("copes with a 0-day and 1-day grace period", () => {
    expect(at("2026-10-10", "2026-10-11", 0)).toBeNull();
    expect(at("2026-10-10", "2026-10-11", 1)).toBe("overdue");
  });
  it("can be switched off before the due date", () => { expect(at("2026-10-10", "2026-10-09", 5, 0)).toBeNull(); });
});

// ---- email ----------------------------------------------------------------------------------------------------------
describe("email templates", () => {
  const brand = { productName: "Malek POS", supportEmail: "help@example.com" };
  it("escapes markup in everything an admin or customer could type", () => {
    const { html } = renderEmail({ title: "<script>x</script>", message: "Hi <b>there</b> & \"you\"", ctaLabel: "<i>Pay</i>", ctaUrl: "https://ok.example/p?a=1&b=2" }, brand);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>there</b>");
    expect(html).toContain("&lt;b&gt;there&lt;/b&gt; &amp; &quot;you&quot;");
    expect(html).toContain("&lt;i&gt;Pay&lt;/i&gt;");
  });
  it("only ever links to http(s) URLs", () => {
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl('https://a.example/"onclick=x')).toBeNull();
    expect(safeUrl("https://a.example/x")).toBe("https://a.example/x");
    expect(renderEmail({ title: "t", message: "m", ctaLabel: "Go", ctaUrl: "javascript:alert(1)" }, brand).html).not.toContain("javascript:");
  });
  it("includes the button and a plain-text fallback", () => {
    const { html, text } = renderEmail({ title: "Invoice", message: "Line one\n\nLine two", ctaLabel: "Pay now", ctaUrl: "https://pay.example/x" }, brand);
    expect(html).toContain('href="https://pay.example/x"');
    expect(html).toContain("Pay now");
    expect(text).toContain("Pay now: https://pay.example/x");
    expect(text).toContain("Line two");
    expect(escapeHtml("<&>")).toBe("&lt;&amp;&gt;");
  });
  it("puts a pay button in every reminder stage, and says so when payment is online", () => {
    const inv = { number: "INV-1", total: 575, dueDate: "2026-10-10" };
    for (const stage of ["due_soon", "due_today", "overdue", "final_warning"] as const) {
      const online = msg.reminder(stage, "Acme", inv, { url: "https://pay.example/x", online: true }, 5);
      expect(online.ctaLabel).toBe("Pay invoice online");
      expect(online.message).toContain("INV-1");
      expect(msg.reminder(stage, "Acme", inv, { url: "https://s/account", online: false }, 5).ctaLabel).toBe("View my invoice");
    }
    expect(msg.reminder("final_warning", "Acme", inv, { url: "u", online: true }, 5).title).toMatch(/suspended tomorrow/);
  });
});

// ---- settings + login redirect --------------------------------------------------------------------------------------
describe("download sign-in setting", () => {
  it("defaults to open downloads and keeps an explicit choice", () => {
    expect(mapSettings(null).downloads.requireLogin).toBe(false);
    expect(mapSettings({ downloads: { requireLogin: true } }).downloads.requireLogin).toBe(true);
  });
});

describe("safeNext (post-login redirect)", () => {
  it("allows same-site paths only", () => {
    expect(safeNext("/download")).toBe("/download");
    expect(safeNext("/account?tab=1")).toBe("/account?tab=1");
    for (const bad of ["https://evil.example", "//evil.example", "javascript:alert(1)", "/admin/settings", null, ""]) expect(safeNext(bad)).toBe("/account");
  });
});

describe("formatZAR", () => {
  it("is the same on the server and in every browser", () => {
    expect(formatZAR(1207.5)).toBe("R 1,207.50");
    expect(formatZAR(0)).toBe("R 0.00");
    expect(formatZAR(999.999)).toBe("R 1,000.00");
    expect(formatZAR(1234567.891)).toBe("R 1,234,567.89");
    expect(formatZAR(-350)).toBe("-R 350.00");
    expect(formatZAR(Number.NaN)).toBe("R 0.00");
  });
});
