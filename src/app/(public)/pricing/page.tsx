import { Tag } from "lucide-react";
import type { Metadata } from "next";
import { PageBand } from "@/components/marketing/PageBand";
import { PriceCalculator } from "@/components/marketing/PriceCalculator";
import { PricingPlans } from "@/components/marketing/PricingPlans";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/States";
import { fetchPricing } from "@/lib/firebase/publicRest";

export const revalidate = 60;
export const metadata: Metadata = { title: "Pricing", description: "Simple per-till pricing for Malek Enterprise POS, in South African rand." };

export default async function PricingPage() {
  const pricing = await fetchPricing();
  const plans = pricing?.plans ?? [];

  return (
    <>
      <PageBand title={pricing?.headline || "Pay per till, month to month."} lede={pricing?.subtitle || "One licence covers the shop server and every till you register against it."} />
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
              <p className="text-center text-sm text-muted">Prices are in South African rand. VAT is shown on your invoice. Running several shops? <a href="/contact" className="font-semibold text-ink-900 underline decoration-accent decoration-2 underline-offset-4">Talk to us</a> about a tailored price.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
