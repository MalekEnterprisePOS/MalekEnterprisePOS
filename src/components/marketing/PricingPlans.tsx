"use client";

import { Check } from "lucide-react";
import { useMemo, useState } from "react";
import type { BillingFrequency, PricingPlan } from "@/types";
import { ButtonLink } from "@/components/ui/Button";
import { ALL_FREQUENCIES, FREQUENCY_LABEL, cycleQuote, discountFor, offeredFrequencies } from "@/lib/billing/plans";
import { cn, formatZAR } from "@/lib/utils";

/** The plan cards, with a Monthly / Yearly switch that shows each plan's real discounted price. */
export function PricingPlans({ plans }: { plans: PricingPlan[] }) {
  // Only offer a switch for billing options at least one plan actually has.
  const available = useMemo(() => ALL_FREQUENCIES.filter((f) => plans.some((p) => offeredFrequencies(p).includes(f))), [plans]);
  const [frequency, setFrequency] = useState<BillingFrequency>("monthly");
  const bestSaving = (f: BillingFrequency) => Math.max(0, ...plans.filter((p) => offeredFrequencies(p).includes(f)).map((p) => discountFor(p, f)));

  return (
    <div className="space-y-10">
      {available.length > 1 && (
        <div className="flex justify-center">
          <div role="group" aria-label="Billing period" className="inline-flex rounded-full border border-line bg-surface p-1 shadow-card">
            {available.map((f) => {
              const save = bestSaving(f);
              return (
                <button key={f} type="button" onClick={() => setFrequency(f)} aria-pressed={frequency === f}
                  className={cn("inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition", frequency === f ? "bg-ink-900 text-white" : "text-ink-700 hover:bg-ink-100")}>
                  {FREQUENCY_LABEL[f]}
                  {save > 0 && <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", frequency === f ? "bg-accent text-accent-ink" : "bg-ok/15 text-[#0B6B45]")}>Save {save % 1 === 0 ? save : save.toFixed(1)}%</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className={cn("grid items-stretch gap-6", plans.length === 1 ? "max-w-md" : plans.length === 2 ? "md:grid-cols-2" : "md:grid-cols-2 lg:grid-cols-3")}>
        {plans.map((p) => {
          const offered = offeredFrequencies(p);
          const f = offered.includes(frequency) ? frequency : "monthly";
          const pct = discountFor(p, f);
          const quote = cycleQuote(p.pricePerTerminal, 1, f, pct);
          const muted = p.highlighted ? "text-ink-800" : "text-muted";
          return (
            <article key={p.id} className={cn("ticket-notch relative flex flex-col rounded-xl3 shadow-lift", p.highlighted ? "bg-accent text-accent-ink md:-mt-3 md:pb-3" : "bg-surface")} style={{ ["--notch-y" as string]: "58%" }}>
              <div className="px-8 pb-6 pt-8">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="display-wide text-2xl font-bold">{p.name}</h2>
                  {p.highlighted && <span className="rounded-full bg-ink-900 px-3 py-1 text-xs font-bold text-accent">Most chosen</span>}
                </div>
                {p.description && <p className={cn("mt-2 text-[15px]", muted)}>{p.description}</p>}
                <p className="mt-6 flex items-baseline gap-1.5">
                  <span className="font-display text-2xl font-bold">R</span>
                  <span className="display text-[76px] tabular">{Math.round(quote.effectiveMonthly)}</span>
                  {pct > 0 && <span className={cn("text-lg tabular line-through", muted)}>R{Math.round(p.pricePerTerminal)}</span>}
                </p>
                <p className={cn("text-sm", muted)}>per till, per month{p.minTerminals > 1 ? `, from ${p.minTerminals} tills` : ""}{p.maxTerminals < 1000 ? `, up to ${p.maxTerminals}` : ""}</p>
                {f !== "monthly" ? (
                  <p className={cn("mt-2 text-sm font-semibold", p.highlighted ? "text-ink-900" : "text-[#0B6B45]")}>
                    Billed {formatZAR(quote.net)} per till {f === "annual" ? "every year" : "every 3 months"}{pct > 0 ? `. You save ${formatZAR(quote.saved)} (${pct % 1 === 0 ? pct : pct.toFixed(1)}% off).` : "."}
                  </p>
                ) : offered.length === 1 ? <p className={cn("mt-2 text-sm", muted)}>Billed monthly only.</p> : null}
                {frequency !== "monthly" && !offered.includes(frequency) && <p className={cn("mt-1 text-xs", muted)}>{FREQUENCY_LABEL[frequency]} billing isn&apos;t offered on this plan.</p>}
              </div>
              <div className="perforation mx-6" aria-hidden />
              <div className="flex flex-1 flex-col px-8 pb-8 pt-6">
                <ul className="flex-1 space-y-3 text-[15px]">
                  {p.features.map((feat) => (
                    <li key={feat} className="flex gap-3"><span className={cn("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full", p.highlighted ? "bg-ink-900 text-accent" : "bg-ok/15 text-ok")}><Check className="h-3 w-3" aria-hidden /></span>{feat}</li>
                  ))}
                </ul>
                <ButtonLink href={`/login?mode=signup&next=${encodeURIComponent(`/account?plan=${encodeURIComponent(p.id)}&billing=${f}`)}`} variant={p.highlighted ? "dark" : "secondary"} size="lg" className="mt-8 w-full">Get started</ButtonLink>
                <p className={cn("mt-3 text-center text-xs", muted)}>Sign in, pay by card, and your licence key appears straight away.</p>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
