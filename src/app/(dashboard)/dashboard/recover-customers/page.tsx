import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, Panel } from "@/components/dashboard/panel";
import { Badge } from "@/components/ui/badge";
import { formatLocalDate } from "@/lib/money";
import { referenceDateFor } from "@/server/analytics/range";
import { SEGMENT_RULES, getCustomerRecency, inactiveCustomers } from "@/server/analytics/queries";
import { requireSession } from "@/server/auth/session";
import { getCurrentMembership } from "@/server/merchant/access";
import { Sparkles, Users, Clock, ArrowRight, UserCheck } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Recover Inactive Customers" };

export default async function RecoverCustomersPage() {
  const session = await requireSession();
  const membership = await getCurrentMembership(session.user.id);
  if (!membership) return <EmptyState message="Set up your shop first to see customer activity." />;

  const referenceDate = referenceDateFor(membership.merchant);
  let customers: ReturnType<typeof inactiveCustomers> | null = null;
  try {
    customers = inactiveCustomers(await getCustomerRecency(membership.merchant.id, referenceDate));
  } catch (e) {
    console.error("Inactive customers failed to load:", e);
  }

  const list = customers ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E4E9] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-[#171A23]">Customers not coming</h1>
            <Badge variant="danger" size="sm">
              {list.length} Inactive Shoppers
            </Badge>
          </div>
          <p className="mt-1 text-xs text-[#737B8C]">
            Reactivate churned retail shoppers who have stopped visiting your store.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <Link
            href="/dashboard/campaigns"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#D0D5DD] bg-white px-3 py-1.5 font-semibold text-[#171A23] shadow-xs hover:bg-[#F8F9FA] transition-colors"
          >
            <span>Launch Win-back Promo</span>
            <ArrowRight size={13} />
          </Link>
        </div>
      </div>

      {/* AI Win-back Strategy Spotlight */}
      <div className="rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50/80 via-white to-indigo-50/50 p-5 shadow-xs">
        <div className="flex items-start gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#4338CA] text-white">
            <Sparkles size={20} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#171A23]">Automated Win-Back Opportunities</h3>
            <p className="mt-1 text-xs text-[#525866] leading-relaxed">
              These <strong className="text-[#171A23]">{list.length} customers</strong> have not made a paid visit in over {SEGMENT_RULES.coolingMaxDays} days as of {formatLocalDate(referenceDate)}.
              Sending a personalized WhatsApp coupon code (such as <code className="font-mono text-[#4338CA]">WELCOME5</code> or <code className="font-mono text-[#4338CA]">LOYAL15</code>) is proven to recover 18–25% of lapsed retail shoppers.
            </p>
            <div className="mt-3 flex items-center gap-3">
              <Link
                href="/dashboard/action-centre"
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#4338CA] px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#3730A3] transition-colors"
              >
                <span>Check Action Centre Proposals</span>
                <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Inactive Customers Table */}
      <Panel
        title={`Inactive Customer Roster (${list.length})`}
        subtitle={`No paid purchase in the last ${SEGMENT_RULES.coolingMaxDays} days as of ${formatLocalDate(referenceDate)}. Customers with no recorded purchase history are excluded.`}
      >
        {list.length === 0 ? (
          <EmptyState
            title="Zero inactive customers"
            message="All registered retail customers have visited within the last 30 days. Excellent retention rate!"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E2E4E9] text-[11px] font-semibold uppercase tracking-wider text-[#737B8C]">
                  <th scope="col" className="pb-3 pr-4">Customer Name</th>
                  <th scope="col" className="pb-3 pr-4">Last Verified Purchase</th>
                  <th scope="col" className="pb-3 pr-4 text-center">Days Inactive</th>
                  <th scope="col" className="pb-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F2F5]">
                {list.map((c) => (
                  <tr key={c.customerId} className="hover:bg-[#F8F9FB] transition-colors">
                    <td className="py-3 pr-4">
                      <Link
                        href={`/dashboard/customers/${c.customerId}`}
                        className="font-semibold text-[#171A23] hover:text-[#4338CA] transition-colors"
                      >
                        {c.name}
                      </Link>
                    </td>

                    <td className="py-3 pr-4 text-[#525866]">
                      {c.lastPurchaseDate ? formatLocalDate(c.lastPurchaseDate) : "—"}
                    </td>

                    <td className="py-3 pr-4 text-center font-mono">
                      <span className="rounded-md bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-700 border border-rose-200/60 tabular-nums">
                        {c.daysSinceLastPurchase} days
                      </span>
                    </td>

                    <td className="py-3 text-right">
                      <Link
                        href={`/dashboard/customers/${c.customerId}`}
                        className="inline-flex items-center gap-1 rounded-md border border-[#D0D5DD] bg-white px-2.5 py-1 text-[11px] font-medium text-[#171A23] hover:bg-[#F8F9FA] transition-colors"
                      >
                        <span>View Profile</span>
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
