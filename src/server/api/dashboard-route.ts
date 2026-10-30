import "server-only";
import { parseDashboardQuery, type DashboardQuery } from "@/lib/validation/dashboard";
import { prepareRange } from "@/server/analytics/dashboard";
import type { ResolvedRange } from "@/server/analytics/range";
import { getApiMerchantAccess } from "@/server/merchant/access";

type Ctx = {
  merchant: { id: string; isDemo: boolean };
  query: DashboardQuery;
  range: ResolvedRange;
  referenceDate: string;
};

/**
 * Shared wrapper for analytics Route Handlers: authenticates, resolves the
 * merchant from the user's membership, validates query params with Zod, and
 * turns failures into JSON errors (401/403/400/500). Never fabricates data.
 */
export async function dashboardRoute(request: Request, handler: (ctx: Ctx) => Promise<unknown>) {
  const access = await getApiMerchantAccess();
  if ("error" in access) return access.error;

  const { query, error } = parseDashboardQuery(new URL(request.url).searchParams);
  if (error) return Response.json({ error }, { status: 400 });

  const { range, referenceDate, error: rangeError } = prepareRange(access.merchant, query);
  if (rangeError) return Response.json({ error: rangeError }, { status: 400 });

  try {
    return Response.json(await handler({ merchant: access.merchant, query, range, referenceDate }));
  } catch (e) {
    console.error("analytics route failed:", e);
    return Response.json({ error: "Could not load analytics. Please try again." }, { status: 500 });
  }
}

export const describeRange = (r: ResolvedRange, referenceDate: string) => ({
  key: r.key,
  from: r.fromDate,
  to: r.toDate,
  days: r.days,
  granularity: r.granularity,
  referenceDate,
});
