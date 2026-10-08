"use client";

import { CalendarClock, CreditCard } from "lucide-react";
import { useState } from "react";
import type { BillingFrequency, PricingPlan } from "@/types";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { accountFetch } from "@/lib/account-client";
import { daysBetween, todayISO } from "@/lib/dates";
import { formatDate } from "@/lib/utils";

/** Shown when the licence runs out within two weeks (or already has): one button to pay for another period of the same plan. */
export function RenewCard({ plans, planName, terminals, frequency, expiryDate, hasUnpaidInvoice }: { plans: PricingPlan[]; planName: string; terminals: number; frequency: BillingFrequency; expiryDate: string; hasUnpaidInvoice: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const daysLeft = daysBetween(todayISO(), expiryDate);
  const plan = plans.find((p) => p.name === planName);
  if (daysLeft > 14 || !plan || hasUnpaidInvoice) return null; // an open invoice already has its own "Pay now" card above
  const expired = daysLeft < 0;

  const renew = async () => {
    setBusy(true);
    try {
      const { url } = await accountFetch<{ url: string }>("/api/account/checkout", { planId: plan.id, terminals, billingFrequency: frequency });
      window.location.assign(url);
    } catch (e) {
      setBusy(false);
      toast.error(e instanceof Error ? e.message : "Couldn't start the renewal.");
    }
  };

  return (
    <div className={`flex flex-wrap items-center justify-between gap-4 rounded-xl3 border p-5 shadow-card ${expired ? "border-bad/30 bg-bad/5" : "border-warn/40 bg-warn/10"}`}>
      <div className="flex items-center gap-4">
        <span className={`grid h-12 w-12 place-items-center rounded-full ${expired ? "bg-bad/15 text-[#A22B3B]" : "bg-warn/20 text-[#8A5200]"}`}><CalendarClock className="h-6 w-6" aria-hidden /></span>
        <div>
          <p className="font-display text-lg font-bold text-ink-900">{expired ? "Your licence has expired" : `Your licence expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`}</p>
          <p className="text-sm text-muted">{expired ? "Expired" : "Expires"} {formatDate(expiryDate)}. Renew now and it extends automatically.</p>
        </div>
      </div>
      <Button size="lg" loading={busy} onClick={renew}><CreditCard className="h-5 w-5" aria-hidden />Renew now</Button>
    </div>
  );
}
