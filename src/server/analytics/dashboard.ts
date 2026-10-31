import "server-only";
import type { DashboardQuery } from "@/lib/validation/dashboard";
import { resolveRange, referenceDateFor, type ResolvedRange } from "./range";
import {
  countSegments,
  getCategories,
  getCustomerRecency,
  getPaymentMix,
  getProductStats,
  getRecentSales,
  getSalesTrend,
  getSummary,
  inactiveCustomers,
} from "./queries";

export type DashboardMerchant = { id: string; isDemo: boolean };

export function prepareRange(merchant: DashboardMerchant, query: DashboardQuery) {
  const referenceDate = referenceDateFor(merchant);
  return { referenceDate, ...resolveRange(query, referenceDate) };
}

export async function getDashboardData(merchant: DashboardMerchant, range: ResolvedRange, referenceDate: string, category?: string) {
  const id = merchant.id;
  const [summary, trend, products, categories, paymentMix, recency, recentSales] = await Promise.all([
    getSummary(id, range, category),
    getSalesTrend(id, range, category),
    getProductStats(id, range, category),
    getCategories(id),
    getPaymentMix(id, range, category),
    getCustomerRecency(id, referenceDate),
    getRecentSales(id, range, 10, category),
  ]);
  return { summary, trend, products, categories, paymentMix, segments: countSegments(recency), inactiveCount: inactiveCustomers(recency).length, recentSales };
}
