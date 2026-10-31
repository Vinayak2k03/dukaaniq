import { dashboardRoute, describeRange } from "@/server/api/dashboard-route";
import { getSalesTrend } from "@/server/analytics/queries";

export const GET = (request: Request) =>
  dashboardRoute(request, async ({ merchant, range, referenceDate, query }) => ({
    range: describeRange(range, referenceDate),
    points: await getSalesTrend(merchant.id, range, query.category),
  }));
