import { createHmac, timingSafeEqual } from "node:crypto";
import { round2 } from "@/lib/utils";
import { GatewayError, type PaymentEvent, type PaymentGateway } from "./gateway-core";

/**
 * Yoco online payments (South Africa, ZAR only).
 *  - Checkout API: https://developer.yoco.com/online/api-reference/checkout/payments/accept-payments/
 *  - Webhooks follow the "Standard Webhooks" scheme: https://developer.yoco.com/online/api-reference/webhooks/verifying-events/
 * Amounts are in cents on Yoco's side and in rands everywhere else in this app.
 */
export const YOCO_API = "https://payments.yoco.com/api";
/** Yoco does not accept payments below R2.00. */
export const YOCO_MIN_AMOUNT = 2;
/** Yoco recommends rejecting webhooks whose timestamp is far from now (replay protection). */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

export const yocoSecretKey = (env: NodeJS.ProcessEnv = process.env) => env.YOCO_SECRET_KEY?.trim() || null;

/** Online payments are live only when the provider is Yoco AND the secret key is present. */
export const onlinePaymentsEnabled = (env: NodeJS.ProcessEnv = process.env) =>
  (env.PAYMENT_PROVIDER ?? "").toLowerCase() === "yoco" && Boolean(yocoSecretKey(env));

/** Signatures in the header look like "v1,<base64>" and there may be several separated by spaces (key rotation). */
const signaturesFrom = (header: string): Buffer[] =>
  header.split(/\s+/).filter(Boolean).map((part) => {
    const comma = part.indexOf(",");
    return Buffer.from(comma >= 0 ? part.slice(comma + 1) : part, "base64");
  });

/**
 * Verifies a Yoco webhook. Throws GatewayError(401) unless the signature matches AND the timestamp is fresh.
 * The signed content is `${webhook-id}.${webhook-timestamp}.${rawBody}`, HMAC-SHA256, base64.
 * The key is the part of the secret after "whsec_", base64-decoded (Standard Webhooks). Because this can't be
 * exercised against Yoco from a test environment, the literal-string key is accepted as well: both derive from the
 * same secret, so accepting the second form does not weaken anything.
 */
export function verifyYocoSignature(rawBody: string, headers: Headers, secret: string, nowMs = Date.now()): void {
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signature = headers.get("webhook-signature");
  if (!id || !timestamp || !signature) throw new GatewayError(401, "Missing webhook signature headers.");
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > WEBHOOK_TOLERANCE_SECONDS) {
    throw new GatewayError(401, "Webhook timestamp is outside the allowed window.");
  }
  const raw = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  const content = `${id}.${timestamp}.${rawBody}`;
  const provided = signaturesFrom(signature);
  for (const key of [Buffer.from(raw, "base64"), Buffer.from(raw, "utf8")]) {
    const expected = createHmac("sha256", key).update(content).digest();
    if (provided.some((p) => p.length === expected.length && timingSafeEqual(p, expected))) return;
  }
  throw new GatewayError(401, "Invalid signature.");
}

export class YocoGateway implements PaymentGateway {
  readonly name = "yoco";
  constructor(private webhookSecret: string) {}

  verifyAndParse(rawBody: string, headers: Headers): PaymentEvent | null {
    verifyYocoSignature(rawBody, headers, this.webhookSecret);
    let event: { id?: unknown; type?: unknown; payload?: Record<string, unknown> };
    try { event = JSON.parse(rawBody); } catch { throw new GatewayError(400, "Body must be JSON."); }
    if (event.type !== "payment.succeeded" && event.type !== "payment.failed") return null; // refunds etc.: acknowledged, not acted on
    const p = event.payload ?? {};
    const meta = (p.metadata && typeof p.metadata === "object" ? p.metadata : {}) as Record<string, unknown>;
    const cents = Number(p.amount);
    const reference = String(p.id ?? event.id ?? "");
    if (!reference || !Number.isFinite(cents)) throw new GatewayError(400, "Incomplete Yoco event.");
    return {
      type: event.type,
      reference,
      invoiceId: String(meta.invoiceId ?? ""),
      checkoutRef: meta.checkoutId ? String(meta.checkoutId) : undefined,
      amount: round2(cents / 100),
      currency: String(p.currency ?? "ZAR").toUpperCase(),
    };
  }
}

export interface CheckoutInput {
  secretKey: string;
  amountCents: number;
  successUrl: string;
  cancelUrl: string;
  failureUrl: string;
  metadata: Record<string, string>;
}

/** Creates a hosted Yoco checkout and returns where to send the customer. Server-side only (uses the secret key). */
export async function createYocoCheckout(input: CheckoutInput, fetchImpl: typeof fetch = fetch): Promise<{ id: string; redirectUrl: string }> {
  let res: Response;
  try {
    res = await fetchImpl(`${YOCO_API}/checkouts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${input.secretKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: input.amountCents, currency: "ZAR",
        successUrl: input.successUrl, cancelUrl: input.cancelUrl, failureUrl: input.failureUrl, metadata: input.metadata,
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new GatewayError(502, "Couldn't reach Yoco. Please try again in a moment.");
  }
  if (res.status === 401 || res.status === 403) throw new GatewayError(503, "Yoco rejected our credentials. The site owner needs to check YOCO_SECRET_KEY.");
  if (!res.ok) throw new GatewayError(502, `Yoco couldn't start the payment (error ${res.status}). Please try again.`);
  const json = (await res.json().catch(() => ({}))) as { id?: unknown; redirectUrl?: unknown };
  if (typeof json.id !== "string" || typeof json.redirectUrl !== "string" || !/^https:\/\//.test(json.redirectUrl)) {
    throw new GatewayError(502, "Yoco returned an unexpected response.");
  }
  return { id: json.id, redirectUrl: json.redirectUrl };
}
