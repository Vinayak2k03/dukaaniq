import { dashboardRoute } from "@/server/api/dashboard-route";
import { SEGMENT_RULES, getCustomerRecency, inactiveCustomers } from "@/server/analytics/queries";

export const GET = (request: Request) =>
  dashboardRoute(request, async ({ merchant, referenceDate }) => ({
    asOf: referenceDate,
    rule: `No paid purchase in the last ${SEGMENT_RULES.coolingMaxDays} days`,
    customers: inactiveCustomers(await getCustomerRecency(merchant.id, referenceDate)),
  }));
