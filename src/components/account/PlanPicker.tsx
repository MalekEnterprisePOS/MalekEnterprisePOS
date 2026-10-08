"use client";

import { Check, CreditCard, Lock } from "lucide-react";
import { useMemo, useState } from "react";
import type { BillingFrequency, PricingPlan } from "@/types";
import { Button } from "@/components/ui/Button";
import { SelectField, TextField } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { accountFetch } from "@/lib/account-client";
import { MAX_ORDER_TERMINALS } from "@/lib/account/order";
import { formatZAR } from "@/lib/utils";
import { FREQUENCY_LABEL, cycleQuote, discountForCustomer, offeredFrequencies, planChoiceProblem } from "@/lib/billing/plans";

interface Props {
  plans: PricingPlan[];
  billingFrequency: BillingFrequency;
  vatRate: number;
  customPrice: number | null;
  /** True when Yoco is switched on: the main button then pays straight away instead of just making an invoice. */
  canPayOnline: boolean;
  /** Name, shop and phone are filled in. Buying is blocked until they are. */
  profileComplete: boolean;
  /** A plan to pre-select, e.g. from the pricing page's "Get started" button (?plan=...). */
  initialPlanId?: string;
  /** A billing option to pre-select, e.g. from the pricing page toggle (?billing=annual). */
  initialBilling?: string;
  onOrdered: () => void;
}

/**
 * Buy or upgrade a plan in one step. "Pay now" creates the invoice and sends the customer to Yoco's secure page; when the
 * payment clears, the licence is issued automatically. A customer's own negotiated per-terminal price (set by an admin) always
 * wins over the plan's listed price, and is shown clearly so nobody is confused why the total differs from the pricing page.
 */
export function PlanPicker({ plans, billingFrequency, vatRate, customPrice, canPayOnline, profileComplete, initialPlanId, initialBilling, onOrdered }: Props) {
  const toast = useToast();
  const start = plans.find((p) => p.id === initialPlanId) ?? plans.find((p) => p.highlighted) ?? plans[0];
  const [planId, setPlanId] = useState(start?.id ?? "");
  const [terminals, setTerminals] = useState(start?.minTerminals ?? 1);
  const wantedBilling = (["monthly", "quarterly", "annual"] as const).find((f) => f === initialBilling) ?? billingFrequency;
  const [wantedFrequency, setFrequency] = useState<BillingFrequency>(wantedBilling);
  const [busy, setBusy] = useState<"pay" | "invoice" | null>(null);
  const plan = plans.find((p) => p.id === planId) ?? plans[0];
  // If the chosen plan doesn't offer the billing option that was selected, fall back to one it does.
  const offered = plan ? offeredFrequencies(plan) : (["monthly"] as BillingFrequency[]);
  const frequency: BillingFrequency = offered.includes(wantedFrequency) ? wantedFrequency : offered[0]!;

  const totals = useMemo(() => {
    if (!plan) return null;
    const price = customPrice ?? plan.pricePerTerminal;
    const pct = discountForCustomer(customPrice !== null, plan, frequency);
    const q = cycleQuote(price, Math.max(1, terminals), frequency, pct);
    const vat = Math.round(q.net * vatRate * 100) / 100;
    return { price, pct, months: q.months, gross: q.gross, saved: q.saved, subtotal: q.net, vat, total: Math.round((q.net + vat) * 100) / 100 };
  }, [plan, terminals, frequency, vatRate, customPrice]);

  if (!plans.length) return <p className="rounded-xl3 border border-line bg-surface p-6 text-sm text-muted">No plans are available to buy right now. Please check back soon or contact us.</p>;

  const check = (): boolean => {
    if (!plan) return false;
    if (!profileComplete) { toast.error("Fill in your details above first."); return false; }
    const problem = planChoiceProblem(plan, terminals, frequency);
    if (problem) { toast.error(problem); return false; }
    return true;
  };
  const body = () => ({ planId: plan!.id, terminals, billingFrequency: frequency });

  const payNow = async () => {
    if (!check()) return;
    setBusy("pay");
    try {
      const { url } = await accountFetch<{ url: string }>("/api/account/checkout", body());
      window.location.assign(url); // leave the page: keep the button busy until the browser navigates
    } catch (e) {
      setBusy(null);
      toast.error(e instanceof Error ? e.message : "Couldn't start the payment.");
    }
  };

  const invoiceOnly = async () => {
    if (!check()) return;
    setBusy("invoice");
    try {
      await accountFetch("/api/account/order", body());
      toast.success("Your invoice is ready below. Pay it to activate your licence.");
      onOrdered();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create that order.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6 rounded-xl3 border border-line bg-surface p-6 shadow-card sm:p-8">
      <div className="grid gap-4 sm:grid-cols-3">
        {plans.map((p) => (
          <button key={p.id} type="button" onClick={() => { setPlanId(p.id); setTerminals(Math.min(Math.max(terminals, p.minTerminals), p.maxTerminals)); }} aria-pressed={p.id === planId}
            className={`rounded-field border p-4 text-left transition ${p.id === planId ? "border-accent-strong bg-accent/10 ring-1 ring-accent-strong" : "border-line hover:border-ink-300"}`}>
            <div className="flex items-center justify-between"><span className="font-display font-bold text-ink-900">{p.name}</span>{p.highlighted && <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-accent-ink">Popular</span>}</div>
            <p className="mt-1 text-sm text-muted">{p.description}</p>
            <p className="mt-2 text-sm font-semibold text-ink-800">{formatZAR(customPrice ?? p.pricePerTerminal)} / till / month</p>
            <p className="text-xs text-muted">{p.minTerminals} to {p.maxTerminals} tills{customPrice === null && p.discountAnnual > 0 && offeredFrequencies(p).includes("annual") ? `, save ${p.discountAnnual}% yearly` : ""}</p>
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Number of tills" type="number" min={plan?.minTerminals ?? 1} max={Math.min(MAX_ORDER_TERMINALS, plan?.maxTerminals ?? MAX_ORDER_TERMINALS)} value={terminals} onChange={(e) => setTerminals(Math.max(1, Math.min(Math.min(MAX_ORDER_TERMINALS, plan?.maxTerminals ?? MAX_ORDER_TERMINALS), Number(e.target.value) || 1)))}
          hint={plan ? `${plan.name} covers ${plan.minTerminals} to ${plan.maxTerminals} tills. Each PC you connect uses one till.` : undefined} />
        <SelectField label="Billing" value={frequency} onChange={(e) => setFrequency(e.target.value as BillingFrequency)}
          options={offered.map((f) => { const d = plan ? discountForCustomer(customPrice !== null, plan, f) : 0; return { value: f, label: `${FREQUENCY_LABEL[f]}${d > 0 ? ` (save ${d}%)` : ""}` }; })} />
      </div>
      {totals && (
        <div className="space-y-1 rounded-field bg-ink-50 p-4 text-sm">
          <div className="flex justify-between text-muted"><span>{formatZAR(totals.price)} x {terminals} till{terminals === 1 ? "" : "s"} x {totals.months} month{totals.months === 1 ? "" : "s"}</span><span>{formatZAR(totals.gross)}</span></div>
          {totals.saved > 0 && <div className="flex justify-between font-medium text-[#0B6B45]"><span>{FREQUENCY_LABEL[frequency]} discount ({totals.pct}%)</span><span>-{formatZAR(totals.saved)}</span></div>}
          <div className="flex justify-between text-muted"><span>Subtotal</span><span>{formatZAR(totals.subtotal)}</span></div>
          <div className="flex justify-between text-muted"><span>VAT ({Math.round(vatRate * 100)}%)</span><span>{formatZAR(totals.vat)}</span></div>
          <div className="flex justify-between border-t border-line pt-1 text-base font-bold text-ink-900"><span>Total due now</span><span>{formatZAR(totals.total)}</span></div>
          {customPrice != null && <p className="flex items-center gap-1 pt-1 text-xs text-accent-strong"><Check className="h-3.5 w-3.5" /> Your account has a custom price - already applied above (plan discounts don&apos;t stack on top of it).</p>}
        </div>
      )}
      {!profileComplete && <p role="status" className="rounded-field border border-warn/40 bg-warn/10 p-3 text-sm text-ink-800">Fill in your details above first. Then you can pay.</p>}
      {canPayOnline ? (
        <div className="space-y-3">
          <Button size="lg" className="w-full" loading={busy === "pay"} disabled={!profileComplete || busy === "invoice"} onClick={payNow}>
            <CreditCard className="h-5 w-5" aria-hidden />Pay {totals ? formatZAR(totals.total) : ""} and get my licence
          </Button>
          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted"><Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />You enter your card on Yoco&apos;s secure payment page. We never see or store your card details. Your licence key appears here as soon as the payment clears.</p>
          <button type="button" onClick={invoiceOnly} disabled={!profileComplete || busy !== null} className="mx-auto block text-sm font-medium text-muted underline underline-offset-2 hover:text-ink-800 disabled:opacity-50">
            {busy === "invoice" ? "Creating invoice..." : "Not now: just create the invoice and I'll pay later"}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <Button size="lg" className="w-full" loading={busy === "invoice"} disabled={!profileComplete} onClick={invoiceOnly}>Create invoice</Button>
          <p className="text-center text-xs text-muted">Card payments aren&apos;t switched on yet. Create the invoice, then pay it by bank transfer. Your licence is issued once we confirm the payment.</p>
        </div>
      )}
    </div>
  );
}
