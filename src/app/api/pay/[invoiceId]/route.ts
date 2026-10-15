import { startInvoiceCheckout } from "@/lib/billing/checkout";
import { INVOICE_ID_RE, payLinkSecret, verifyPayToken } from "@/lib/billing/paylink";
import { SITE_URL } from "@/lib/constants";
import { adminDb, HttpError, rateLimit } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

const page = (status: number, title: string, text: string) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0c1a3d;color:#fff;font-family:system-ui,sans-serif;padding:24px">
<main style="max-width:440px"><h1 style="font-size:24px;margin:0 0 8px">${title}</h1><p style="color:#b7c2dc;line-height:1.5;margin:0 0 20px">${text}</p>
<a href="${SITE_URL}/account" style="display:inline-block;background:#F2B84B;color:#1a1400;font-weight:700;text-decoration:none;padding:12px 20px;border-radius:10px">Go to my account</a></main></body>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } },
  );

/** The "Pay now" link in reminder emails. Signed, so it only works for the invoice it was made for. Sends the payer to Yoco. */
export async function GET(req: Request): Promise<Response> {
  try {
    rateLimit(req, "pay-link", 20);
    const url = new URL(req.url);
    const invoiceId = url.pathname.split("/").filter(Boolean).pop() ?? "";
    const secret = payLinkSecret();
    if (!secret || !INVOICE_ID_RE.test(invoiceId) || !verifyPayToken(invoiceId, url.searchParams.get("t") ?? "", secret)) {
      return page(404, "Link not valid", "This payment link isn't valid. Sign in to your account to pay your invoice.");
    }
    const { url: checkoutUrl } = await startInvoiceCheckout(adminDb(), invoiceId);
    return new Response(null, { status: 302, headers: { Location: checkoutUrl, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch (e) {
    if (e instanceof HttpError) return page(e.status === 409 ? 200 : e.status, e.status === 409 ? "Nothing to pay" : "Payment unavailable", e.message);
    console.error("[pay-link]", e);
    return page(500, "Something went wrong", "Please try again in a moment, or sign in to your account.");
  }
}
