import { Check, Tag } from "lucide-react";
import type { Metadata } from "next";
import { PageBand } from "@/components/marketing/PageBand";
import { PriceCalculator } from "@/components/marketing/PriceCalculator";
import { PricingPlans } from "@/components/marketing/PricingPlans";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/States";
import { fetchPricing } from "@/lib/firebase/publicRest";

export const revalidate = 60;
export const metadata: Metadata = { title: "Pricing", description: "Simple per-till pricing for Malek Enterprise POS, in South African rand, with all 7 retail and hardware modules included." };

const includedModules = [
  ["SARS Sec 20 & 4-Way Split Tenders", "Auto Till Slip (≤ R50), Abridged (≤ R5,000), and Full Tax Invoice (> R5,000), 15%/0%/Exempt VAT, 10c rounding, card cash-back, and decimal quantities."],
  ["Blind Cash-Up (Z-Report) & Safe Drops", "Live drawer limit warning with 'Skim to Safe Now', blind SA denomination counter (R200 to 10c), and full Expected-Cash variance reconciliation."],
  ["Live ATS Stock, Debtors & Creditors", "Physical SOH vs. Yard Held vs. Layby Locked stock, 12-month GP matrix, Bin Cards, Retail/Trade price tiers, and 5-bucket aging (0–30 to 120+ days)."],
  ["Yard Gate-Passes & CPA Sec 62 Laybys", "Staged yard collections, unpriced driver slips, live delivery tracker, and 1–12 month laybys with statutory 1% max cancellation penalty math."],
  ["PO to GRV, Landed WAC & Labels", "GRV Approvals, Break-Bulk UOM conversion, BOM Kits, Landed WAC, live Markup % ↔ GP % pricing, and post-GRV shelf/barcode label printing."],
  ["Local LAN Server & Device Security Gate", "PostgreSQL on your Shop Server, 2-step LAN auto-discovery, Admin Device Approval Gate with 90s heartbeats, BCrypt PINs, and automated backups."],
] as const;

export default async function PricingPage() {
  const pricing = await fetchPricing();
  const plans = pricing?.plans ?? [];

  return (
    <>
      <PageBand title={pricing?.headline || "Pay per till, month to month."} lede={pricing?.subtitle || "One licence covers the shop server and every till you register against it—with every retail, hardware, and accounting module included."} />
      <div className="bg-paper py-16">
        <div className="mx-auto max-w-6xl px-5">
          {plans.length === 0 ? (
            <div className="panel rounded-xl3">
              <EmptyState icon={Tag} title="Pricing is being finalised" description="We haven't published plans yet. Get in touch and we'll quote for your shop." action={<ButtonLink href="/contact" variant="dark">Ask for a quote</ButtonLink>} />
            </div>
          ) : (
            <div className="space-y-14">
              <PricingPlans plans={plans} />
              <PriceCalculator plans={plans} />

              {/* Included in every licence */}
              <section className="rounded-xl3 bg-surface p-7 shadow-card ring-1 ring-line sm:p-10">
                <Badge tone="accent">No Paid Add-Ons</Badge>
                <h2 className="display-wide mt-3 text-2xl font-bold text-ink-900 sm:text-3xl">Every module is included on every registered till.</h2>
                <p className="mt-2 max-w-2xl text-[15px] text-muted">
                  We don&apos;t lock Debtors, Creditors, Yard Gate-Passes, CPA Laybys, or Barcode Label printing behind higher tiers. Every licence unlocks the complete POS.
                </p>
                <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {includedModules.map(([title, desc]) => (
                    <li key={title} className="rounded-2xl border border-line bg-paper p-5">
                      <div className="flex items-center gap-2.5">
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink-900 text-accent">
                          <Check className="h-3.5 w-3.5" aria-hidden />
                        </span>
                        <h3 className="text-[15.5px] font-bold text-ink-900">{title}</h3>
                      </div>
                      <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{desc}</p>
                    </li>
                  ))}
                </ul>
              </section>

              <p className="text-center text-sm text-muted">All prices are in South African rand and include VAT. Running several shops? <a href="/contact" className="font-semibold text-ink-900 underline decoration-accent decoration-2 underline-offset-4">Talk to us</a> about a tailored price.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
