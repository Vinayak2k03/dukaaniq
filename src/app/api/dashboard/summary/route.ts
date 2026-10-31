import { dashboardRoute, describeRange } from "@/server/api/dashboard-route";
import { SEGMENT_RULES, countSegments, getCustomerRecency, getSummary } from "@/server/analytics/queries";

export const GET = (request: Request) =>
  dashboardRoute(request, async ({ merchant, range, referenceDate, query }) => {
    const [summary, recency] = await Promise.all([getSummary(merchant.id, range, query.category), getCustomerRecency(merchant.id, referenceDate)]);
    return {
      range: describeRange(range, referenceDate),
      isDemo: merchant.isDemo,
      summary,
      customerSegments: { asOf: referenceDate, rules: SEGMENT_RULES, counts: countSegments(recency) },
    };
  });
