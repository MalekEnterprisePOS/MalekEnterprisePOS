import type { BillingFrequency, PricingPlan } from "@/types";
import { round2 } from "@/lib/utils";
import { MONTHS_PER_CYCLE } from "./lifecycle";

export const ALL_FREQUENCIES: BillingFrequency[] = ["monthly", "quarterly", "annual"];
export const FREQUENCY_LABEL: Record<BillingFrequency, string> = { monthly: "Monthly", quarterly: "Quarterly", annual: "Yearly" };
/** The largest discount an admin may give. Stops a typo from making a plan nearly free. */
export const MAX_DISCOUNT_PERCENT = 90;

type PlanPricingFields = Pick<PricingPlan, "discountQuarterly" | "discountAnnual" | "frequencies" | "minTerminals" | "maxTerminals" | "name">;

/** The discount (in percent) a plan gives for paying this often. Monthly never has one. */
export function discountFor(plan: Pick<PricingPlan, "discountQuarterly" | "discountAnnual">, frequency: BillingFrequency): number {
  const pct = frequency === "annual" ? plan.discountAnnual : frequency === "quarterly" ? plan.discountQuarterly : 0;
  return Math.min(MAX_DISCOUNT_PERCENT, Math.max(0, Number.isFinite(pct) ? pct : 0));
}

/** The billing options a plan offers, always in monthly, quarterly, yearly order. Never empty. */
export function offeredFrequencies(plan: Pick<PricingPlan, "frequencies">): BillingFrequency[] {
  const set = ALL_FREQUENCIES.filter((f) => plan.frequencies.includes(f));
  return set.length > 0 ? set : ["monthly"];
}

/** What one billing cycle costs before VAT, with the saving spelled out. `pct` is the discount in percent. */
export function cycleQuote(pricePerTerminalPerMonth: number, terminals: number, frequency: BillingFrequency, pct: number) {
  const months = MONTHS_PER_CYCLE[frequency];
  const gross = round2(pricePerTerminalPerMonth * terminals * months);
  const net = round2(gross * (1 - pct / 100));
  return { months, gross, net, saved: round2(gross - net), effectiveMonthly: round2(net / Math.max(1, terminals) / months) };
}

/** A customer whose per-terminal price an admin set by hand has already negotiated; plan discounts then don't stack on top. */
export function discountForCustomer(hasCustomPrice: boolean, plan: Pick<PricingPlan, "discountQuarterly" | "discountAnnual">, frequency: BillingFrequency): number {
  return hasCustomPrice ? 0 : discountFor(plan, frequency);
}

/** Why this choice isn't allowed on the plan (till count outside the admin's range, or a billing option the plan doesn't offer), or null. */
export function planChoiceProblem(plan: PlanPricingFields, terminals: number, frequency: BillingFrequency): string | null {
  if (terminals < plan.minTerminals) return `${plan.name} starts at ${plan.minTerminals} till${plan.minTerminals === 1 ? "" : "s"}.`;
  if (terminals > plan.maxTerminals) return `${plan.name} allows up to ${plan.maxTerminals} till${plan.maxTerminals === 1 ? "" : "s"}. For more, choose a bigger plan or contact us.`;
  if (!offeredFrequencies(plan).includes(frequency)) return `${plan.name} isn't offered with ${FREQUENCY_LABEL[frequency].toLowerCase()} billing.`;
  return null;
}
