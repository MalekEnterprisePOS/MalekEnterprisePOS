import { NextResponse } from "next/server";
import { z } from "zod";
import { INVOICE_ID_RE, payLinkSecret, payLinkUrl } from "@/lib/billing/paylink";
import { adminDb, HttpError, rateLimit, readJson, requireAdmin, route } from "@/lib/firebase/admin";
import { onlinePaymentsEnabled } from "@/lib/billing/yoco";

export const dynamic = "force-dynamic";
const body = z.object({ invoiceId: z.string().min(1).max(120) });

/** Admin: get the shareable payment link for an invoice (to paste into WhatsApp or an email). */
export const POST = route(async (req) => {
  rateLimit(req, "admin-paylink", 60);
  await requireAdmin(req);
  const parsed = body.safeParse(await readJson(req));
  if (!parsed.success || !INVOICE_ID_RE.test(parsed.data.invoiceId)) throw new HttpError(400, "Invalid request.");
  if (!payLinkSecret()) throw new HttpError(503, "Set CRON_SECRET (or PAY_LINK_SECRET) so payment links can be signed.");
  const snap = await adminDb().collection("invoices").doc(parsed.data.invoiceId).get();
  if (!snap.exists) throw new HttpError(404, "Invoice not found.");
  const status = String(snap.data()?.status ?? "");
  if (status === "PAID" || status === "CANCELLED") throw new HttpError(409, `This invoice is ${status.toLowerCase()}, so it can't be paid.`);
  return NextResponse.json({ ok: true, url: payLinkUrl(parsed.data.invoiceId), online: onlinePaymentsEnabled() });
});
