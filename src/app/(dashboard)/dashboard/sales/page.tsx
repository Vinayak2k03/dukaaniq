import type { Metadata } from "next";
import Link from "next/link";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { EmptyState, Panel } from "@/components/dashboard/panel";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Receipt, Wallet, Percent, ChevronRight } from "@/components/ui/icons";
import { formatLocalDate, formatPaise } from "@/lib/money";
import { parseDashboardQuery } from "@/lib/validation/dashboard";
import { getDashboardData, prepareRange } from "@/server/analytics/dashboard";
import { requireSession } from "@/server/auth/session";
import { getCurrentMembership } from "@/server/merchant/access";

export const metadata: Metadata = { title: "Sales" };

export default async function SalesAnalyticsPage({ searchParams }: PageProps<"/dashboard">) {
  const session = await requireSession();
  const membership = await getCurrentMembership(session.user.id);
  if (!membership) return <EmptyState message="Set up your shop to view analytics." />;

  const merchant = membership.merchant;
  const { query, error: queryError } = parseDashboardQuery(await searchParams);
  const { range, referenceDate, error: rangeError } = prepareRange(merchant, query);

  let data: Awaited<ReturnType<typeof getDashboardData>> | null = null;
  try {
    data = await getDashboardData(merchant, range, referenceDate, query.category);
  } catch (e) {
    console.error("Sales analytics failed to load:", e);
  }

  if (!data) {
    return <EmptyState message="Unable to load sales analytics. Please refresh." />;
  }

  const { summary, trend, products, paymentMix } = data;
  const marginPct =
    summary.netSalesPaise > 0
      ? ((summary.grossProfitPaise / summary.netSalesPaise) * 100).toFixed(1)
      : "0";

  // Category breakdown calculation from products
  const categoryMap = new Map<string, { qty: number; revenuePaise: number; profitPaise: number }>();
  for (const p of products) {
    const cat = p.category ?? "Uncategorized";
    const existing = categoryMap.get(cat) ?? { qty: 0, revenuePaise: 0, profitPaise: 0 };
    categoryMap.set(cat, {
      qty: existing.qty + p.quantity,
      revenuePaise: existing.revenuePaise + p.revenuePaise,
      profitPaise: existing.profitPaise + p.grossProfitPaise,
    });
  }

  const categoryBreakdown = Array.from(categoryMap.entries())
    .map(([category, stats]) => ({
      category,
      ...stats,
      marginPct: stats.revenuePaise > 0 ? ((stats.profitPaise / stats.revenuePaise) * 100).toFixed(1) : "0",
    }))
    .sort((a, b) => b.revenuePaise - a.revenuePaise);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E4E9] pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#171A23]">Sales</h1>
          <p className="mt-1 text-xs text-[#737B8C]">
            How much you sold, which products earn the most, and how it is changing.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <Badge variant="brand" size="sm">
            {range.granularity.toUpperCase()} VIEW
          </Badge>
          <span className="text-[#737B8C]">
            {formatLocalDate(range.fromDate)} &rarr; {formatLocalDate(range.toDate)}
          </span>
        </div>
      </div>

      {/* Filter Bar */}
      <FilterBar query={{ ...query, range: range.key }} categories={data.categories} />

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total Net Sales"
          value={formatPaise(summary.netSalesPaise)}
          hint="Post discounts and merchant vouchers"
          icon={<TrendingUp size={16} />}
        />
        <KpiCard
          label="Estimated Gross Margin"
          value={`${marginPct}%`}
          hint={formatPaise(summary.grossProfitPaise) + " gross profit"}
          icon={<Percent size={16} />}
        />
        <KpiCard
          label="Transaction Volume"
          value={`${summary.orders.toLocaleString("en-IN")} orders`}
          hint="Completed and paid checkouts"
          icon={<Receipt size={16} />}
        />
        <KpiCard
          label="Average bill"
          value={summary.orders ? formatPaise(summary.averageOrderValuePaise) : "₹0"}
          hint={`${summary.customersServed} distinct customers`}
          icon={<Wallet size={16} />}
        />
      </div>

      {/* Trends Section */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="Revenue Trend"
          subtitle={`Aggregated net sales per ${range.granularity}`}
          badge={<Badge variant="brand" size="sm">₹ INR</Badge>}
        >
          <TrendChart
            title="Revenue Trend"
            color="indigo"
            points={trend.map((p) => ({
              label: p.label,
              value: p.netSalesPaise,
              display: formatPaise(p.netSalesPaise),
            }))}
          />
        </Panel>

        <Panel
          title="Checkout Volume Trend"
          subtitle={`Paid transactions per ${range.granularity}`}
          badge={<Badge variant="neutral" size="sm">Transactions</Badge>}
        >
          <TrendChart
            title="Orders Trend"
            color="emerald"
            points={trend.map((p) => ({
              label: p.label,
              value: p.orders,
              display: `${p.orders} orders`,
            }))}
          />
        </Panel>
      </div>

      {/* Category Performance Breakdown */}
      <Panel
        title="Category Sales & Margin Breakdown"
        subtitle="Performance grouped by inventory category for this period"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#E2E4E9] text-[11px] font-semibold uppercase tracking-wider text-[#737B8C]">
                <th scope="col" className="pb-3 pr-4">Category</th>
                <th scope="col" className="pb-3 pr-4 text-center">Units Sold</th>
                <th scope="col" className="pb-3 pr-4 text-right">Revenue (₹)</th>
                <th scope="col" className="pb-3 pr-4 text-right">Gross Profit (₹)</th>
                <th scope="col" className="pb-3 text-right">Profit Margin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F2F5]">
              {categoryBreakdown.map((c) => (
                <tr key={c.category} className="hover:bg-[#F8F9FB] transition-colors">
                  <td className="py-3 pr-4 font-semibold text-[#171A23]">{c.category}</td>
                  <td className="py-3 pr-4 text-center font-mono tabular-nums text-[#525866]">
                    {c.qty.toLocaleString("en-IN")}
                  </td>
                  <td className="py-3 pr-4 text-right font-mono font-medium text-[#171A23] tabular-nums">
                    {formatPaise(c.revenuePaise)}
                  </td>
                  <td className="py-3 pr-4 text-right font-mono font-medium text-emerald-700 tabular-nums">
                    {formatPaise(c.profitPaise)}
                  </td>
                  <td className="py-3 text-right font-mono font-semibold text-[#171A23] tabular-nums">
                    {c.marginPct}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Complete Product Sales Performance Matrix */}
      <Panel
        title={`Product Inventory Sales Matrix (${products.length} items)`}
        subtitle="All SKU sales, revenue, cost calculations and gross margins"
      >
        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-[#E2E4E9] text-[11px] font-semibold uppercase tracking-wider text-[#737B8C]">
                <th scope="col" className="pb-3 pr-4">Product Name</th>
                <th scope="col" className="pb-3 pr-4">Category</th>
                <th scope="col" className="pb-3 pr-4 text-center">Qty Sold</th>
                <th scope="col" className="pb-3 pr-4 text-right">Total Revenue</th>
                <th scope="col" className="pb-3 pr-4 text-right">Est. Profit</th>
                <th scope="col" className="pb-3 text-right">Margin %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F2F5]">
              {products
                .sort((a, b) => b.revenuePaise - a.revenuePaise)
                .map((p) => {
                  const itemMargin =
                    p.revenuePaise > 0
                      ? ((p.grossProfitPaise / p.revenuePaise) * 100).toFixed(1)
                      : "0";
                  return (
                    <tr key={p.productId} className="hover:bg-[#F8F9FB] transition-colors">
                      <td className="py-3 pr-4 font-medium text-[#171A23]">{p.name}</td>
                      <td className="py-3 pr-4 text-[#737B8C]">{p.category ?? "-"}</td>
                      <td className="py-3 pr-4 text-center font-mono tabular-nums text-[#525866]">
                        {p.quantity.toLocaleString("en-IN")}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono font-medium text-[#171A23] tabular-nums">
                        {formatPaise(p.revenuePaise)}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono font-medium text-emerald-700 tabular-nums">
                        {formatPaise(p.grossProfitPaise)}
                      </td>
                      <td className="py-3 text-right font-mono font-semibold text-[#171A23] tabular-nums">
                        {itemMargin}%
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

