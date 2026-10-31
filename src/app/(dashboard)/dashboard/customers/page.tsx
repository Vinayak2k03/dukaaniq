import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { formatLocalDate, formatPaise } from "@/lib/money";
import { daysBetween, istYmd, referenceDateFor } from "@/server/analytics/range";
import { SEGMENT_RULES } from "@/server/analytics/queries";
import { requireSession } from "@/server/auth/session";
import { getCurrentMembership } from "@/server/merchant/access";
import { Badge } from "@/components/ui/badge";
import { Panel, EmptyState } from "@/components/dashboard/panel";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Users, Search, Filter, ArrowRight, Phone, Clock, Wallet } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Customers CRM" };

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; segment?: string }>;
}) {
  const session = await requireSession();
  const membership = await getCurrentMembership(session.user.id);
  if (!membership) return <EmptyState message="Set up your shop first to view customers." />;

  const merchant = membership.merchant;
  const refDate = referenceDateFor(merchant);
  const { q, segment } = await searchParams;
  const searchQuery = q?.trim().toLowerCase() ?? "";
  const selectedSegment = segment ?? "all";

  // Fetch all customers for this merchant with sales and credit summary
  const customers = await db.customer.findMany({
    where: { merchantId: merchant.id },
    select: {
      id: true,
      displayName: true,
      customerRef: true,
      phone: true,
      preferredLanguage: true,
      joinedAt: true,
      isSynthetic: true,
      sales: {
        where: { status: "COMPLETED", paymentStatus: "PAID" },
        select: {
          netAmount: true,
          saleDate: true,
        },
        orderBy: { saleDate: "desc" },
      },
      creditEntries: {
        select: {
          type: true,
          amount: true,
        },
      },
    },
    orderBy: { displayName: "asc" },
  });

  // Aggregate stats per customer
  const enriched = customers.map((c) => {
    const totalSpendPaise = c.sales.reduce(
      (acc, s) => acc + s.netAmount.mul(100).toDecimalPlaces(0).toNumber(),
      0
    );
    const purchaseCount = c.sales.length;
    const lastSale = c.sales[0];
    const lastPurchaseDate = lastSale ? istYmd(lastSale.saleDate) : null;

    let daysSince: number | null = null;
    let seg = "NO_PURCHASE";

    if (lastPurchaseDate) {
      daysSince = Math.max(0, daysBetween(lastPurchaseDate, refDate));
      if (daysSince <= SEGMENT_RULES.activeMaxDays) seg = "ACTIVE";
      else if (daysSince <= SEGMENT_RULES.coolingMaxDays) seg = "COOLING_OFF";
      else seg = "INACTIVE";
    }

    // Credit balance
    let creditBalancePaise = 0;
    for (const e of c.creditEntries) {
      const amt = e.amount.mul(100).toDecimalPlaces(0).toNumber();
      if (e.type === "CREDIT_GIVEN" || e.type === "ADJUSTMENT_INCREASE") {
        creditBalancePaise += amt;
      } else {
        creditBalancePaise -= amt;
      }
    }

    return {
      id: c.id,
      name: c.displayName,
      ref: c.customerRef,
      phone: c.phone,
      language: c.preferredLanguage,
      isSynthetic: c.isSynthetic,
      totalSpendPaise,
      purchaseCount,
      lastPurchaseDate,
      daysSince,
      segment: seg,
      creditBalancePaise: Math.max(0, creditBalancePaise),
    };
  });

  // Summary counts
  const totalCount = enriched.length;
  const activeCount = enriched.filter((c) => c.segment === "ACTIVE").length;
  const coolingCount = enriched.filter((c) => c.segment === "COOLING_OFF").length;
  const inactiveCount = enriched.filter((c) => c.segment === "INACTIVE").length;
  const withCreditCount = enriched.filter((c) => c.creditBalancePaise > 0).length;
  const totalLTVPaise = enriched.reduce((acc, c) => acc + c.totalSpendPaise, 0);

  // Apply filters
  const filtered = enriched.filter((c) => {
    // Search filter
    if (searchQuery) {
      const matchName = c.name.toLowerCase().includes(searchQuery);
      const matchPhone = c.phone?.toLowerCase().includes(searchQuery);
      const matchRef = c.ref?.toLowerCase().includes(searchQuery);
      if (!matchName && !matchPhone && !matchRef) return false;
    }

    // Segment filter
    if (selectedSegment === "active") return c.segment === "ACTIVE";
    if (selectedSegment === "cooling") return c.segment === "COOLING_OFF";
    if (selectedSegment === "inactive") return c.segment === "INACTIVE";
    if (selectedSegment === "credit") return c.creditBalancePaise > 0;
    return true;
  });

  // Sort by total spend desc
  filtered.sort((a, b) => b.totalSpendPaise - a.totalSpendPaise);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E4E9] pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#171A23]">Customer Intelligence &amp; CRM</h1>
          <p className="mt-1 text-xs text-[#737B8C]">
            Profile segmentation, purchase frequency, lifetime value and credit standing.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/recover-customers"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#D0D5DD] bg-white px-3 py-1.5 text-xs font-semibold text-[#171A23] shadow-xs hover:bg-[#F8F9FA] transition-colors"
          >
            <span>Recover Inactive ({inactiveCount})</span>
            <ArrowRight size={13} />
          </Link>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total Customer Base"
          value={totalCount.toLocaleString("en-IN")}
          hint="Registered shoppers in directory"
          icon={<Users size={16} />}
        />
        <KpiCard
          label="Active Shoppers"
          value={activeCount.toLocaleString("en-IN")}
          hint={`Visited in last ${SEGMENT_RULES.activeMaxDays} days`}
          icon={<Clock size={16} />}
        />
        <KpiCard
          label="At-Risk & Inactive"
          value={`${coolingCount + inactiveCount}`}
          hint={`${coolingCount} cooling off · ${inactiveCount} inactive`}
          icon={<Filter size={16} />}
        />
        <KpiCard
          label="Total Customer Spend (LTV)"
          value={formatPaise(totalLTVPaise)}
          hint={`Across ${totalCount} recorded profiles`}
          icon={<Wallet size={16} />}
        />
      </div>

      {/* Search & Segmentation Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E2E4E9] bg-white p-3.5 shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
        {/* Search Bar */}
        <form method="get" action="/dashboard/customers" className="relative flex-1 min-w-[240px] max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#737B8C]" />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search by customer name or phone..."
            className="w-full rounded-lg border border-[#D0D5DD] bg-white py-1.5 pl-9 pr-3 text-xs text-[#171A23] placeholder:text-[#94A3B8] shadow-xs focus:border-[#4338CA] focus:outline-none focus:ring-2 focus:ring-[#4338CA]/20"
          />
          {segment && <input type="hidden" name="segment" value={segment} />}
        </form>

        {/* Segment Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {[
            { key: "all", label: `All (${totalCount})` },
            { key: "active", label: `Active (${activeCount})` },
            { key: "cooling", label: `Cooling Off (${coolingCount})` },
            { key: "inactive", label: `Inactive (${inactiveCount})` },
            { key: "credit", label: `Udhaar (${withCreditCount})` },
          ].map((tab) => {
            const isSelected = selectedSegment === tab.key;
            return (
              <Link
                key={tab.key}
                href={`/dashboard/customers?segment=${tab.key}${searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : ""}`}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                  isSelected
                    ? "bg-[#4338CA] text-white font-semibold shadow-xs"
                    : "bg-[#F4F5F7] text-[#525866] hover:bg-[#EAECEF] hover:text-[#171A23]"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Customer Directory Table */}
      <Panel
        title={`Customer Directory (${filtered.length} matching)`}
        subtitle={`Sorted by total historical spend. Activity evaluated as of ${formatLocalDate(refDate)}.`}
      >
        {filtered.length === 0 ? (
          <EmptyState
            title="No customers match criteria"
            message="Try clearing your search query or switching segment filters to view more profiles."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E2E4E9] text-[11px] font-semibold uppercase tracking-wider text-[#737B8C]">
                  <th scope="col" className="pb-3 pr-4">Customer</th>
                  <th scope="col" className="pb-3 pr-4">Phone / Contact</th>
                  <th scope="col" className="pb-3 pr-4 text-right">Total Spent</th>
                  <th scope="col" className="pb-3 pr-4 text-center">Orders</th>
                  <th scope="col" className="pb-3 pr-4">Last Visit</th>
                  <th scope="col" className="pb-3 pr-4">Recency Status</th>
                  <th scope="col" className="pb-3 pr-4 text-right">Udhaar Balance</th>
                  <th scope="col" className="pb-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F2F5]">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-[#F8F9FB] transition-colors">
                    {/* Customer Name & Avatar */}
                    <td className="py-3 pr-4">
                      <Link
                        href={`/dashboard/customers/${c.id}`}
                        className="flex items-center gap-2.5 group"
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#4338CA]/10 text-xs font-bold text-[#4338CA] group-hover:bg-[#4338CA] group-hover:text-white transition-colors">
                          {c.name[0]?.toUpperCase() ?? "C"}
                        </div>
                        <div>
                          <p className="font-semibold text-[#171A23] group-hover:text-[#4338CA] transition-colors">
                            {c.name}
                          </p>
                          {c.ref && <p className="text-[10px] text-[#737B8C] font-mono">{c.ref}</p>}
                        </div>
                      </Link>
                    </td>

                    {/* Phone */}
                    <td className="py-3 pr-4 font-mono text-[#525866]">
                      {c.phone ? (
                        <span className="flex items-center gap-1">
                          <Phone size={12} className="text-[#94A3B8]" />
                          {c.phone}
                        </span>
                      ) : (
                        <span className="text-[#94A3B8] italic">Not provided</span>
                      )}
                    </td>

                    {/* Total Spent */}
                    <td className="py-3 pr-4 text-right font-mono font-semibold text-[#171A23] tabular-nums">
                      {formatPaise(c.totalSpendPaise)}
                    </td>

                    {/* Orders Count */}
                    <td className="py-3 pr-4 text-center font-mono tabular-nums text-[#525866]">
                      {c.purchaseCount}
                    </td>

                    {/* Last Visit */}
                    <td className="py-3 pr-4 text-[#525866]">
                      {c.lastPurchaseDate ? (
                        <div>
                          <p className="font-medium text-[#171A23]">{formatLocalDate(c.lastPurchaseDate)}</p>
                          <p className="text-[10px] text-[#737B8C] font-mono">{c.daysSince}d ago</p>
                        </div>
                      ) : (
                        <span className="text-[#94A3B8]">&mdash;</span>
                      )}
                    </td>

                    {/* Recency Badge */}
                    <td className="py-3 pr-4">
                      {c.segment === "ACTIVE" && (
                        <Badge variant="success" size="sm" withDot>
                          Active
                        </Badge>
                      )}
                      {c.segment === "COOLING_OFF" && (
                        <Badge variant="warning" size="sm" withDot>
                          Cooling Off
                        </Badge>
                      )}
                      {c.segment === "INACTIVE" && (
                        <Badge variant="danger" size="sm" withDot>
                          Inactive
                        </Badge>
                      )}
                      {c.segment === "NO_PURCHASE" && (
                        <Badge variant="neutral" size="sm">
                          No Orders
                        </Badge>
                      )}
                    </td>

                    {/* Udhaar Balance */}
                    <td className="py-3 pr-4 text-right font-mono tabular-nums">
                      {c.creditBalancePaise > 0 ? (
                        <span className="font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200/60">
                          {formatPaise(c.creditBalancePaise)}
                        </span>
                      ) : (
                        <span className="text-[#94A3B8]">&mdash;</span>
                      )}
                    </td>

                    {/* Action */}
                    <td className="py-3 text-right">
                      <Link
                        href={`/dashboard/customers/${c.id}`}
                        className="inline-flex items-center gap-1 rounded-md border border-[#D0D5DD] bg-white px-2.5 py-1 text-[11px] font-medium text-[#171A23] hover:bg-[#F8F9FA] transition-colors"
                      >
                        <span>Profile</span>
                        <ArrowRight size={11} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

