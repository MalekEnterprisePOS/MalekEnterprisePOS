"use client";

import { StatusBadge } from "@/components/ui/Badge";
import { cycleAmount } from "@/lib/billing/lifecycle";
import { FREQUENCY_LABEL } from "@/lib/billing/plans";
import { daysBetween, todayISO } from "@/lib/dates";
import { formatDate, formatZAR } from "@/lib/utils";
import type { PortalLicense, PortalSubscription } from "./types";

/** "Your plan": everything the customer is paying for and when it ends, in one place. */
export function PlanSummary({ businessName, subscription, license, vatRate, customPrice }: { businessName: string; subscription: PortalSubscription; license: PortalLicense | undefined; vatRate: number; customPrice: number | null }) {
  const price = customPrice ?? subscription.pricePerTerminal;
  const perCycle = cycleAmount(subscription.terminalLimit, price, subscription.billingFrequency, subscription.discountPercent);
  const left = license ? daysBetween(todayISO(), license.expiryDate) : null;
  const items: [string, React.ReactNode][] = [
    ["Plan", subscription.plan],
    ["Tills (devices) allowed", license ? license.deviceLimit : subscription.terminalLimit],
    ["Devices in use", license ? `${license.devicesInUse} of ${license.deviceLimit}` : "0"],
    ["Billing", `${FREQUENCY_LABEL[subscription.billingFrequency]}${subscription.discountPercent > 0 ? `, ${subscription.discountPercent}% discount` : ""}`],
    ["Price per till", `${formatZAR(price)} a month`],
    [`Each ${subscription.billingFrequency === "annual" ? "year" : subscription.billingFrequency === "quarterly" ? "quarter" : "month"}`, `${formatZAR(perCycle)} + VAT (${formatZAR(perCycle * (1 + vatRate))})`],
    ["Next billing date", formatDate(subscription.nextBillingDate)],
    ["Licence expires", license ? `${formatDate(license.expiryDate)}${left !== null ? (left < 0 ? ` (expired ${-left} day${left === -1 ? "" : "s"} ago)` : left === 0 ? " (today)" : ` (${left} day${left === 1 ? "" : "s"} left)`) : ""}` : "No licence yet"],
  ];
  return (
    <div className="rounded-xl3 border border-line bg-surface p-6 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-display text-xl font-bold text-ink-900">{businessName}</h2><p className="text-sm text-muted">Your plan</p></div>
        <StatusBadge status={subscription.status} />
      </div>
      <dl className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(([label, value]) => <div key={label}><dt className="text-xs uppercase tracking-wide text-muted">{label}</dt><dd className="mt-0.5 text-sm font-semibold text-ink-900">{value}</dd></div>)}
      </dl>
    </div>
  );
}
