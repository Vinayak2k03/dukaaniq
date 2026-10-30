import type { Metadata } from "next";
import Link from "next/link";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { EmptyState, Panel } from "@/components/dashboard/panel";
import { RankedBars } from "@/components/dashboard/ranked-bars";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { formatDateTimeIST, formatLocalDate, formatPaise } from "@/lib/money";
import { parseDashboardQuery } from "@/lib/validation/dashboard";
import { categoryLabel } from "@/lib/validation/merchant";
import { getDashboardData, prepareRange } from "@/server/analytics/dashboard";
import { SEGMENT_RULES } from "@/server/analytics/queries";
import { requireSession } from "@/server/auth/session";
import { getCurrentMembership } from "@/server/merchant/access";

export const metadata: Metadata = { title: "Dashboard" };

const link = "font-medium text-indigo-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600";

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const session = await requireSession();
  const membership = await getCurrentMembership(session.user.id);

  const welcome = (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <h1 className="text-2xl font-semibold text-slate-900">Namaste, {session.user.name}</h1>
      {membership ? (
        <p className="mt-1 text-slate-600">
          {membership.merchant.shopName} &middot; {categoryLabel(membership.merchant.businessCategory)}
        </p>
      ) : (
        <div className="mt-3">
          <p className="text-slate-600">Set up your shop to get started.</p>
          <Link href="/onboarding" className="mt-3 inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2">
            Set up your shop
          </Link>
        </div>
      )}
    </section>
  );
  if (!membership) return <div className="mx-auto max-w-5xl space-y-6">{welcome}</div>;

  const merchant = membership.merchant;
  const { query, error: queryError } = parseDashboardQuery(await searchParams);
  const { range, referenceDate, error: rangeError } = prepareRange(merchant, query);
  const filterError = queryError ?? rangeError;

  let data: Awaited<ReturnType<typeof getDashboardData>> | null = null;
  try {
    data = await getDashboardData(merchant, range, referenceDate, query.category);
  } catch (e) {
    console.error("dashboard failed to load:", e);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {welcome}

      {merchant.isDemo ? (
        <p role="note" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Demo store with synthetic data. All customers, phone numbers and transactions are illustrative.
        </p>
      ) : null}

      <FilterBar query={{ ...query, range: range.key }} categories={data?.categories ?? []} />
      {filterError ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {filterError} Showing the last 30 days instead.
        </p>
      ) : null}

      {!data ? (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">
          We could not load your dashboard numbers right now. Please refresh the page. No figures are shown rather than showing wrong ones.
        </p>
      ) : (
        <>
          <p className="text-sm text-slate-600">
            Showing {formatLocalDate(range.fromDate)} to {formatLocalDate(range.toDate)} ({range.days} days). Only paid, completed sales are counted. Customer activity is as of {formatLocalDate(referenceDate)}{merchant.isDemo ? " (fixed demo date)" : ""}.
          </p>

          <section aria-label="Key numbers" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard label="Net sales" value={formatPaise(data.summary.netSalesPaise)} hint="After discounts. Not profit." />
            <KpiCard label="Orders" value={String(data.summary.orders)} hint="Paid orders" />
            <KpiCard label="Average order value" value={data.summary.orders ? formatPaise(data.summary.averageOrderValuePaise) : "No orders"} />
            <KpiCard label="Customers served" value={String(data.summary.customersServed)} hint="With at least one paid sale" />
            <KpiCard label="Estimated gross profit" value={formatPaise(data.summary.grossProfitPaise)} hint="Item revenue minus item cost. Excludes rent, wages, tax." />
            <KpiCard label="Active customers" value={String(data.segments.ACTIVE)} hint={`Last paid purchase within ${SEGMENT_RULES.activeMaxDays} days`} />
            <KpiCard label="Cooling off" value={String(data.segments.COOLING_OFF)} hint={`${SEGMENT_RULES.activeMaxDays + 1} to ${SEGMENT_RULES.coolingMaxDays} days since last purchase`} />
            <KpiCard label="Inactive customers" value={String(data.inactiveCount)} hint={`More than ${SEGMENT_RULES.coolingMaxDays} days since last purchase`}>
              <Link href="/dashboard/recover-customers" className={`${link} mt-2 inline-block text-sm`}>View list</Link>
            </KpiCard>
          </section>

          {data.summary.orders === 0 ? (
            <EmptyState message="No paid orders in this period. Try a longer period." />
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <Panel title="Net sales trend" subtitle={`Per ${range.granularity}`}>
                  <TrendChart title="Net sales" color="bg-indigo-500" points={data.trend.map((p) => ({ label: p.label, value: p.netSalesPaise, display: formatPaise(p.netSalesPaise) }))} />
                </Panel>
                <Panel title="Orders trend" subtitle={`Paid orders per ${range.granularity}`}>
                  <TrendChart title="Paid orders" color="bg-emerald-500" points={data.trend.map((p) => ({ label: p.label, value: p.orders, display: String(p.orders) }))} />
                </Panel>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <Panel title="Top products by quantity" subtitle={query.category ?? "All categories"}>
                  {data.products.length ? <RankedBars color="bg-indigo-500" items={[...data.products].sort((a, b) => b.quantity - a.quantity).slice(0, 8).map((p) => ({ key: p.productId, label: p.name, value: p.quantity, display: `${p.quantity.toLocaleString("en-IN")}` }))} /> : <EmptyState message="No product sales for this filter." />}
                </Panel>
                <Panel title="Top products by sales value" subtitle={query.category ?? "All categories"}>
                  {data.products.length ? <RankedBars color="bg-sky-500" items={[...data.products].sort((a, b) => b.revenuePaise - a.revenuePaise).slice(0, 8).map((p) => ({ key: p.productId, label: p.name, value: p.revenuePaise, display: formatPaise(p.revenuePaise) }))} /> : <EmptyState message="No product sales for this filter." />}
                </Panel>
                <Panel title="Estimated gross profit by product" subtitle={query.category ?? "All categories"}>
                  {data.products.length ? <RankedBars color="bg-emerald-500" items={[...data.products].sort((a, b) => b.grossProfitPaise - a.grossProfitPaise).slice(0, 8).map((p) => ({ key: p.productId, label: p.name, value: Math.max(p.grossProfitPaise, 0), display: formatPaise(p.grossProfitPaise) }))} /> : <EmptyState message="No product sales for this filter." />}
                </Panel>
              </div>
            </>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Payment method mix" subtitle="Paid orders in this period">
              {data.paymentMix.length ? (
                <ul className="divide-y divide-slate-100 text-sm">
                  {data.paymentMix.map((m) => (
                    <li key={m.method} className="flex justify-between py-2">
                      <span className="text-slate-700">{m.method} &middot; {m.orders} orders</span>
                      <span className="font-medium text-slate-900">{formatPaise(m.netSalesPaise)}</span>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState message="No paid orders in this period." />}
            </Panel>
            <Panel title="Customer activity" subtitle={`As of ${formatLocalDate(referenceDate)}`}>
              <ul className="divide-y divide-slate-100 text-sm">
                {([["Active", data.segments.ACTIVE], ["Cooling off", data.segments.COOLING_OFF], ["Inactive", data.segments.INACTIVE], ["No purchase history", data.segments.NO_PURCHASE]] as const).map(([l, n]) => (
                  <li key={l} className="flex justify-between py-2">
                    <span className="text-slate-700">{l}</span>
                    <span className="font-medium text-slate-900">{n}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          <Panel title="Recent transactions" subtitle="Latest 10 in this period, including unpaid, cancelled and refunded">
            {data.recentSales.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-slate-500">
                    <tr>
                      <th scope="col" className="py-2 pr-4 font-medium">Date</th>
                      <th scope="col" className="py-2 pr-4 font-medium">Customer</th>
                      <th scope="col" className="py-2 pr-4 font-medium">Items</th>
                      <th scope="col" className="py-2 pr-4 text-right font-medium">Net amount</th>
                      <th scope="col" className="py-2 pr-4 font-medium">Method</th>
                      <th scope="col" className="py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.recentSales.map((s) => (
                      <tr key={s.id}>
                        <td className="whitespace-nowrap py-2 pr-4">{formatDateTimeIST(s.saleDate)}</td>
                        <td className="py-2 pr-4">{s.customerName ?? "Walk-in"}</td>
                        <td className="py-2 pr-4">{s.itemCount}</td>
                        <td className="py-2 pr-4 text-right font-medium">{formatPaise(s.netAmountPaise)}</td>
                        <td className="py-2 pr-4">{s.paymentMethod}</td>
                        <td className="py-2">{s.status === "COMPLETED" ? s.paymentStatus : s.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <EmptyState message="No transactions in this period." />}
          </Panel>
        </>
      )}
    </div>
  );
}
