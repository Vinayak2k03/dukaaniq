import type { ComboItem } from "./types";

/**
 * Deterministic offer economics and margin guardrails (PRD 6.3). Money is integer paise.
 * Estimates are scenarios over assumed redemption rates, never predictions.
 */

export const REDEMPTION_SCENARIOS_PCT = [5, 10, 20] as const;
export const DISCOUNT_LADDER_PCT = [15, 12, 10, 7, 5, 3] as const;

/**
 * Margin floor: a discounted price must stay at or above cost × (1 + minMarginPct).
 * Returns the largest whole-percent discount a price/cost pair can carry (0 when none).
 */
export function maxDiscountPct(pricePaise: number, costPaise: number, minMarginPct: number): number {
  if (pricePaise <= 0) return 0;
  const floor = costPaise * (1 + minMarginPct / 100);
  return Math.max(0, Math.floor(((pricePaise - floor) / pricePaise) * 100 + 1e-9));
}

/** Highest ladder step that respects both the margin floor and the merchant's ceiling. */
export function pickDiscountPct(allowedPct: number, ceilingPct: number | null): number | null {
  const limit = Math.min(allowedPct, ceilingPct ?? Infinity);
  return DISCOUNT_LADDER_PCT.find((s) => s <= limit) ?? null;
}

/** The next lower ladder step (COST_TOO_HIGH). null when already at the lowest step. */
export const lowerStep = (pct: number) => DISCOUNT_LADDER_PCT.find((s) => s < pct) ?? null;

/** Products that can carry `pct` without breaking the margin floor; the rest are excluded from the coupon. */
export const productsAboveFloor = <T extends { pricePaise: number; costPaise: number }>(products: T[], pct: number, minMarginPct: number) =>
  products.filter((p) => maxDiscountPct(p.pricePaise, p.costPaise, minMarginPct) >= pct);

export const roundDownTo = (paise: number, stepPaise: number) => Math.floor(paise / stepPaise) * stepPaise;
export const roundUpTo = (paise: number, stepPaise: number) => Math.ceil(paise / stepPaise) * stepPaise;

/**
 * Combo price: list price less `targetPct`, rounded down to ₹5, but never below cost × (1 + floor).
 * Returns null when the floor leaves no real saving (less than ₹1).
 */
export function comboPrice(items: ComboItem[], targetPct: number, minMarginPct: number): { listPricePaise: number; comboPricePaise: number } | null {
  const list = items.reduce((t, i) => t + i.pricePaise, 0);
  const cost = items.reduce((t, i) => t + i.costPaise, 0);
  const floor = Math.ceil(cost * (1 + minMarginPct / 100));
  const price = Math.max(roundUpTo(floor, 100), roundDownTo(Math.round(list * (1 - targetPct / 100)), 500));
  if (price >= list - 100) return null;
  return { listPricePaise: list, comboPricePaise: price };
}

export type Scenario = {
  redemptionPct: number;
  redemptions: number;
  incrementalSalesPaise: number;
  productCostPaise: number;
  discountExposurePaise: number;
  grossProfitImpactPaise: number;
};

export type EconomicsInput = {
  audienceSize: number;
  /** Pre-discount basket value per redemption. */
  basketPaise: number;
  /** Product cost as a share of the basket (0..1). */
  costRate: number;
  discountPerRedemptionPaise: number;
};

/**
 * incrementalSales = audience × redemption × basket; discountExposure = redemptions × discount (already capped);
 * grossProfitImpact = incrementalSales − product cost − discount. Every redemption is counted as incremental,
 * which overstates lift; this is stated in the assumptions.
 */
export function scenarioEconomics(i: EconomicsInput, assumptions: string[] = []) {
  const scenarios: Scenario[] = REDEMPTION_SCENARIOS_PCT.map((pct) => {
    const redemptions = Math.round((i.audienceSize * pct) / 100);
    const sales = redemptions * i.basketPaise;
    const cost = Math.round(sales * i.costRate);
    const discount = redemptions * i.discountPerRedemptionPaise;
    return { redemptionPct: pct, redemptions, incrementalSalesPaise: sales, productCostPaise: cost, discountExposurePaise: discount, grossProfitImpactPaise: sales - cost - discount };
  });
  return {
    label: "Scenario estimate, not a prediction",
    scenarios,
    maxDiscountExposurePaise: i.audienceSize * i.discountPerRedemptionPaise,
    assumptions: [
      `Redemption rates of ${REDEMPTION_SCENARIOS_PCT.join("%, ")}% are assumptions; no past campaign data supports a specific rate.`,
      `Basket value per redemption: ₹${(i.basketPaise / 100).toFixed(0)}. Product cost: ${Math.round(i.costRate * 100)}% of the basket.`,
      "Every redemption is counted as an extra sale, which overstates the real lift.",
      ...assumptions,
    ],
  };
}

/** Udhaar facility: exposure, not revenue. */
export const creditExposure = (limits: { limitPaise: number; currentBalancePaise: number }[]) => ({
  label: "Risk exposure, not revenue",
  maxExposurePaise: limits.reduce((t, l) => t + l.limitPaise, 0),
  newExposurePaise: limits.reduce((t, l) => t + Math.max(0, l.limitPaise - l.currentBalancePaise), 0),
  assumptions: ["No sales lift is estimated for a credit facility.", "Approving records the offer only; no credit is given until you record it in the Udhaar ledger."],
});
