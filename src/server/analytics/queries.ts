import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { daysBetween, type ResolvedRange } from "./range";

/**
 * Deterministic analytics (PRD 5). Rules:
 * - Sales totals come from `sale`; product totals come from `sale_item` (never summed after a join).
 * - "Paid" means paymentStatus = PAID and status = COMPLETED.
 * - Money is returned as integer paise. Day/week/month buckets use Asia/Kolkata.
 * - Every query is scoped by a merchantId that the caller obtained from a verified membership.
 */

export const LOCAL = Prisma.sql`'Asia/Kolkata'`;
export const ts = (d: Date) => Prisma.sql`(${d.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
export const num = (v: bigint | number | null | undefined) => Number(v ?? 0);

export const paidInRange = (merchantId: string, r: ResolvedRange) =>
  Prisma.sql`s."merchantId" = ${merchantId} AND s."paymentStatus" = 'PAID' AND s."status" = 'COMPLETED'
    AND s."saleDate" >= ${ts(r.startUtc)} AND s."saleDate" < ${ts(r.endExclusiveUtc)}`;

export type Summary = {
  netSalesPaise: number;
  orders: number;
  averageOrderValuePaise: number;
  customersServed: number;
  grossProfitPaise: number;
};

export async function getSummary(merchantId: string, r: ResolvedRange): Promise<Summary> {
  const [sales, profit] = await Promise.all([
    db.$queryRaw<{ sales: bigint; orders: bigint; customers: bigint }[]>`
      SELECT COALESCE(ROUND(SUM(s."netAmount") * 100), 0)::bigint AS sales,
             COUNT(*)::bigint AS orders,
             COUNT(DISTINCT s."customerId")::bigint AS customers
      FROM sale s WHERE ${paidInRange(merchantId, r)}`,
    db.$queryRaw<{ v: bigint }[]>`
      SELECT COALESCE(ROUND(SUM(i."lineTotal" - i."lineCost") * 100), 0)::bigint AS v
      FROM sale_item i JOIN sale s ON s."id" = i."saleId"
      WHERE ${paidInRange(merchantId, r)}`,
  ]);
  const netSalesPaise = num(sales[0]?.sales);
  const orders = num(sales[0]?.orders);
  return {
    netSalesPaise,
    orders,
    averageOrderValuePaise: orders === 0 ? 0 : Math.round(netSalesPaise / orders),
    customersServed: num(sales[0]?.customers),
    grossProfitPaise: num(profit[0]?.v),
  };
}

export type TrendPoint = { label: string; netSalesPaise: number; orders: number };

export async function getSalesTrend(merchantId: string, r: ResolvedRange): Promise<TrendPoint[]> {
  const g = Prisma.raw(`'${r.granularity}'`); // from a fixed enum, never user input
  const interval = Prisma.raw(`interval '1 ${r.granularity}'`);
  const rows = await db.$queryRaw<{ label: string; sales: bigint; orders: bigint }[]>`
    WITH b AS (
      SELECT generate_series(
        date_trunc(${g}, ${r.fromDate}::date::timestamp),
        ${r.toDate}::date::timestamp,
        ${interval}
      ) AS bucket
    )
    SELECT to_char(b.bucket, 'YYYY-MM-DD') AS label,
           COALESCE(ROUND(SUM(s."netAmount") * 100), 0)::bigint AS sales,
           COUNT(s."id")::bigint AS orders
    FROM b LEFT JOIN sale s
      ON date_trunc(${g}, (s."saleDate" AT TIME ZONE 'UTC') AT TIME ZONE ${LOCAL}) = b.bucket
     AND ${paidInRange(merchantId, r)}
    GROUP BY b.bucket ORDER BY b.bucket`;
  return rows.map((x) => ({ label: x.label, netSalesPaise: num(x.sales), orders: num(x.orders) }));
}

export type ProductStat = {
  productId: string;
  name: string;
  category: string | null;
  quantity: number;
  revenuePaise: number;
  grossProfitPaise: number;
};

export async function getProductStats(merchantId: string, r: ResolvedRange, category?: string): Promise<ProductStat[]> {
  const categoryFilter = category ? Prisma.sql`AND p."category" = ${category}` : Prisma.empty;
  const rows = await db.$queryRaw<
    { id: string; name: string; category: string | null; qty: string; revenue: bigint; profit: bigint }[]
  >`
    SELECT p."id", p."name", p."category",
           SUM(i."quantity")::text AS qty,
           ROUND(SUM(i."lineTotal") * 100)::bigint AS revenue,
           ROUND(SUM(i."lineTotal" - i."lineCost") * 100)::bigint AS profit
    FROM sale_item i
    JOIN sale s ON s."id" = i."saleId"
    JOIN product p ON p."id" = i."productId"
    WHERE ${paidInRange(merchantId, r)} ${categoryFilter}
    GROUP BY p."id", p."name", p."category"`;
  return rows.map((x) => ({
    productId: x.id,
    name: x.name,
    category: x.category,
    quantity: Number(x.qty),
    revenuePaise: num(x.revenue),
    grossProfitPaise: num(x.profit),
  }));
}

export async function getCategories(merchantId: string): Promise<string[]> {
  const rows = await db.product.findMany({
    where: { merchantId, category: { not: null } },
    select: { category: true },
    distinct: ["category"],
    orderBy: { category: "asc" },
  });
  return rows.flatMap((r) => (r.category ? [r.category] : []));
}

export type PaymentMix = { method: string; orders: number; netSalesPaise: number };

export async function getPaymentMix(merchantId: string, r: ResolvedRange): Promise<PaymentMix[]> {
  const rows = await db.$queryRaw<{ method: string; orders: bigint; sales: bigint }[]>`
    SELECT s."paymentMethod"::text AS method, COUNT(*)::bigint AS orders,
           COALESCE(ROUND(SUM(s."netAmount") * 100), 0)::bigint AS sales
    FROM sale s WHERE ${paidInRange(merchantId, r)}
    GROUP BY s."paymentMethod" ORDER BY sales DESC`;
  return rows.map((x) => ({ method: x.method, orders: num(x.orders), netSalesPaise: num(x.sales) }));
}

export type Segment = "ACTIVE" | "COOLING_OFF" | "INACTIVE" | "NO_PURCHASE";
export type CustomerRecency = {
  customerId: string;
  name: string;
  lastPurchaseDate: string | null;
  daysSinceLastPurchase: number | null;
  segment: Segment;
};

export const SEGMENT_RULES = { activeMaxDays: 14, coolingMaxDays: 30 } as const;

/** Current-state segmentation as of the reference date; not affected by the date-range filter. */
export async function getCustomerRecency(merchantId: string, referenceDate: string): Promise<CustomerRecency[]> {
  const refEnd = new Date(Date.parse(`${referenceDate}T00:00:00Z`) + 86_400_000 - 330 * 60_000);
  const rows = await db.$queryRaw<{ id: string; name: string; last: string | null }[]>`
    SELECT c."id", c."displayName" AS name,
           to_char(MAX((s."saleDate" AT TIME ZONE 'UTC') AT TIME ZONE ${LOCAL}), 'YYYY-MM-DD') AS last
    FROM customer c LEFT JOIN sale s
      ON s."customerId" = c."id" AND s."merchantId" = c."merchantId"
     AND s."paymentStatus" = 'PAID' AND s."status" = 'COMPLETED'
     AND s."saleDate" < ${ts(refEnd)}
    WHERE c."merchantId" = ${merchantId}
    GROUP BY c."id", c."displayName"`;
  return rows.map((x) => {
    const days = x.last ? daysBetween(x.last, referenceDate) : null;
    const segment: Segment =
      days === null ? "NO_PURCHASE" : days <= SEGMENT_RULES.activeMaxDays ? "ACTIVE" : days <= SEGMENT_RULES.coolingMaxDays ? "COOLING_OFF" : "INACTIVE";
    return { customerId: x.id, name: x.name, lastPurchaseDate: x.last, daysSinceLastPurchase: days, segment };
  });
}

export const countSegments = (rows: CustomerRecency[]): Record<Segment, number> =>
  rows.reduce<Record<Segment, number>>((acc, r) => ({ ...acc, [r.segment]: acc[r.segment] + 1 }), { ACTIVE: 0, COOLING_OFF: 0, INACTIVE: 0, NO_PURCHASE: 0 });

export const inactiveCustomers = (rows: CustomerRecency[]) =>
  rows.filter((r) => r.segment === "INACTIVE").sort((a, b) => (b.daysSinceLastPurchase ?? 0) - (a.daysSinceLastPurchase ?? 0));

export type RecentSale = {
  id: string;
  saleDate: Date;
  customerName: string | null;
  itemCount: number;
  netAmountPaise: number;
  paymentMethod: string;
  paymentStatus: string;
  status: string;
};

export async function getRecentSales(merchantId: string, r: ResolvedRange, take = 10): Promise<RecentSale[]> {
  const rows = await db.sale.findMany({
    where: { merchantId, saleDate: { gte: r.startUtc, lt: r.endExclusiveUtc } },
    orderBy: { saleDate: "desc" },
    take,
    select: {
      id: true,
      saleDate: true,
      netAmount: true,
      paymentMethod: true,
      paymentStatus: true,
      status: true,
      customer: { select: { displayName: true } },
      _count: { select: { items: true } },
    },
  });
  return rows.map((s) => ({
    id: s.id,
    saleDate: s.saleDate,
    customerName: s.customer?.displayName ?? null,
    itemCount: s._count.items,
    netAmountPaise: s.netAmount.mul(100).toDecimalPlaces(0).toNumber(),
    paymentMethod: s.paymentMethod,
    paymentStatus: s.paymentStatus,
    status: s.status,
  }));
}
