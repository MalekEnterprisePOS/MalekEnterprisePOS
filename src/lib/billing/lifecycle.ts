import type { BillingFrequency, InvoiceStatus, SubscriptionStatus } from "@/types";
import { addMonths, daysBetween } from "@/lib/dates";
import { round2 } from "@/lib/utils";

export const MONTHS_PER_CYCLE: Record<BillingFrequency, number> = { monthly: 1, quarterly: 3, annual: 12 };

export function advanceBillingDate(from: string, frequency: BillingFrequency): string {
  return addMonths(from, MONTHS_PER_CYCLE[frequency]);
}

/** Price per terminal is a monthly rate; longer cycles bill several months at once, less any discount (in percent) for paying that way. */
export function cycleAmount(terminalLimit: number, pricePerTerminal: number, frequency: BillingFrequency, discountPercent = 0): number {
  return round2(terminalLimit * pricePerTerminal * MONTHS_PER_CYCLE[frequency] * (1 - discountPercent / 100));
}

/** The price of one terminal for one whole cycle after the discount: what goes on an invoice line as the unit price. */
export function cycleUnitPrice(pricePerTerminal: number, frequency: BillingFrequency, discountPercent = 0): number {
  return round2(pricePerTerminal * MONTHS_PER_CYCLE[frequency] * (1 - discountPercent / 100));
}

export interface InvoiceFact {
  status: InvoiceStatus;
  dueDate: string;
}

const isUnpaid = (s: InvoiceStatus) => s === "PENDING" || s === "OVERDUE";

/**
 * Derives what a subscription's status should be from its invoices.
 *  - no invoices yet            → unchanged (a brand-new subscription stays PENDING until its first invoice is paid)
 *  - everything paid            → ACTIVE (this also lifts SUSPENDED / OVERDUE / GRACE after payment)
 *  - unpaid but not yet due     → PENDING
 *  - past due, inside grace     → OVERDUE (POS keeps working, shows a warning)
 *  - past due, beyond grace     → SUSPENDED
 * CANCELLED is terminal. GRACE is an admin-granted extension and is left alone until the invoices are settled.
 */
export function deriveSubscriptionStatus(input: {
  current: SubscriptionStatus;
  invoices: InvoiceFact[];
  graceDays: number;
  today: string;
}): SubscriptionStatus {
  const { current, invoices, graceDays, today } = input;
  if (current === "CANCELLED") return "CANCELLED";
  if (invoices.length === 0) return current;

  const unpaid = invoices.filter((i) => isUnpaid(i.status));
  if (unpaid.length === 0) return "ACTIVE";
  if (current === "GRACE") return "GRACE";

  const pastDue = unpaid.filter((i) => i.dueDate < today);
  if (pastDue.length === 0) return "PENDING";

  const oldest = pastDue.map((i) => i.dueDate).sort()[0] as string;
  return daysBetween(oldest, today) > graceDays ? "SUSPENDED" : "OVERDUE";
}

export function shouldMarkOverdue(invoice: InvoiceFact, today: string): boolean {
  return invoice.status === "PENDING" && invoice.dueDate < today;
}

export function isReminderDue(invoice: InvoiceFact, today: string, daysBefore: number): boolean {
  return invoice.status === "PENDING" && daysBetween(today, invoice.dueDate) === daysBefore;
}

export type ReminderStage = "due_soon" | "due_today" | "overdue" | "final_warning";

/**
 * Which reminder an unpaid invoice should have reached by `today`, or null if none (yet, or any more).
 *   due in N days (N <= reminderDaysBefore) -> due_soon      the friendly heads-up
 *   due today                               -> due_today
 *   1..grace-1 days late                    -> overdue
 *   exactly `grace` days late (grace >= 2)  -> final_warning  the last day before the licence is suspended
 *   beyond grace                            -> null           the suspension notice takes over
 * It returns the stage REACHED rather than an exact-day match, so a day the daily job missed can't skip a reminder;
 * the job queues each stage once per invoice (deterministic id), so a stage is never sent twice.
 */
export function reminderStage(input: { dueDate: string; today: string; reminderDaysBefore: number; graceDays: number }): ReminderStage | null {
  const daysToDue = daysBetween(input.today, input.dueDate);
  if (daysToDue > 0) return input.reminderDaysBefore > 0 && daysToDue <= input.reminderDaysBefore ? "due_soon" : null;
  if (daysToDue === 0) return "due_today";
  const late = -daysToDue;
  if (late > input.graceDays) return null;
  return input.graceDays >= 2 && late === input.graceDays ? "final_warning" : "overdue";
}

export type LicenceExpiryStage = "d14" | "d7" | "d3" | "d1" | "today" | "expired";

/**
 * Which licence-expiry email a licence has reached, given the days left until it expires (negative once it has).
 *   15+ days -> none   8-14 -> d14   4-7 -> d7   2-3 -> d3   1 -> d1   0 -> today   expired (up to `daysAfter` days ago) -> expired
 * Like reminderStage it returns the stage REACHED, so a day the daily job missed can't skip a warning; the job
 * queues each stage once per licence and expiry date (deterministic id), so no stage is ever sent twice.
 */
export function licenceExpiryStage(daysLeft: number, daysAfter = 7): LicenceExpiryStage | null {
  if (daysLeft < 0) return -daysLeft <= daysAfter ? "expired" : null;
  if (daysLeft === 0) return "today";
  if (daysLeft === 1) return "d1";
  if (daysLeft <= 3) return "d3";
  if (daysLeft <= 7) return "d7";
  if (daysLeft <= 14) return "d14";
  return null;
}
