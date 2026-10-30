import { dashboardRoute, describeRange } from "@/server/api/dashboard-route";
import { getProductStats } from "@/server/analytics/queries";

export const GET = (request: Request) =>
  dashboardRoute(request, async ({ merchant, range, referenceDate, query }) => ({
    range: describeRange(range, referenceDate),
    category: query.category ?? null,
    products: await getProductStats(merchant.id, range, query.category),
  }));
