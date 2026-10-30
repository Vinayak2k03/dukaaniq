import "server-only";
import { db } from "@/lib/db";
import { LOCAL, num, paidInRange } from "./queries";
import { withConfidence, type Heatmap, type ProductPair } from "./insights-math";
import type { ResolvedRange } from "./range";

/**
 * Deterministic queries for the growth-tips engine. Same rules as queries.ts: paid + completed sales only,
 * sales totals from `sale` (never summed after joining `sale_item`), money in integer paise, Asia/Kolkata.
 */

export type CustomerValue = {
  customerId: string;
  orders: number;
  netSpendPaise: number;
  averageOrderValuePaise: number;
  firstPurchaseDate: string;
  lastPurchaseDate: string;
  topCategory: string | null;
};

export async function getCustomerValue(merchantId: string, r: ResolvedRange): Promise<CustomerValue[]> {
  const [totals, cats] = await Promise.all([
    db.$queryRaw<{ id: string; orders: bigint; spend: bigint; first: string; last: string }[]>`
      SELECT s."customerId" AS id, COUNT(*)::bigint AS orders,
             COALESCE(ROUND(SUM(s."netAmount") * 100), 0)::bigint AS spend,
             to_char(MIN((s."saleDate" AT TIME ZONE 'UTC') AT TIME ZONE ${LOCAL}), 'YYYY-MM-DD') AS first,
             to_char(MAX((s."saleDate" AT TIME ZONE 'UTC') AT TIME ZONE ${LOCAL}), 'YYYY-MM-DD') AS last
      FROM sale s WHERE ${paidInRange(merchantId, r)} AND s."customerId" IS NOT NULL
      GROUP BY s."customerId"`,
    // Item-level revenue only picks the favourite category; it is never added to sale totals.
    db.$queryRaw<{ id: string; category: string }[]>`
      SELECT DISTINCT ON (s."customerId") s."customerId" AS id, p."category" AS category
      FROM sale_item i JOIN sale s ON s."id" = i."saleId" JOIN product p ON p."id" = i."productId"
      WHERE ${paidInRange(merchantId, r)} AND s."customerId" IS NOT NULL AND p."category" IS NOT NULL
      GROUP BY s."customerId", p."category"
      ORDER BY s."customerId", SUM(i."lineTotal") DESC, p."category"`,
  ]);
  const top = new Map(cats.map((c) => [c.id, c.category]));
  return totals.map((t) => {
    const orders = num(t.orders);
    const spend = num(t.spend);
    return {
      customerId: t.id,
      orders,
      netSpendPaise: spend,
      averageOrderValuePaise: orders ? Math.round(spend / orders) : 0,
      firstPurchaseDate: t.first,
      lastPurchaseDate: t.last,
      topCategory: top.get(t.id) ?? null,
    };
  });
}

/** Orders and net sales by ISO weekday (1 = Monday) and local hour, plus how many calendar weeks had any sale. */
export async function getHourlyHeatmap(merchantId: string, r: ResolvedRange): Promise<Heatmap> {
  const [cells, weeks] = await Promise.all([
    db.$queryRaw<{ dow: number; hour: number; orders: bigint; sales: bigint }[]>`
      SELECT EXTRACT(ISODOW FROM (s."saleDate" AT TIME ZONE 'UTC') AT TIME ZONE ${LOCAL})::int AS dow,
             EXTRACT(HOUR FROM (s."saleDate" AT TIME ZONE 'UTC') AT TIME ZONE ${LOCAL})::int AS hour,
             COUNT(*)::bigint AS orders,
             COALESCE(ROUND(SUM(s."netAmount") * 100), 0)::bigint AS sales
      FROM sale s WHERE ${paidInRange(merchantId, r)}
      GROUP BY 1, 2 ORDER BY 1, 2`,
    db.$queryRaw<{ weeks: bigint; orders: bigint }[]>`
      SELECT COUNT(DISTINCT date_trunc('week', (s."saleDate" AT TIME ZONE 'UTC') AT TIME ZONE ${LOCAL}))::bigint AS weeks,
             COUNT(*)::bigint AS orders
      FROM sale s WHERE ${paidInRange(merchantId, r)}`,
  ]);
  return {
    cells: cells.map((c) => ({ dow: c.dow, hour: c.hour, orders: num(c.orders), netSalesPaise: num(c.sales) })),
    weeksObserved: num(weeks[0]?.weeks),
    totalOrders: num(weeks[0]?.orders),
    fromDate: r.fromDate,
    toDate: r.toDate,
  };
}

export type PairResult = { pairs: ProductPair[]; baskets: number };

/** Products bought together in the same paid sale, with support (sales containing both) and confidence. */
export async function getProductPairs(merchantId: string, r: ResolvedRange, minSupport = 3): Promise<PairResult> {
  const [rows, counts] = await Promise.all([
    db.$queryRaw<{ a: string; b: string; support: bigint }[]>`
      WITH basket AS (
        SELECT DISTINCT i."saleId", i."productId" FROM sale_item i JOIN sale s ON s."id" = i."saleId"
        WHERE ${paidInRange(merchantId, r)}
      )
      SELECT x."productId" AS a, y."productId" AS b, COUNT(*)::bigint AS support
      FROM basket x JOIN basket y ON x."saleId" = y."saleId" AND x."productId" < y."productId"
      GROUP BY 1, 2 HAVING COUNT(*) >= ${minSupport}`,
    db.$queryRaw<{ id: string | null; n: bigint }[]>`
      SELECT i."productId" AS id, COUNT(DISTINCT i."saleId")::bigint AS n
      FROM sale_item i JOIN sale s ON s."id" = i."saleId"
      WHERE ${paidInRange(merchantId, r)}
      GROUP BY ROLLUP (i."productId")`,
  ]);
  const basketsWith = new Map(counts.flatMap((c) => (c.id ? [[c.id, num(c.n)] as const] : [])));
  const baskets = num(counts.find((c) => c.id === null)?.n);
  return { pairs: withConfidence(rows.map((x) => ({ a: x.a, b: x.b, support: num(x.support) })), basketsWith), baskets };
}

export type CatalogProduct = { productId: string; name: string; category: string | null; pricePaise: number; costPaise: number };

export async function getCatalog(merchantId: string): Promise<CatalogProduct[]> {
  const rows = await db.product.findMany({ where: { merchantId }, select: { id: true, name: true, category: true, sellingPrice: true, costPrice: true }, orderBy: { name: "asc" } });
  const paise = (d: { mul(n: number): { toDecimalPlaces(n: number): { toNumber(): number } } }) => d.mul(100).toDecimalPlaces(0).toNumber();
  return rows.map((p) => ({ productId: p.id, name: p.name, category: p.category, pricePaise: paise(p.sellingPrice), costPaise: paise(p.costPrice) }));
}
