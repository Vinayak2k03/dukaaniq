/** Pure comparison of measured outcomes against the scenario estimate stored on a version (PRD 11.2, 15). */

export type OutcomeRow = { type: string; customerId: string | null; amountPaise: number };
type Scenario = { redemptionPct: number; redemptions: number; incrementalSalesPaise: number };

export type OutcomeSummary = {
  customersReached: number;
  customersConverted: number;
  redemptions: number;
  returns: number;
  measuredSalesPaise: number;
  conversionPct: number;
  estimate: { lowRedemptions: number; highRedemptions: number; lowSalesPaise: number; highSalesPaise: number } | null;
  /** Where the measured result sits against the estimated range. */
  verdict: "no-data" | "below" | "within" | "above" | "no-estimate";
};

export function summarizeOutcomes(rows: OutcomeRow[], audienceSize: number, economics: unknown): OutcomeSummary {
  const converted = new Set(rows.flatMap((r) => (r.customerId ? [r.customerId] : [])));
  const redemptions = rows.filter((r) => r.type === "OFFER_REDEEMED").length;
  const returns = rows.filter((r) => r.type === "CUSTOMER_RETURNED").length;
  const measuredSalesPaise = rows.reduce((s, r) => s + r.amountPaise, 0);
  const e = economics && typeof economics === "object" ? (economics as Record<string, unknown>) : {};
  const scenarios = Array.isArray(e.scenarios) ? (e.scenarios as Scenario[]) : [];
  const estimate = scenarios.length
    ? {
        lowRedemptions: Math.min(...scenarios.map((s) => s.redemptions)),
        highRedemptions: Math.max(...scenarios.map((s) => s.redemptions)),
        lowSalesPaise: Math.min(...scenarios.map((s) => s.incrementalSalesPaise)),
        highSalesPaise: Math.max(...scenarios.map((s) => s.incrementalSalesPaise)),
      }
    : null;
  const conversions = converted.size;
  const verdict: OutcomeSummary["verdict"] =
    rows.length === 0 ? "no-data" : !estimate ? "no-estimate" : conversions < estimate.lowRedemptions ? "below" : conversions > estimate.highRedemptions ? "above" : "within";
  return {
    customersReached: audienceSize,
    customersConverted: conversions,
    redemptions,
    returns,
    measuredSalesPaise,
    conversionPct: audienceSize > 0 ? Math.round((conversions / audienceSize) * 1000) / 10 : 0,
    estimate,
    verdict,
  };
}
