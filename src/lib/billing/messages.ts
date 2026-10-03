import type { QueuedMessage } from "@/lib/notifications/server";
import type { LicenceExpiryStage, ReminderStage } from "./lifecycle";
import { formatDate, formatZAR } from "@/lib/utils";

/** The wording of every automatic email, in one place. Pure: pass in the numbers and links, get back the message. */
type Msg = Pick<QueuedMessage, "title" | "message" | "ctaLabel" | "ctaUrl">;

export interface InvoiceFacts { number: string; total: number; dueDate: string }
export interface Cta { url: string; online: boolean }

const payCta = (cta: Cta): Pick<Msg, "ctaLabel" | "ctaUrl"> => ({ ctaLabel: cta.online ? "Pay invoice online" : "View my invoice", ctaUrl: cta.url });
const payLine = (cta: Cta) => (cta.online ? "You can pay by card online in under a minute using the button below." : "Sign in to your account to see the invoice and how to pay.");

export function invoiceIssued(biz: string, inv: InvoiceFacts, cta: Cta): Msg {
  return {
    title: `Invoice ${inv.number} for ${formatZAR(inv.total)}`,
    message: `Hi ${biz},\n\nInvoice ${inv.number} for ${formatZAR(inv.total)} has been issued and is due on ${formatDate(inv.dueDate)}.\n\n${payLine(cta)}\n\nThank you.`,
    ...payCta(cta),
  };
}

export function reminder(stage: ReminderStage, biz: string, inv: InvoiceFacts, cta: Cta, graceDays: number): Msg {
  const amount = formatZAR(inv.total);
  switch (stage) {
    case "due_soon":
      return { title: `Reminder: invoice ${inv.number} is due on ${formatDate(inv.dueDate)}`, message: `Hi ${biz},\n\nA friendly reminder that invoice ${inv.number} for ${amount} is due on ${formatDate(inv.dueDate)}.\n\n${payLine(cta)}\n\nThank you.`, ...payCta(cta) };
    case "due_today":
      return { title: `Invoice ${inv.number} is due today`, message: `Hi ${biz},\n\nInvoice ${inv.number} for ${amount} is due today.\n\n${payLine(cta)}\n\nThank you.`, ...payCta(cta) };
    case "overdue":
      return { title: `Invoice ${inv.number} is overdue`, message: `Hi ${biz},\n\nInvoice ${inv.number} for ${amount} was due on ${formatDate(inv.dueDate)} and is now overdue. Your POS keeps working during the ${graceDays}-day grace period, but please settle it to avoid your licence being suspended.\n\n${payLine(cta)}`, ...payCta(cta) };
    case "final_warning":
      return { title: `Final notice: your licence will be suspended tomorrow`, message: `Hi ${biz},\n\nInvoice ${inv.number} for ${amount} is still unpaid and the grace period ends today. Unless it is settled, your Malek Enterprise POS licence will be suspended tomorrow and your tills will stop trading.\n\n${payLine(cta)}`, ...payCta(cta) };
  }
}

export function suspended(biz: string, cta: Cta): Msg {
  return { title: "Your licence has been suspended", message: `Hi ${biz},\n\nYour Malek Enterprise POS licence has been suspended because payment is outstanding. It is restored automatically the moment the account is settled.\n\n${payLine(cta)}`, ...payCta(cta) };
}

export function paymentFailed(biz: string, inv: InvoiceFacts, cta: Cta): Msg {
  return { title: `Payment for ${inv.number} didn't go through`, message: `Hi ${biz},\n\nA payment for invoice ${inv.number} (${formatZAR(inv.total)}) did not go through. Nothing was charged.\n\nPlease try again, or use a different card.`, ...payCta(cta) };
}

export function paymentReceived(biz: string, inv: InvoiceFacts, portalUrl: string): Msg {
  return { title: `Payment received for ${inv.number}`, message: `Hi ${biz},\n\nThank you. We received your payment of ${formatZAR(inv.total)} for invoice ${inv.number}. Your account is up to date and your licence stays active.`, ctaLabel: "View my account", ctaUrl: portalUrl };
}

export function licenceReady(biz: string, invoiceNumber: string, planName: string, terminals: number, portalUrl: string): Msg {
  return {
    title: "Payment received - your licence is ready",
    message: `Hi ${biz},\n\nThank you. Invoice ${invoiceNumber} is paid and your ${planName} plan (${terminals} till${terminals === 1 ? "" : "s"}) is active.\n\nSign in to your account to copy your licence key and download the software.`,
    ctaLabel: "Go to my account", ctaUrl: portalUrl,
  };
}

export function licenceExpiry(stage: LicenceExpiryStage, biz: string, expiryDate: string, daysLeft: number, portalUrl: string): Msg {
  const when = formatDate(expiryDate);
  const cta = { ctaLabel: "Renew in my account", ctaUrl: portalUrl };
  const how = "Sign in to your account to settle any open invoice or renew your plan. Your licence is extended automatically as soon as payment is received.";
  switch (stage) {
    case "d14": case "d7":
      return { title: `Your licence expires in ${daysLeft} days`, message: `Hi ${biz},\n\nYour Malek Enterprise POS licence expires on ${when}, in ${daysLeft} days.\n\n${how}`, ...cta };
    case "d3":
      return { title: `Your licence expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`, message: `Hi ${biz},\n\nYour Malek Enterprise POS licence expires on ${when}. That is only ${daysLeft} day${daysLeft === 1 ? "" : "s"} away.\n\n${how}`, ...cta };
    case "d1":
      return { title: "Your licence expires tomorrow", message: `Hi ${biz},\n\nYour Malek Enterprise POS licence expires tomorrow (${when}). After that there is a short grace period, then your tills stop trading.\n\n${how}`, ...cta };
    case "today":
      return { title: "Your licence expires today", message: `Hi ${biz},\n\nYour Malek Enterprise POS licence expires today (${when}). After the grace period your tills stop trading.\n\n${how}`, ...cta };
    case "expired":
      return { title: "Your licence has expired", message: `Hi ${biz},\n\nYour Malek Enterprise POS licence expired on ${when}. Renew now to keep your tills trading.\n\n${how}`, ...cta };
  }
}
