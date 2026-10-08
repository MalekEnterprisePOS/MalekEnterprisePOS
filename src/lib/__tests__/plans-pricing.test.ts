import { describe, expect, it } from "vitest";
import type { PricingPlan } from "@/types";
import { cycleAmount, cycleUnitPrice } from "@/lib/billing/lifecycle";
import { cycleQuote, discountFor, discountForCustomer, offeredFrequencies, planChoiceProblem } from "@/lib/billing/plans";
import { hasCustomPrice, priceOrder } from "@/lib/account/order";
import { mapPricing, mapSubscription } from "@/lib/mappers";
import { pricingPlanSchema, subscriptionSchema } from "@/lib/validation/schemas";

const plan = (over: Partial<PricingPlan> = {}): PricingPlan => ({
  id: "std", name: "Standard", description: "", pricePerTerminal: 500, minTerminals: 1, maxTerminals: 5, frequencies: ["monthly", "quarterly", "annual"],
  discountQuarterly: 5, discountAnnual: 15, features: [], highlighted: false, ...over,
});

describe("plan discounts", () => {
  it("monthly never gets a discount; quarterly and yearly use the plan's own percentages", () => {
    expect(discountFor(plan(), "monthly")).toBe(0);
    expect(discountFor(plan(), "quarterly")).toBe(5);
    expect(discountFor(plan(), "annual")).toBe(15);
  });
  it("a silly stored percentage is held to 0 to 90", () => {
    expect(discountFor(plan({ discountAnnual: 400 }), "annual")).toBe(90);
    expect(discountFor(plan({ discountAnnual: -5 }), "annual")).toBe(0);
  });
  it("a yearly quote is 12 months less the discount, with the saving spelled out", () => {
    const q = cycleQuote(500, 2, "annual", 15);
    expect(q).toMatchObject({ months: 12, gross: 12000, net: 10200, saved: 1800, effectiveMonthly: 425 });
  });
  it("the same maths is used for invoices, subscriptions and the cycle amount", () => {
    expect(cycleAmount(2, 500, "annual", 15)).toBe(10200);
    expect(cycleAmount(2, 500, "annual")).toBe(12000);
    expect(cycleUnitPrice(500, "annual", 15)).toBe(5100);
    expect(cycleUnitPrice(333.33, "quarterly", 5)).toBe(949.99);
  });
  it("an order invoice carries the discounted unit price and says so", () => {
    const o = priceOrder({ pricePerTerminal: 500, terminals: 2, frequency: "annual", vatRate: 0.15, planName: "Standard", discountPercent: 15 });
    expect(o.lines[0]).toMatchObject({ quantity: 2, unitPrice: 5100, description: expect.stringContaining("15% discount") });
    expect(o.subtotal).toBe(10200);
    expect(o.total).toBe(11730);
    const none = priceOrder({ pricePerTerminal: 500, terminals: 2, frequency: "monthly", vatRate: 0.15, planName: "Standard" });
    expect(none.subtotal).toBe(1000);
    expect(none.lines[0]!.description).not.toContain("discount");
  });
  it("a customer with a hand-set price doesn't get plan discounts stacked on top", () => {
    expect(hasCustomPrice({ pricePerTerminal: 400, priceSource: undefined })).toBe(true);
    expect(hasCustomPrice({ pricePerTerminal: 400, priceSource: "plan" })).toBe(false);
    expect(hasCustomPrice(null)).toBe(false);
    expect(discountForCustomer(true, plan(), "annual")).toBe(0);
    expect(discountForCustomer(false, plan(), "annual")).toBe(15);
  });
});

describe("plan limits and billing options", () => {
  it("keeps the number of tills inside the admin's range", () => {
    expect(planChoiceProblem(plan(), 0, "monthly")).toMatch(/starts at 1/);
    expect(planChoiceProblem(plan({ minTerminals: 4 }), 3, "monthly")).toMatch(/starts at 4 tills/);
    expect(planChoiceProblem(plan(), 6, "monthly")).toMatch(/up to 5 tills/);
    expect(planChoiceProblem(plan(), 5, "monthly")).toBeNull();
    expect(planChoiceProblem(plan(), 1, "annual")).toBeNull();
  });
  it("refuses a billing option the plan doesn't offer", () => {
    const p = plan({ frequencies: ["monthly", "annual"] });
    expect(planChoiceProblem(p, 2, "quarterly")).toMatch(/isn't offered with quarterly/);
    expect(offeredFrequencies(p)).toEqual(["monthly", "annual"]);
  });
  it("a plan can never end up offering nothing", () => {
    expect(offeredFrequencies({ frequencies: [] })).toEqual(["monthly"]);
  });
});

describe("saving and reading plans", () => {
  const valid = { id: "std", name: "Standard", description: "", pricePerTerminal: "500", minTerminals: "1", maxTerminals: "10", frequencies: ["monthly", "annual"], discountQuarterly: "0", discountAnnual: "15", features: [], highlighted: false };
  it("accepts a good plan, turning form text into numbers", () => {
    expect(pricingPlanSchema.parse(valid)).toMatchObject({ maxTerminals: 10, discountAnnual: 15, frequencies: ["monthly", "annual"] });
  });
  it("won't let the maximum be below the minimum", () => {
    const r = pricingPlanSchema.safeParse({ ...valid, minTerminals: "5", maxTerminals: "3" });
    expect(r.success).toBe(false);
    expect(r.success ? "" : r.error.issues[0]?.message).toMatch(/maximum can't be less/i);
  });
  it("holds a discount to 90% and needs at least one billing option", () => {
    expect(pricingPlanSchema.safeParse({ ...valid, discountAnnual: "95" }).success).toBe(false);
    expect(pricingPlanSchema.safeParse({ ...valid, discountAnnual: "-1" }).success).toBe(false);
    expect(pricingPlanSchema.safeParse({ ...valid, frequencies: [] }).success).toBe(false);
  });
  it("plans saved before these options existed still load, offering everything with no discount", () => {
    const [p] = mapPricing({ plans: [{ id: "old", name: "Old", pricePerTerminal: 300, minTerminals: 2 }] }).plans;
    expect(p).toMatchObject({ maxTerminals: 200, frequencies: ["monthly", "quarterly", "annual"], discountQuarterly: 0, discountAnnual: 0 });
  });
  it("a stored maximum below the minimum is lifted to the minimum", () => {
    expect(mapPricing({ plans: [{ id: "x", name: "X", pricePerTerminal: 1, minTerminals: 6, maxTerminals: 2 }] }).plans[0]!.maxTerminals).toBe(6);
  });
  it("subscriptions get a discount of 0 unless one was recorded, and the form accepts one", () => {
    expect(mapSubscription("s", { customerId: "c" }).discountPercent).toBe(0);
    expect(mapSubscription("s", { customerId: "c", discountPercent: 15 }).discountPercent).toBe(15);
    expect(subscriptionSchema.safeParse({ customerId: "c", plan: "P", terminalLimit: "2", pricePerTerminal: "100", billingFrequency: "annual", startDate: "2026-01-01", nextBillingDate: "2027-01-01", status: "ACTIVE", gracePeriodDays: "5", autoRenewal: true, discountPercent: "15" }).success).toBe(true);
  });
});
