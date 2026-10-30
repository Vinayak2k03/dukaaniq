import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatDateTimeIST, formatLocalDate, formatPaise } from "@/lib/money";
import { referenceDateFor } from "@/server/analytics/range";
import { SEGMENT_RULES } from "@/server/analytics/queries";
import { requireSession } from "@/server/auth/session";
import { getCurrentMembership } from "@/server/merchant/access";
import { Badge } from "@/components/ui/badge";
import { Panel, EmptyState } from "@/components/dashboard/panel";
import { KpiCard } from "@/components/dashboard/kpi-card";
import {
  Users,
  ChevronLeft,
  Phone,
  Wallet,
  Receipt,
  Tag,
  Sparkles,
  BookMarked,
  Clock,
  ArrowRight,
} from "@/components/ui/icons";

export const metadata: Metadata = { title: "Customer Profile" };

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const membership = await getCurrentMembership(session.user.id);
  if (!membership) notFound();

  const { id } = await params;
  const merchant = membership.merchant;
  const refDate = referenceDateFor(merchant);

  const customer = await db.customer.findFirst({
    where: { id, merchantId: merchant.id },
    include: {
      sales: {
        orderBy: { saleDate: "desc" },
        include: {
          items: {
            include: { product: true },
          },
        },
      },
      creditEntries: {
        orderBy: { entryDate: "desc" },
      },
      audienceEntries: {
        include: {
          version: {
            include: { recommendation: true },
          },
        },
      },
    },
  });

  if (!customer) notFound();

  // Aggregate stats
  const paidSales = customer.sales.filter((s) => s.paymentStatus === "PAID" && s.status === "COMPLETED");
  const totalSpendPaise = paidSales.reduce(
    (acc, s) => acc + s.netAmount.mul(100).toDecimalPlaces(0).toNumber(),
    0
  );
  const totalOrders = paidSales.length;
  const aovPaise = totalOrders > 0 ? Math.round(totalSpendPaise / totalOrders) : 0;

  // Last purchase date
  const lastSale = paidSales[0];
  const lastPurchaseDate = lastSale ? lastSale.saleDate.toISOString().slice(0, 10) : null;
  let daysSince: number | null = null;
  let segment = "NO_PURCHASE";

  if (lastPurchaseDate) {
    const msDiff = Date.parse(refDate) - Date.parse(lastPurchaseDate);
    daysSince = Math.max(0, Math.floor(msDiff / 86_400_000));
    if (daysSince <= SEGMENT_RULES.activeMaxDays) segment = "ACTIVE";
    else if (daysSince <= SEGMENT_RULES.coolingMaxDays) segment = "COOLING_OFF";
    else segment = "INACTIVE";
  }

  // Credit balance calculation
  let creditBalancePaise = 0;
  for (const e of customer.creditEntries) {
    const amt = e.amount.mul(100).toDecimalPlaces(0).toNumber();
    if (e.type === "CREDIT_GIVEN" || e.type === "ADJUSTMENT_INCREASE") {
      creditBalancePaise += amt;
    } else {
      creditBalancePaise -= amt;
    }
  }

  // Coupons redeemed by this customer
  const couponsUsed = customer.sales
    .filter((s) => s.couponCode)
    .map((s) => ({
      code: s.couponCode as string,
      discount: s.discountAmount.mul(100).toDecimalPlaces(0).toNumber(),
      date: s.saleDate,
    }));

  return (
    <div className="space-y-6">
      {/* Breadcrumb & Navigation */}
      <div>
        <Link
          href="/dashboard/customers"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#4338CA] hover:underline"
        >
          <ChevronLeft size={14} />
          <span>Back to Customers CRM</span>
        </Link>

        {/* Customer Header Bar */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E4E9] pb-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#4338CA] text-lg font-bold text-white shadow-sm">
              {customer.displayName[0]?.toUpperCase() ?? "C"}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-[#171A23]">
                  {customer.displayName}
                </h1>
                {segment === "ACTIVE" && <Badge variant="success" size="sm" withDot>Active Shopper</Badge>}
                {segment === "COOLING_OFF" && <Badge variant="warning" size="sm" withDot>Cooling Off</Badge>}
                {segment === "INACTIVE" && <Badge variant="danger" size="sm" withDot>Inactive ({daysSince}d)</Badge>}
                {segment === "NO_PURCHASE" && <Badge variant="neutral" size="sm">No Orders</Badge>}
                {customer.isSynthetic && <Badge variant="outline" size="sm">Demo Profile</Badge>}
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[#737B8C]">
                {customer.phone && (
                  <span className="flex items-center gap-1 font-mono text-[#171A23]">
                    <Phone size={13} className="text-[#94A3B8]" />
                    {customer.phone}
                  </span>
                )}
                <span>&middot;</span>
                <span>Language: <strong>{customer.preferredLanguage}</strong></span>
                {customer.customerRef && (
                  <>
                    <span>&middot;</span>
                    <span className="font-mono">Ref: {customer.customerRef}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              href={`/dashboard/udhaar/${customer.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#D0D5DD] bg-white px-3.5 py-2 text-xs font-semibold text-[#171A23] shadow-xs hover:bg-[#F8F9FA] transition-colors"
            >
              <BookMarked size={14} className="text-[#4338CA]" />
              <span>Credit Ledger</span>
            </Link>
          </div>
        </div>
      </div>

      {/* KPI Stats Strip */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Lifetime Spend (LTV)"
          value={formatPaise(totalSpendPaise)}
          hint="From paid completed sales"
          icon={<Wallet size={16} />}
        />
        <KpiCard
          label="Total Orders"
          value={`${totalOrders} checkouts`}
          hint="Paid transactions"
          icon={<Receipt size={16} />}
        />
        <KpiCard
          label="Average Basket (AOV)"
          value={formatPaise(aovPaise)}
          hint="Average net spend per visit"
          icon={<Tag size={16} />}
        />
        <KpiCard
          label="Outstanding Udhaar"
          value={formatPaise(Math.max(0, creditBalancePaise))}
          hint={creditBalancePaise > 0 ? "Pending repayment" : "Zero credit balance"}
          icon={<BookMarked size={16} />}
        />
      </div>

      {/* AI Recommendation Insights Spotlight for this Customer */}
      <div className="rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50/70 via-white to-indigo-50/40 p-5 shadow-xs">
        <div className="flex items-start gap-3.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#4338CA] text-white">
            <Sparkles size={18} />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-[#171A23]">AI Customer Profile &amp; Intelligence</h3>
            <p className="text-xs text-[#525866] leading-relaxed">
              {segment === "ACTIVE"
                ? `${customer.displayName} is an active shopper (last visited ${daysSince ?? 0} days ago). Recommending loyalty discounts and bundle cross-sells to increase basket value.`
                : segment === "COOLING_OFF"
                ? `${customer.displayName} has not purchased in ${daysSince ?? 0} days. Suggested action: send a gentle WhatsApp check-in or weekend discount coupon.`
                : segment === "INACTIVE"
                ? `${customer.displayName} is currently inactive (${daysSince ?? 0} days since last purchase). High priority for automated win-back campaign.`
                : "No completed purchases recorded yet. Encourage first-time trial with a welcome coupon."}
            </p>
            {customer.audienceEntries.length > 0 && (
              <div className="pt-2 text-xs">
                <span className="font-semibold text-[#171A23]">Included in AI proposals: </span>
                <span className="text-[#4338CA]">
                  {customer.audienceEntries.map((a) => a.version.title).join(", ")}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Customer Purchase History */}
      <Panel
        title={`Purchase History (${customer.sales.length} orders)`}
        subtitle="Chronological transaction log with line items, discounts and payment methods"
      >
        {customer.sales.length === 0 ? (
          <EmptyState message="No transactions recorded for this customer yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E2E4E9] text-[11px] font-semibold uppercase tracking-wider text-[#737B8C]">
                  <th scope="col" className="pb-3 pr-4">Date &amp; Time (IST)</th>
                  <th scope="col" className="pb-3 pr-4">Invoice / Sale ID</th>
                  <th scope="col" className="pb-3 pr-4">Items Purchased</th>
                  <th scope="col" className="pb-3 pr-4 text-right">Gross Amount</th>
                  <th scope="col" className="pb-3 pr-4 text-right">Discount</th>
                  <th scope="col" className="pb-3 pr-4 text-right">Net Amount</th>
                  <th scope="col" className="pb-3 pr-4">Payment</th>
                  <th scope="col" className="pb-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F2F5]">
                {customer.sales.map((s) => (
                  <tr key={s.id} className="hover:bg-[#F8F9FB] transition-colors">
                    <td className="whitespace-nowrap py-3 pr-4 font-mono text-[#525866]">
                      {formatDateTimeIST(s.saleDate)}
                    </td>
                    <td className="py-3 pr-4 font-mono text-[#171A23]">
                      {s.invoiceNumber ?? s.id.slice(-8)}
                    </td>
                    <td className="py-3 pr-4 text-[#525866] max-w-xs truncate">
                      {s.items.length > 0
                        ? s.items.map((i) => `${i.product.name} (x${Number(i.quantity)})`).join(", ")
                        : "Walk-in items"}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono tabular-nums text-[#525866]">
                      {formatPaise(s.grossAmount.mul(100).toDecimalPlaces(0).toNumber())}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono tabular-nums text-emerald-700">
                      {s.discountAmount.gt(0)
                        ? `-${formatPaise(s.discountAmount.mul(100).toDecimalPlaces(0).toNumber())}`
                        : "&mdash;"}
                      {s.couponCode && (
                        <span className="ml-1 rounded bg-indigo-50 px-1 py-0.5 text-[10px] font-semibold text-indigo-700 border border-indigo-200">
                          {s.couponCode}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono font-semibold text-[#171A23] tabular-nums">
                      {formatPaise(s.netAmount.mul(100).toDecimalPlaces(0).toNumber())}
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
        )}
      </Panel>

      {/* Credit & Udhaar Activity */}
      {customer.creditEntries.length > 0 && (
        <Panel
          title={`Credit Ledger Log (${customer.creditEntries.length} entries)`}
          subtitle="Append-only credit entries for this customer"
          action={
            <Link
              href={`/dashboard/udhaar/${customer.id}`}
              className="text-xs font-semibold text-[#4338CA] hover:underline"
            >
              Open full ledger &rarr;
            </Link>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E2E4E9] text-[11px] font-semibold uppercase tracking-wider text-[#737B8C]">
                  <th scope="col" className="pb-3 pr-4">Date (IST)</th>
                  <th scope="col" className="pb-3 pr-4">Type</th>
                  <th scope="col" className="pb-3 pr-4 text-right">Amount</th>
                  <th scope="col" className="pb-3 pr-4">Due Date</th>
                  <th scope="col" className="pb-3">Details / Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F2F5]">
                {customer.creditEntries.map((e) => (
                  <tr key={e.id} className="hover:bg-[#F8F9FB] transition-colors">
                    <td className="whitespace-nowrap py-3 pr-4 font-mono text-[#525866]">
                      {formatDateTimeIST(e.entryDate)}
                    </td>
                    <td className="py-3 pr-4 font-medium text-[#171A23]">{e.type}</td>
                    <td className="py-3 pr-4 text-right font-mono font-semibold tabular-nums text-[#171A23]">
                      {formatPaise(e.amount.mul(100).toDecimalPlaces(0).toNumber())}
                    </td>
                    <td className="py-3 pr-4 text-[#525866]">
                      {e.dueDate ? formatLocalDate(e.dueDate.toISOString().slice(0, 10)) : "-"}
                    </td>
                    <td className="py-3 text-[#737B8C]">{e.note ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}

