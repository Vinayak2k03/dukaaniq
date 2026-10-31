import type { Metadata } from "next";
import Link from "next/link";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { EmptyState, Panel } from "@/components/dashboard/panel";
import { RankedBars } from "@/components/dashboard/ranked-bars";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  ArrowRight,
  TrendingUp,
  Receipt,
  Users,
  Wallet,
  Clock,
  AlertCircle,
  ExternalLink,
} from "@/components/ui/icons";
import { db } from "@/lib/db";
import { formatDateTimeIST, formatLocalDate, formatPaise } from "@/lib/money";
import { parseDashboardQuery } from "@/lib/validation/dashboard";
import { categoryLabel } from "@/lib/validation/merchant";
import { getDashboardData, prepareRange } from "@/server/analytics/dashboard";
import { SEGMENT_RULES } from "@/server/analytics/queries";
import { requireSession } from "@/server/auth/session";
import { getCurrentMembership } from "@/server/merchant/access";
import { listRecommendations } from "@/server/recommendations/service";
import { ShopAssistant } from "@/components/voice/shop-assistant";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Command Centre" };

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const session = await requireSession();
  const membership = await getCurrentMembership(session.user.id);

  // Time-aware greeting (IST)
  const utcHours = new Date().getUTCHours();
  const istHours = (utcHours + 5.5) % 24;
  const timeGreeting = istHours < 12 ? "Good morning" : istHours < 17 ? "Good afternoon" : "Good evening";

  if (!membership) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="rounded-xl border border-[#E2E4E9] bg-white p-8 text-center shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-[#4338CA]">
            <Sparkles size={24} />
          </div>
          <h1 className="mt-4 text-xl font-bold tracking-tight text-[#171A23]">
            {timeGreeting}, {session.user.name}
          </h1>
          <p className="mt-2 text-sm text-[#737B8C]">
            Complete your shop onboarding to unlock deterministic AI analytics and udhaar recovery.
          </p>
          <div className="mt-6">
            <Link
              href="/onboarding"
              className="inline-flex items-center gap-2 rounded-lg bg-[#4338CA] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#3730A3] transition-colors"
            >
              <span>Set up your shop</span>
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const merchant = membership.merchant;
  const { query, error: queryError } = parseDashboardQuery(await searchParams);
  const { range, referenceDate, error: rangeError } = prepareRange(merchant, query);
  const filterError = queryError ?? rangeError;

  let data: Awaited<ReturnType<typeof getDashboardData>> | null = null;
  let recommendations: Awaited<ReturnType<typeof listRecommendations>> = [];
  let demoCounts: { sales: number; customers: number; credit: number } | null = null;

  try {
    const [dashData, recs, counts] = await Promise.all([
      getDashboardData(merchant, range, referenceDate, query.category),
      listRecommendations(merchant.id).catch(() => []),
      merchant.isDemo
        ? Promise.all([
            db.sale.count({ where: { merchantId: merchant.id } }),
            db.customer.count({ where: { merchantId: merchant.id } }),
            db.creditEntry.count({ where: { merchantId: merchant.id } }),
          ])
        : null,
    ]);
    data = dashData;
    recommendations = recs;
    if (counts) demoCounts = { sales: counts[0], customers: counts[1], credit: counts[2] };
  } catch (e) {
    console.error("Dashboard failed to load:", e);
  }

  // Calculate sparkline and trend comparisons
  const salesSparkline = data?.trend.map((p) => p.netSalesPaise) ?? [];
  const ordersSparkline = data?.trend.map((p) => p.orders) ?? [];

  const calcTrend = (arr: number[]) => {
    if (arr.length < 2) return undefined;
    const mid = Math.floor(arr.length / 2);
    const firstHalf = arr.slice(0, mid).reduce((a, b) => a + b, 0);
    const secondHalf = arr.slice(mid).reduce((a, b) => a + b, 0);
    if (firstHalf === 0) return secondHalf > 0 ? 100 : 0;
    return Number((((secondHalf - firstHalf) / firstHalf) * 100).toFixed(1));
  };

  const salesTrendPct = calcTrend(salesSparkline);
  const ordersTrendPct = calcTrend(ordersSparkline);

  // Pending recommendations
  const pendingRecs = recommendations.filter((r) => r.status === "PENDING_APPROVAL");

  // Total customer base calculation
  const totalCustomers = data
    ? data.segments.ACTIVE + data.segments.COOLING_OFF + data.segments.INACTIVE + data.segments.NO_PURCHASE
    : 0;

  return (
    <div className="space-y-6">
      {/* 1. Header Greeting Section */}
      <section className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E4E9] pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-[#171A23]">
              {timeGreeting}, {session.user.name}
            </h1>
            <Badge variant="brand" size="sm">
              {categoryLabel(merchant.businessCategory)}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-[#737B8C]">
            Here&apos;s what&apos;s happening with <span className="font-medium text-[#171A23]">{merchant.shopName}</span>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 rounded-lg border border-[#E2E4E9] bg-white px-3 py-1.5 text-[#525866] shadow-[0_1px_2px_rgba(16,24,40,0.02)]">
            <Clock size={14} className="text-[#4338CA]" />
            <span>
              As of <strong className="font-semibold text-[#171A23]">{formatLocalDate(referenceDate)}</strong>
            </span>
          </div>

          <Link
            href="/dashboard/sales"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#D0D5DD] bg-white px-3 py-1.5 font-medium text-[#171A23] shadow-xs hover:bg-[#F8F9FA] transition-colors"
          >
            <span>Analytics Workspace</span>
            <ArrowRight size={13} />
          </Link>
        </div>
      </section>

      {/* Voice / typed assistant: questions, udhaar, and adding products, customers and sales without the workbook */}
      <section aria-label="Shop assistant">
        <ShopAssistant sarvam={Boolean(env.SARVAM_API_KEY)} referenceDate={referenceDate} placeholder='Try "2 Maggi aur 1 Parle-G becha, cash" or "naya product add karo"' />
      </section>

      {/* Demo store indicator */}
      {merchant.isDemo && (
        <div
          role="note"
          className="flex items-center justify-between gap-3 rounded-xl border border-amber-200/80 bg-amber-50/70 px-4 py-3 text-xs text-amber-900 shadow-xs"
        >
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-200/70 text-amber-800 font-bold text-[10px]">
              i
            </span>
            <span>
              <strong>Demo store &mdash; synthetic, illustrative data.</strong> Names, phone numbers and sales are made up
              {demoCounts
                ? ` (${demoCounts.sales.toLocaleString("en-IN")} sales, ${demoCounts.customers.toLocaleString("en-IN")} customers, ${demoCounts.credit.toLocaleString("en-IN")} credit entries)`
                : ""}
              . No real message is ever sent to these customers.
            </span>
          </div>
          <span className="shrink-0 font-mono text-[11px] text-amber-700">Reference: {referenceDate}</span>
        </div>
      )}

      {/* Filter Bar */}
      <FilterBar key={`${range.fromDate}|${range.toDate}`} query={{ ...query, range: range.key }} categories={data?.categories ?? []} referenceDate={referenceDate} fromDate={range.fromDate} toDate={range.toDate} />

      {filterError && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
          <AlertCircle size={15} className="text-rose-600" />
          <span>{filterError} Showing the standard 30-day view instead.</span>
        </div>
      )}

      {!data ? (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-8 text-center text-rose-800">
          <AlertCircle size={28} className="mx-auto text-rose-600" />
          <h3 className="mt-3 text-base font-semibold">Unable to load dashboard metrics</h3>
          <p className="mt-1 text-xs text-rose-700">
            DukaanIQ uses strictly deterministic calculations. Figures are suppressed rather than showing fabricated numbers.
          </p>
        </div>
      ) : (
        <>
          {/* Active Period Label */}
          <div className="flex items-center justify-between text-xs text-[#737B8C]">
            <span>
              Showing paid sales from <strong className="text-[#171A23]">{formatLocalDate(range.fromDate)}</strong> to{" "}
              <strong className="text-[#171A23]">{formatLocalDate(range.toDate)}</strong> ({range.days} days &middot; {range.granularity} granularity)
            </span>
            <span className="hidden sm:inline">Excludes unpaid credit and cancelled sales</span>
          </div>

          {/* 2. Key Performance Indicators (Linear / Stripe style 4-column grid) */}
          <section aria-label="Key performance indicators" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Net Sales Revenue"
              value={formatPaise(data.summary.netSalesPaise)}
              trend={salesTrendPct}
              trendLabel="vs earlier half"
              sparklineData={salesSparkline}
              hint="After coupons and item discounts"
              icon={<TrendingUp size={16} />}
            />

            <KpiCard
              label="Completed Orders"
              value={data.summary.orders.toLocaleString("en-IN")}
              trend={ordersTrendPct}
              trendLabel="paid volume"
              sparklineData={ordersSparkline}
              hint="Paid and fulfilled transactions"
              icon={<Receipt size={16} />}
            />

            <KpiCard
              label="Average Order Value"
              value={data.summary.orders ? formatPaise(data.summary.averageOrderValuePaise) : "₹0"}
              hint={data.summary.orders ? `Across ${data.summary.orders} paid checkouts` : "No paid orders"}
              icon={<Wallet size={16} />}
            />

            <KpiCard
              label="Active Customers"
              value={data.segments.ACTIVE.toLocaleString("en-IN")}
              hint={`Last visited within ${SEGMENT_RULES.activeMaxDays} days`}
              icon={<Users size={16} />}
            >
              <div className="mt-2 flex items-center justify-between text-[11px] text-[#737B8C]">
                <span>Total base: {totalCustomers}</span>
                <Link href="/dashboard/customers" className="font-semibold text-[#4338CA] hover:underline">
                  CRM &rarr;
                </Link>
              </div>
            </KpiCard>
          </section>

          {/* Secondary Financial Health Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-xl border border-[#E2E4E9] bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.03)] text-xs">
            <div>
              <p className="text-[#737B8C] font-medium">Estimated Gross Profit</p>
              <p className="mt-1 font-mono text-sm font-semibold text-emerald-700 tabular-nums">
                {formatPaise(data.summary.grossProfitPaise)}
              </p>
              <p className="text-[10px] text-[#94A3B8]">Revenue minus item cost</p>
            </div>
            <div>
              <p className="text-[#737B8C] font-medium">Customers Served</p>
              <p className="mt-1 font-mono text-sm font-semibold text-[#171A23] tabular-nums">
                {data.summary.customersServed} unique
              </p>
              <p className="text-[10px] text-[#94A3B8]">With &ge;1 paid purchase</p>
            </div>
            <div>
              <p className="text-[#737B8C] font-medium">Cooling Off</p>
              <p className="mt-1 font-mono text-sm font-semibold text-amber-700 tabular-nums">
                {data.segments.COOLING_OFF} customers
              </p>
              <p className="text-[10px] text-[#94A3B8]">15–30 days since last visit</p>
            </div>
            <div>
              <p className="text-[#737B8C] font-medium">Inactive Customers</p>
              <div className="mt-1 flex items-center justify-between">
                <span className="font-mono text-sm font-semibold text-rose-700 tabular-nums">
                  {data.inactiveCount} lost
                </span>
                <Link href="/dashboard/recover-customers" className="font-semibold text-[#4338CA] hover:underline text-[11px]">
                  Recover &rarr;
                </Link>
              </div>
              <p className="text-[10px] text-[#94A3B8]">&gt;30 days without order</p>
            </div>
          </div>

          {/* 3. Action Centre shortcut */}
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E2E4E9] bg-white px-5 py-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.03)] text-xs">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-[#4338CA]">
                <Sparkles size={16} />
              </div>
              <div>
                <span className="font-semibold text-[#171A23]">Action Centre</span>
                <span className="ml-2 text-[#737B8C]">
                  {pendingRecs.length
                    ? `${pendingRecs.length} action${pendingRecs.length > 1 ? "s" : ""} waiting for your decision`
                    : "Nothing waiting for your decision."}
                </span>
              </div>
            </div>
            <Link
              href="/dashboard/action-centre"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#4338CA] px-3.5 py-1.5 font-semibold text-white shadow-sm hover:bg-[#3730A3] transition-colors"
            >
              <span>Open Action Centre</span>
              <ArrowRight size={13} />
            </Link>
          </section>

          {/* 4. Analytics Section: Revenue & Order Trends */}
          {data.summary.orders === 0 ? (
            <EmptyState
              title="No paid orders in this period"
              message="No completed transactions match this date range or category filter. Select a broader range like 90 days or All Time."
            />
          ) : (
            <div className="grid gap-5 lg:grid-cols-2">
              <Panel
                title="Net Sales Trend"
                subtitle={`Revenue per ${range.granularity} after discounts`}
                badge={<Badge variant="brand" size="sm">₹ paise</Badge>}
              >
                <TrendChart
                  title="Net Sales Revenue"
                  color="indigo"
                  points={data.trend.map((p) => ({
                    label: p.label,
                    value: p.netSalesPaise,
                    display: formatPaise(p.netSalesPaise),
                  }))}
                />
              </Panel>

              <Panel
                title="Paid Order Volume"
                subtitle={`Completed transactions per ${range.granularity}`}
                badge={<Badge variant="neutral" size="sm">Checkouts</Badge>}
              >
                <TrendChart
                  title="Paid Order Volume"
                  color="emerald"
                  points={data.trend.map((p) => ({
                    label: p.label,
                    value: p.orders,
                    display: `${p.orders} orders`,
                  }))}
                />
              </Panel>
            </div>
          )}

          {/* 5. Product Performance Section (Top by Qty, Revenue, Profit) */}
          <div className="grid gap-5 lg:grid-cols-3">
            <Panel
              title="Top Products by Quantity"
              subtitle={query.category ?? "All inventory categories"}
              action={<Link href="/dashboard/sales" className="text-xs text-[#4338CA] font-medium hover:underline">Full matrix &rarr;</Link>}
            >
              {data.products.length ? (
                <RankedBars
                  color="indigo"
                  items={[...data.products]
                    .sort((a, b) => b.quantity - a.quantity)
                    .slice(0, 6)
                    .map((p) => ({
                      key: p.productId,
                      label: p.name,
                      value: p.quantity,
                      display: `${p.quantity.toLocaleString("en-IN")} units`,
                    }))}
                />
              ) : (
                <EmptyState message="No product sales recorded for this period." />
              )}
            </Panel>

            <Panel
              title="Top Products by Revenue"
              subtitle={query.category ?? "All inventory categories"}
              action={<Link href="/dashboard/sales" className="text-xs text-[#4338CA] font-medium hover:underline">Full matrix &rarr;</Link>}
            >
              {data.products.length ? (
                <RankedBars
                  color="sky"
                  items={[...data.products]
                    .sort((a, b) => b.revenuePaise - a.revenuePaise)
                    .slice(0, 6)
                    .map((p) => ({
                      key: p.productId,
                      label: p.name,
                      value: p.revenuePaise,
                      display: formatPaise(p.revenuePaise),
                    }))}
                />
              ) : (
                <EmptyState message="No product sales recorded for this period." />
              )}
            </Panel>

            <Panel
              title="Estimated Gross Profit"
              subtitle="Item revenue minus cost"
              badge={<Badge variant="success" size="sm">Margin</Badge>}
            >
              {data.products.length ? (
                <RankedBars
                  color="emerald"
                  items={[...data.products]
                    .sort((a, b) => b.grossProfitPaise - a.grossProfitPaise)
                    .slice(0, 6)
                    .map((p) => ({
                      key: p.productId,
                      label: p.name,
                      value: Math.max(p.grossProfitPaise, 0),
                      display: formatPaise(p.grossProfitPaise),
                    }))}
                />
              ) : (
                <EmptyState message="No product sales recorded for this period." />
              )}
            </Panel>
          </div>

          {/* 6. Payment Mix & Customer Retention Insights */}
          <div className="grid gap-5 lg:grid-cols-2">
            <Panel
              title="Payment Method Distribution"
              subtitle="Breakdown of paid checkout channels"
              badge={<Badge variant="neutral" size="sm">{data.paymentMix.length} methods</Badge>}
            >
              {data.paymentMix.length ? (
                <div className="space-y-4">
                  {/* Visual stacked bar */}
                  <div className="h-3 w-full rounded-full bg-slate-100 flex overflow-hidden">
                    {data.paymentMix.map((m, idx) => {
                      const totalSales = data.paymentMix.reduce((acc, x) => acc + x.netSalesPaise, 0);
                      const pct = totalSales > 0 ? (m.netSalesPaise / totalSales) * 100 : 0;
                      const colors = ["bg-[#4338CA]", "bg-[#059669]", "bg-[#0284C7]", "bg-[#D97706]"];
                      return (
                        <div
                          key={m.method}
                          style={{ width: `${pct}%` }}
                          title={`${m.method}: ${pct.toFixed(1)}%`}
                          className={`${colors[idx % colors.length]}`}
                        />
                      );
                    })}
                  </div>

                  <ul className="divide-y divide-[#F0F2F5] text-xs">
                    {data.paymentMix.map((m) => {
                      const totalSales = data.paymentMix.reduce((acc, x) => acc + x.netSalesPaise, 0);
                      const pct = totalSales > 0 ? ((m.netSalesPaise / totalSales) * 100).toFixed(1) : "0";
                      return (
                        <li key={m.method} className="flex items-center justify-between py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-[#171A23]">{m.method}</span>
                            <span className="text-[#737B8C]">&middot; {m.orders} orders ({pct}%)</span>
                          </div>
                          <span className="font-mono font-semibold text-[#171A23] tabular-nums">
                            {formatPaise(m.netSalesPaise)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : (
                <EmptyState message="No paid orders in this period." />
              )}
            </Panel>

            <Panel
              title="Customer Health & Retention"
              subtitle={`Activity recency as of ${formatLocalDate(referenceDate)}`}
              action={<Link href="/dashboard/customers" className="text-xs text-[#4338CA] font-medium hover:underline">CRM view &rarr;</Link>}
            >
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-emerald-900">Active</span>
                      <span className="font-mono font-bold text-emerald-800 text-sm tabular-nums">
                        {data.segments.ACTIVE}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-emerald-700">Visited within 14 days</p>
                  </div>

                  <div className="rounded-lg border border-amber-100 bg-amber-50/60 p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-amber-900">Cooling Off</span>
                      <span className="font-mono font-bold text-amber-800 text-sm tabular-nums">
                        {data.segments.COOLING_OFF}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-amber-700">15 to 30 days absence</p>
                  </div>

                  <div className="rounded-lg border border-rose-100 bg-rose-50/60 p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-rose-900">Inactive</span>
                      <span className="font-mono font-bold text-rose-800 text-sm tabular-nums">
                        {data.segments.INACTIVE}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-rose-700">&gt;30 days no purchase</p>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-800">No Purchase</span>
                      <span className="font-mono font-bold text-slate-800 text-sm tabular-nums">
                        {data.segments.NO_PURCHASE}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-600">Registered walk-ins</p>
                  </div>
                </div>

                <div className="pt-2 text-center">
                  <Link
                    href="/dashboard/recover-customers"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#4338CA] hover:underline"
                  >
                    <span>Launch win-back campaigns for {data.segments.INACTIVE} inactive customers</span>
                    <ArrowRight size={13} />
                  </Link>
                </div>
              </div>
            </Panel>
          </div>

          {/* 7. Recent Transactions Feed */}
          <Panel
            title="Recent Store Transactions"
            subtitle="Latest 10 transactions in this period with status breakdown"
            action={
              <Link
                href="/dashboard/transactions"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#4338CA] hover:underline"
              >
                <span>View all transactions</span>
                <ArrowRight size={13} />
              </Link>
            }
          >
            {data.recentSales.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#E2E4E9] text-[11px] font-semibold uppercase tracking-wider text-[#737B8C]">
                      <th scope="col" className="pb-3 pr-4">Timestamp (IST)</th>
                      <th scope="col" className="pb-3 pr-4">Customer</th>
                      <th scope="col" className="pb-3 pr-4 text-center">Items</th>
                      <th scope="col" className="pb-3 pr-4 text-right">Net Amount</th>
                      <th scope="col" className="pb-3 pr-4">Payment Method</th>
                      <th scope="col" className="pb-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0F2F5]">
                    {data.recentSales.map((s) => (
                      <tr key={s.id} className="hover:bg-[#F8F9FB] transition-colors">
                        <td className="whitespace-nowrap py-3 pr-4 font-mono text-[#525866]">
                          {formatDateTimeIST(s.saleDate)}
                        </td>
                        <td className="py-3 pr-4 font-medium text-[#171A23]">
                          {s.customerName ?? "Walk-in Customer"}
                        </td>
                        <td className="py-3 pr-4 text-center font-mono tabular-nums text-[#525866]">
                          {s.itemCount}
                        </td>
                        <td className="py-3 pr-4 text-right font-mono font-semibold text-[#171A23] tabular-nums">
                          {formatPaise(s.netAmountPaise)}
                        </td>
                        <td className="py-3 pr-4">
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                            {s.paymentMethod}
                          </span>
                        </td>
                        <td className="py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                              s.paymentStatus === "PAID" && s.status === "COMPLETED"
                                ? "bg-emerald-50 text-emerald-800 border border-emerald-200/60"
                                : s.paymentStatus === "CREDIT"
                                ? "bg-amber-50 text-amber-900 border border-amber-200/60"
                                : "bg-rose-50 text-rose-800 border border-rose-200/60"
                            }`}
                          >
                            {s.status === "COMPLETED" ? s.paymentStatus : s.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState message="No transactions recorded for this period." />
            )}
          </Panel>
        </>
      )}
    </div>
  );
}
