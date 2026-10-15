import type { InvoiceLine, InvoiceStatus } from "@/types";
import { round2 } from "@/lib/utils";

/**
 * Every price in this system is entered and shown INCLUDING VAT. The total is exactly what the lines add up to
 * (so R349.99 entered is R349.99 charged), and the VAT is the part of it that belongs to SARS:
 *   vat = total x rate / (1 + rate)      subtotal (excl. VAT) = total - vat
 */
export function calcTotals(lines: InvoiceLine[], vatRate: number) {
  const total = round2(lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0));
  const vatAmount = round2((total * vatRate) / (1 + vatRate));
  return { subtotal: round2(total - vatAmount), vatAmount, total };
}

/** The VAT-exclusive and VAT parts of a price that already includes VAT. */
export function splitVat(totalInclVat: number, vatRate: number) {
  const vat = round2((totalInclVat * vatRate) / (1 + vatRate));
  return { exVat: round2(totalInclVat - vat), vat };
}

export interface TransitionResult {
  ok: boolean;
  /** The UI must get an explicit confirmation before this transition is applied. */
  requiresConfirmation: boolean;
  reason?: string;
}

type Rule = { confirm: boolean };
const ALLOWED: Record<InvoiceStatus, Partial<Record<InvoiceStatus, Rule>>> = {
  PENDING: { PAID: { confirm: false }, OVERDUE: { confirm: false }, CANCELLED: { confirm: true } },
  OVERDUE: { PAID: { confirm: false }, PENDING: { confirm: false }, CANCELLED: { confirm: true } },
  PAID: { PENDING: { confirm: true } },
  CANCELLED: { PAID: { confirm: true }, PENDING: { confirm: true } },
};

/** Which status changes are allowed, and which ones need an explicit "are you sure". */
export function checkTransition(from: InvoiceStatus, to: InvoiceStatus): TransitionResult {
  if (from === to) return { ok: false, requiresConfirmation: false, reason: `Invoice is already ${to.toLowerCase()}.` };
  const rule = ALLOWED[from][to];
  if (!rule) {
    return { ok: false, requiresConfirmation: false, reason: `An invoice cannot move from ${from} to ${to}.` };
  }
  return { ok: true, requiresConfirmation: rule.confirm };
}

export function invoiceNumber(prefix: string, issueDate: string, sequence: number): string {
  const ym = issueDate.slice(0, 7).replace("-", "");
  return `${prefix}-${ym}-${String(sequence).padStart(4, "0")}`;
}
