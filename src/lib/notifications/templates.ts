/** Branded HTML for the automatic emails. Pure functions (no I/O) so they are easy to test. Everything a user or admin
 *  can type is HTML-escaped, and links are only ever http(s), so a message can't inject markup or a javascript: link. */
export interface EmailContent { title: string; message: string; ctaLabel?: string; ctaUrl?: string }
export interface EmailBrand { productName: string; supportEmail?: string }

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Only plain http(s) URLs without quotes or spaces. Anything else is dropped. */
export const safeUrl = (u?: string | null): string | null => (u && /^https?:\/\/[^\s"'<>]+$/i.test(u) ? u : null);

const NAVY = "#0C1A3D";
const GOLD = "#F2B84B";

export function renderEmail(c: EmailContent, brand: EmailBrand): { html: string; text: string } {
  const paragraphs = c.message.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const url = safeUrl(c.ctaUrl);
  const label = (c.ctaLabel ?? "").trim() || "Open";
  const body = paragraphs.map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#2A3350">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("");
  const cta = url
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px"><tr><td style="background:${GOLD};border-radius:10px"><a href="${escapeHtml(url)}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:700;color:#1A1400;text-decoration:none">${escapeHtml(label)}</a></td></tr></table>
       <p style="margin:0 0 16px;font-size:12px;line-height:1.5;color:#6B7590">If the button doesn't work, copy this link into your browser:<br><a href="${escapeHtml(url)}" style="color:#3D5AFE;word-break:break-all">${escapeHtml(url)}</a></p>`
    : "";
  const support = brand.supportEmail ? `Need help? Reply to this email or write to <a href="mailto:${escapeHtml(brand.supportEmail)}" style="color:#6B7590">${escapeHtml(brand.supportEmail)}</a>.` : "Need help? Just reply to this email.";
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(c.title)}</title></head>
<body style="margin:0;padding:0;background:#F2F4F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(paragraphs[0] ?? c.title).slice(0, 110)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F4F9;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #E3E7F0">
<tr><td style="background:${NAVY};padding:20px 28px"><span style="font-size:18px;font-weight:800;letter-spacing:.2px;color:${GOLD}">${escapeHtml(brand.productName)}</span></td></tr>
<tr><td style="padding:28px 28px 8px"><h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:${NAVY}">${escapeHtml(c.title)}</h1>${body}${cta}</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #EEF0F6;font-size:12px;line-height:1.5;color:#6B7590">${support}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [c.message.trim(), url ? `${label}: ${url}` : "", `--\n${brand.productName}${brand.supportEmail ? ` · ${brand.supportEmail}` : ""}`].filter(Boolean).join("\n\n");
  return { html, text };
}
