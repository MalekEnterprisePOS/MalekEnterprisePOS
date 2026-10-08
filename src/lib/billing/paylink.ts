import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { SITE_URL } from "@/lib/constants";

/**
 * Signed "Pay now" links for emails and WhatsApp. The link only ever lets someone pay ONE specific invoice (through
 * Yoco's own page), so it is safe to forward to an accountant. It stops working as soon as the invoice is paid or
 * cancelled. The signature stops people guessing links for other invoices.
 */
export const INVOICE_ID_RE = /^[A-Za-z0-9_-]{1,120}$/;

/** PAY_LINK_SECRET if set; otherwise derived from CRON_SECRET (stable), then the admin key. Null if nothing is configured. */
export function payLinkSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const explicit = env.PAY_LINK_SECRET;
  if (explicit && explicit.length >= 16) return explicit;
  const base = env.CRON_SECRET || env.FIREBASE_ADMIN_PRIVATE_KEY;
  return base ? createHash("sha256").update(`malek-paylink-v1:${base}`).digest("hex") : null;
}

const mac = (invoiceId: string, secret: string) => createHmac("sha256", secret).update(`pay-v1:${invoiceId}`).digest();

export const signPayToken = (invoiceId: string, secret: string) => mac(invoiceId, secret).toString("base64url");

export function verifyPayToken(invoiceId: string, token: string, secret: string): boolean {
  if (!INVOICE_ID_RE.test(invoiceId) || token.length > 100) return false;
  const given = Buffer.from(token, "base64url");
  const expected = mac(invoiceId, secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** The public pay link for an invoice, or the customer portal if no secret is configured yet. */
export function payLinkUrl(invoiceId: string, env: NodeJS.ProcessEnv = process.env): string {
  const secret = payLinkSecret(env);
  return secret && INVOICE_ID_RE.test(invoiceId) ? `${SITE_URL}/api/pay/${invoiceId}?t=${signPayToken(invoiceId, secret)}` : `${SITE_URL}/account`;
}
