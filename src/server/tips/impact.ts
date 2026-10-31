import "server-only";
import { db } from "@/lib/db";
import { getSummary } from "@/server/analytics/queries";
import { istYmd, rangeBetween } from "@/server/analytics/range";
import { compareWindows, impactWindows, verdictOf, type Compare, type DayWindow, type Totals, type Verdict } from "./impact-math";

export type TipImpact = {
  recommendationId: string;
  title: string;
  family: string | null;
  approvedAt: Date;
  before: DayWindow;
  after: DayWindow;
  shop: Compare & { verdict: Verdict; profitPerDayBefore: number; profitPerDayAfter: number };
  /** Only the customers the tip was aimed at. null for in-store tips with no audience. */
  audience: (Compare & { verdict: Verdict; customers: number }) | null;
  /** Sales that used a code issued for this tip, after approval. */
  couponSales: { orders: number; netPaise: number };
};

const paise = (d: { toNumber(): number } | null | undefined) => Math.round((d?.toNumber() ?? 0) * 100);

async function cohortTotals(merchantId: string, customerIds: string[], w: DayWindow): Promise<Totals> {
  const r = rangeBetween(w.fromDate, w.toDate);
  const a = await db.sale.aggregate({
    _sum: { netAmount: true },
    _count: { id: true },
    where: { merchantId, customerId: { in: customerIds }, paymentStatus: "PAID", status: "COMPLETED", saleDate: { gte: r.startUtc, lt: r.endExclusiveUtc } },
  });
  return { salesPaise: paise(a._sum.netAmount), orders: a._count.id, profitPaise: null };
}

async function shopTotals(merchantId: string, w: DayWindow): Promise<Totals> {
  const s = await getSummary(merchantId, rangeBetween(w.fromDate, w.toDate));
  return { salesPaise: s.netSalesPaise, orders: s.orders, profitPaise: s.grossProfitPaise };
}

/**
 * Sales before vs after each approved tip: the shop overall, the customers the tip targeted, and coupon redemptions.
 * "After" runs from the day after approval to today (at most 14 days); "before" is the 7 to 28 days just before approval.
 * It shows what happened next to the approval, not proof the tip caused it.
 */
export async function getTipImpacts(merchantId: string, limit = 10, todayYmd = istYmd(new Date())): Promise<TipImpact[]> {
  const approvals = await db.approvalDecision.findMany({
    where: { merchantId, decision: "APPROVED" },
    orderBy: { decidedAt: "desc" },
    take: limit,
    select: {
      decidedAt: true,
      recommendationId: true,
      version: { select: { title: true, evidence: true, audience: { select: { customerId: true } }, couponCodes: { select: { code: true } } } },
    },
  });
  const out: TipImpact[] = [];
  for (const a of approvals) {
    const w = impactWindows(istYmd(a.decidedAt), todayYmd);
    if (!w) continue;
    const ids = a.version.audience.map((x) => x.customerId);
    const codes = a.version.couponCodes.map((c) => c.code);
    const afterRange = rangeBetween(w.after.fromDate, w.after.toDate);
    const [shopB, shopA, audB, audA, coupon] = await Promise.all([
      shopTotals(merchantId, w.before),
      shopTotals(merchantId, w.after),
      ids.length ? cohortTotals(merchantId, ids, w.before) : null,
      ids.length ? cohortTotals(merchantId, ids, w.after) : null,
      codes.length
        ? db.sale.aggregate({ _sum: { netAmount: true }, _count: { id: true }, where: { merchantId, couponCode: { in: codes }, saleDate: { gte: afterRange.startUtc } } })
        : null,
    ]);
    const shop = compareWindows(shopB, w.before.days, shopA, w.after.days);
    out.push({
      recommendationId: a.recommendationId,
      title: a.version.title,
      family: (a.version.evidence as { tip?: { family?: string } } | null)?.tip?.family ?? null,
      approvedAt: a.decidedAt,
      ...w,
      shop: { ...shop, verdict: verdictOf(shop, w.after.days), profitPerDayBefore: Math.round((shopB.profitPaise ?? 0) / w.before.days), profitPerDayAfter: Math.round((shopA.profitPaise ?? 0) / w.after.days) },
      audience: audB && audA ? (() => { const c = compareWindows(audB, w.before.days, audA, w.after.days); return { ...c, verdict: verdictOf(c, w.after.days), customers: ids.length }; })() : null,
      couponSales: { orders: coupon?._count.id ?? 0, netPaise: paise(coupon?._sum.netAmount) },
    });
  }
  return out;
}
