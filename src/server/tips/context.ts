import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getCatalog, getCustomerValue, getHourlyHeatmap, getProductPairs } from "@/server/analytics/insights";
import { getCustomerRecency, getProductStats, getSalesTrend, getSummary } from "@/server/analytics/queries";
import { addDays, resolveRange, type ResolvedRange } from "@/server/analytics/range";
import { listAccounts } from "@/server/credit/service";
import { FESTIVALS } from "./festivals";
import { buildHistory } from "./history";
import type { TipContext } from "./types";

type Merchant = { id: string; isDemo: boolean; shopName: string };

const custom = (ref: string, from: string, to: string): ResolvedRange => resolveRange({ range: "custom", from, to }, ref).range;

/**
 * Runs every deterministic query the generators need, once per tips session. The result is stored in
 * TipSession.context so "more tips" and feedback re-rank without touching the database again.
 */
export async function buildContext(merchant: Merchant, ref: string, nonce: string): Promise<TipContext> {
  const r90 = custom(ref, addDays(ref, -89), ref);
  const r30 = custom(ref, addDays(ref, -29), ref);
  const rPrior = custom(ref, addDays(ref, -119), addDays(ref, -30));
  const r180 = custom(ref, addDays(ref, -179), ref);
  const r56 = custom(ref, addDays(ref, -55), ref);
  const policy = await db.creditPolicy.findUnique({ where: { merchantId: merchant.id }, select: { gracePeriodDays: true } });
  const graceDays = policy?.gracePeriodDays ?? 0;

  const [history, summary, value90, value180, recency, people, catalog, stats90, stats30, statsPrior, pairs, heatmap, daily, accounts] = await Promise.all([
    buildHistory(merchant.id, ref),
    getSummary(merchant.id, r90),
    getCustomerValue(merchant.id, r90),
    getCustomerValue(merchant.id, r180),
    getCustomerRecency(merchant.id, ref),
    db.customer.findMany({ where: { merchantId: merchant.id }, select: { id: true, preferredLanguage: true, optedInAt: true, optedOutAt: true, isSynthetic: true } }),
    getCatalog(merchant.id),
    getProductStats(merchant.id, r90),
    getProductStats(merchant.id, r30),
    getProductStats(merchant.id, rPrior),
    getProductPairs(merchant.id, r90, 3),
    getHourlyHeatmap(merchant.id, r56),
    getSalesTrend(merchant.id, { ...r180, granularity: "day" }),
    listAccounts(merchant, ref, graceDays),
  ]);

  const v90 = new Map(value90.map((v) => [v.customerId, v]));
  const v180 = new Map(value180.map((v) => [v.customerId, v]));
  const info = new Map(people.map((p) => [p.id, p]));
  const qty = (list: typeof stats90) => new Map(list.map((s) => [s.productId, s]));
  const [s90, s30, sPrior] = [qty(stats90), qty(stats30), qty(statsPrior)];

  return {
    merchant: { id: merchant.id, shopName: merchant.shopName, isDemo: merchant.isDemo },
    ref,
    nonce,
    minMarginPct: env.MIN_MARGIN_PCT,
    graceDays,
    shop: { orders90: summary.orders, netSales90Paise: summary.netSalesPaise, aov90Paise: summary.averageOrderValuePaise, grossProfit90Paise: summary.grossProfitPaise },
    customers: recency.map((r) => {
      const p = info.get(r.customerId);
      const v = v90.get(r.customerId);
      return {
        id: r.customerId,
        name: r.name,
        language: p?.preferredLanguage ?? "ENGLISH",
        segment: r.segment,
        daysSince: r.daysSinceLastPurchase,
        lastPurchaseDate: r.lastPurchaseDate,
        orders90: v?.orders ?? 0,
        spend90Paise: v?.netSpendPaise ?? 0,
        aov90Paise: v?.averageOrderValuePaise ?? 0,
        orders180: v180.get(r.customerId)?.orders ?? 0,
        topCategory: v?.topCategory ?? v180.get(r.customerId)?.topCategory ?? null,
        optedIn: Boolean(p?.optedInAt),
        optedOut: Boolean(p?.optedOutAt),
        synthetic: p?.isSynthetic ?? false,
      };
    }),
    products: catalog.map((c) => ({
      id: c.productId,
      name: c.name,
      category: c.category,
      pricePaise: c.pricePaise,
      costPaise: c.costPaise,
      qty30: s30.get(c.productId)?.quantity ?? 0,
      qtyPrior90: sPrior.get(c.productId)?.quantity ?? 0,
      qty90: s90.get(c.productId)?.quantity ?? 0,
      revenue90Paise: s90.get(c.productId)?.revenuePaise ?? 0,
      profit90Paise: s90.get(c.productId)?.grossProfitPaise ?? 0,
    })),
    pairs: { list: pairs.pairs, baskets: pairs.baskets, fromDate: r90.fromDate, toDate: r90.toDate },
    heatmap,
    daily: daily.map((d) => ({ date: d.label, netSalesPaise: d.netSalesPaise, orders: d.orders })),
    credit: accounts
      .filter((a) => a.entryCount > 0)
      .map((a) => ({
        customerId: a.customerId,
        name: a.name,
        entryCount: a.entryCount,
        creditGivenPaise: a.account.creditGivenPaise,
        repaidPaise: a.account.repaidPaise,
        balancePaise: a.account.balancePaise,
        overduePaise: a.account.overduePaise,
        pastGracePaise: a.account.pastGracePaise,
        daysOverdue: a.account.daysOverdue,
      })),
    festivals: FESTIVALS,
    history,
  };
}
