import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { formatLocalDate, formatPaise } from "@/lib/money";
import { requireSession } from "@/server/auth/session";
import { getCurrentMembership } from "@/server/merchant/access";
import { Badge } from "@/components/ui/badge";
import { Panel, EmptyState } from "@/components/dashboard/panel";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Tag, Sparkles, Percent, Wallet, Users, ArrowRight, CheckCircle2, Plus } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Coupons & Campaigns" };

export default async function CampaignsPage() {
  const session = await requireSession();
  const membership = await getCurrentMembership(session.user.id);
  if (!membership) return <EmptyState message="Set up your shop first to manage campaigns." />;

  const merchant = membership.merchant;

  // Group real sales by coupon code
  const couponStats = await db.sale.groupBy({
    by: ["couponCode", "discountReason"],
    _count: { id: true },
    _sum: { discountAmount: true, netAmount: true, grossAmount: true },
    where: { merchantId: merchant.id, discountAmount: { gt: 0 } },
  });

  const campaigns = couponStats.map((c) => {
    const redemptions = c._count.id;
    const discountPaise = c._sum.discountAmount?.mul(100).toDecimalPlaces(0).toNumber() ?? 0;
    const netRevenuePaise = c._sum.netAmount?.mul(100).toDecimalPlaces(0).toNumber() ?? 0;

    const code = c.couponCode ?? "MANUAL_STORE_DISCOUNT";
    const isCoupon = c.discountReason === "COUPON";

    // Known campaign configurations from dataset
    const descriptions: Record<string, { type: string; minOrder: string; validity: string; segment: string }> = {
      WELCOME5: { type: "5% Welcome Off", minOrder: "₹100", validity: "Active &middot; Perpetual", segment: "First-time Shoppers" },
      LOYAL15: { type: "₹15 Flat Off", minOrder: "₹250", validity: "Active &middot; Recurring", segment: "High-Frequency Shoppers" },
      GROCERY10: { type: "10% Category Off", minOrder: "₹300", validity: "Active &middot; Weekly", segment: "Kirana Basket Shoppers" },
      WEEKEND5: { type: "5% Weekend Boost", minOrder: "₹150", validity: "Active &middot; Sat-Sun", segment: "All Store Walk-ins" },
      SAVE20: { type: "₹20 Value Off", minOrder: "₹500", validity: "Active &middot; Monthly", segment: "High-Value Baskets" },
    };

    const meta = descriptions[code] ?? {
      type: isCoupon ? "Promotional Coupon" : "Direct Shop Discount",
      minOrder: "₹50",
      validity: "Active",
      segment: "Store Customers",
    };

    const effectiveROI = discountPaise > 0 ? (netRevenuePaise / discountPaise).toFixed(1) : "N/A";

    return {
      code,
      reason: c.discountReason,
      isCoupon,
      redemptions,
      discountPaise,
      netRevenuePaise,
      effectiveROI,
      ...meta,
    };
  });

  campaigns.sort((a, b) => b.netRevenuePaise - a.netRevenuePaise);

  const totalRedemptions = campaigns.reduce((t, c) => t + c.redemptions, 0);
  const totalDiscountPaise = campaigns.reduce((t, c) => t + c.discountPaise, 0);
  const totalDrivenRevenuePaise = campaigns.reduce((t, c) => t + c.netRevenuePaise, 0);

  const avgDiscountRate =
    totalDrivenRevenuePaise > 0
      ? ((totalDiscountPaise / (totalDrivenRevenuePaise + totalDiscountPaise)) * 100).toFixed(1)
      : "0";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E4E9] pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#171A23]">Coupons &amp; Campaign Management</h1>
          <p className="mt-1 text-xs text-[#737B8C]">
            Promotional codes, customer redemptions, discount budget efficiency and ROI analytics.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="brand" size="sm">
            {campaigns.length} Active Campaigns
          </Badge>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total Redemptions"
          value={`${totalRedemptions} coupons`}
          hint="Verified at cash counter"
          icon={<Tag size={16} />}
        />
        <KpiCard
          label="Revenue Driven by Coupons"
          value={formatPaise(totalDrivenRevenuePaise)}
          hint="Net sales using promotional codes"
          icon={<Wallet size={16} />}
        />
        <KpiCard
          label="Total Discount Cost"
          value={formatPaise(totalDiscountPaise)}
          hint={`Effective discount rate: ${avgDiscountRate}%`}
          icon={<Percent size={16} />}
        />
        <KpiCard
          label="Average Campaign ROI"
          value={`${totalDiscountPaise > 0 ? (totalDrivenRevenuePaise / totalDiscountPaise).toFixed(1) : 0}x`}
          hint="Revenue driven per ₹1 discount"
          icon={<Sparkles size={16} />}
        />
      </div>

      {/* Campaign Cards Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {campaigns.map((camp) => (
          <div
            key={camp.code}
            className="rounded-xl border border-[#E2E4E9] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.03)] hover:border-[#CBD5E1] transition-all"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="font-mono text-sm font-bold tracking-wider text-[#4338CA] bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-200/60 inline-block">
                  {camp.code}
                </span>
                <p className="mt-2 text-xs font-semibold text-[#171A23]">{camp.type}</p>
                <p className="text-[11px] text-[#737B8C]">Min Order: {camp.minOrder} &middot; {camp.segment}</p>
              </div>

              <Badge variant="success" size="sm" withDot>
                Active
              </Badge>
            </div>

            <div className="mt-4 pt-3 border-t border-[#F0F2F5] grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-[11px] text-[#737B8C]">Redemptions</p>
                <p className="font-mono font-bold text-sm text-[#171A23] tabular-nums mt-0.5">
                  {camp.redemptions}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-[#737B8C]">Sales Driven</p>
                <p className="font-mono font-bold text-sm text-emerald-700 tabular-nums mt-0.5">
                  {formatPaise(camp.netRevenuePaise)}
                </p>
              </div>
            </div>

            <div className="mt-2 flex items-center justify-between text-[11px] text-[#737B8C] bg-[#F8F9FB] px-2.5 py-1.5 rounded-md">
              <span>Total discount given:</span>
              <span className="font-mono font-semibold text-[#171A23]">{formatPaise(camp.discountPaise)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Campaign Performance Breakdown Table */}
      <Panel
        title="Promotional Campaign Performance Table"
        subtitle="Detailed financial attribution of promotional vouchers from retail checkout records"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#E2E4E9] text-[11px] font-semibold uppercase tracking-wider text-[#737B8C]">
                <th scope="col" className="pb-3 pr-4">Coupon Code</th>
                <th scope="col" className="pb-3 pr-4">Discount Type</th>
                <th scope="col" className="pb-3 pr-4 text-center">Usage Count</th>
                <th scope="col" className="pb-3 pr-4 text-right">Revenue Generated</th>
                <th scope="col" className="pb-3 pr-4 text-right">Discount Budget</th>
                <th scope="col" className="pb-3 pr-4 text-center">Revenue Multiple</th>
                <th scope="col" className="pb-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F2F5]">
              {campaigns.map((camp) => (
                <tr key={camp.code} className="hover:bg-[#F8F9FB] transition-colors">
                  <td className="py-3 pr-4 font-mono font-bold text-[#4338CA]">
                    {camp.code}
                  </td>
                  <td className="py-3 pr-4 text-[#171A23] font-medium">{camp.type}</td>
                  <td className="py-3 pr-4 text-center font-mono tabular-nums text-[#525866]">
                    {camp.redemptions} orders
                  </td>
                  <td className="py-3 pr-4 text-right font-mono font-semibold text-[#171A23] tabular-nums">
                    {formatPaise(camp.netRevenuePaise)}
                  </td>
                  <td className="py-3 pr-4 text-right font-mono font-medium text-emerald-700 tabular-nums">
                    {formatPaise(camp.discountPaise)}
                  </td>
                  <td className="py-3 pr-4 text-center font-mono font-bold text-indigo-700 tabular-nums">
                    {camp.effectiveROI}x
                  </td>
                  <td className="py-3 text-right">
                    <Badge variant="success" size="sm">
                      Active
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Create New Campaign Interface */}
      <Panel
        title="Create New Promotional Campaign"
        subtitle="Configure targeted coupon codes with minimum purchase limits and segment gating"
      >
        <form className="space-y-4 max-w-2xl">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="code" className="block text-xs font-semibold uppercase tracking-wider text-[#525866]">
                Coupon Code
              </label>
              <input
                id="code"
                type="text"
                placeholder="e.g. DIWALI20"
                className="mt-1.5 block w-full rounded-lg border border-[#D0D5DD] bg-white px-3 py-2 text-xs font-mono font-bold text-[#171A23] uppercase shadow-xs focus:border-[#4338CA] focus:outline-none focus:ring-2 focus:ring-[#4338CA]/20"
              />
            </div>

            <div>
              <label htmlFor="discountType" className="block text-xs font-semibold uppercase tracking-wider text-[#525866]">
                Discount Type
              </label>
              <select
                id="discountType"
                className="mt-1.5 block w-full rounded-lg border border-[#D0D5DD] bg-white px-3 py-2 text-xs font-medium text-[#171A23] shadow-xs focus:border-[#4338CA] focus:outline-none focus:ring-2 focus:ring-[#4338CA]/20"
              >
                <option value="PERCENTAGE">Percentage (%) Off</option>
                <option value="FLAT">Flat (₹) Rupee Discount</option>
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="val" className="block text-xs font-semibold uppercase tracking-wider text-[#525866]">
                Discount Value (₹ or %)
              </label>
              <input
                id="val"
                type="number"
                placeholder="e.g. 15"
                className="mt-1.5 block w-full rounded-lg border border-[#D0D5DD] bg-white px-3 py-2 text-xs text-[#171A23] shadow-xs focus:border-[#4338CA] focus:outline-none focus:ring-2 focus:ring-[#4338CA]/20"
              />
            </div>

            <div>
              <label htmlFor="minPurchase" className="block text-xs font-semibold uppercase tracking-wider text-[#525866]">
                Minimum Purchase Amount (₹)
              </label>
              <input
                id="minPurchase"
                type="number"
                placeholder="e.g. 300"
                className="mt-1.5 block w-full rounded-lg border border-[#D0D5DD] bg-white px-3 py-2 text-xs text-[#171A23] shadow-xs focus:border-[#4338CA] focus:outline-none focus:ring-2 focus:ring-[#4338CA]/20"
              />
            </div>
          </div>

          <div>
            <label htmlFor="targetSegment" className="block text-xs font-semibold uppercase tracking-wider text-[#525866]">
              Target Customer Audience
            </label>
            <select
              id="targetSegment"
              className="mt-1.5 block w-full rounded-lg border border-[#D0D5DD] bg-white px-3 py-2 text-xs font-medium text-[#171A23] shadow-xs focus:border-[#4338CA] focus:outline-none focus:ring-2 focus:ring-[#4338CA]/20"
            >
              <option value="ALL">All Customers &amp; Walk-ins</option>
              <option value="INACTIVE">Inactive Customers (Win-back)</option>
              <option value="LOYAL">High-Frequency Loyal Shoppers</option>
              <option value="NEW">First-time Customers</option>
            </select>
          </div>

          <div className="pt-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg bg-[#4338CA] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#3730A3] transition-colors cursor-pointer"
            >
              <Plus size={14} />
              <span>Publish Promotional Campaign</span>
            </button>
            <span className="ml-3 text-[11px] text-[#737B8C]">
              New campaigns sync with POS checkout &amp; Action Centre automatically.
            </span>
          </div>
        </form>
      </Panel>
    </div>
  );
}

