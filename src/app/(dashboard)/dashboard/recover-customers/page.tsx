import type { Metadata } from "next";
import { EmptyState, Panel } from "@/components/dashboard/panel";
import { formatLocalDate } from "@/lib/money";
import { referenceDateFor } from "@/server/analytics/range";
import { SEGMENT_RULES, getCustomerRecency, inactiveCustomers } from "@/server/analytics/queries";
import { requireSession } from "@/server/auth/session";
import { getCurrentMembership } from "@/server/merchant/access";

export const metadata: Metadata = { title: "Recover Customers" };

export default async function RecoverCustomersPage() {
  const session = await requireSession();
  const membership = await getCurrentMembership(session.user.id);
  if (!membership) return <EmptyState message="Set up your shop first to see customer activity." />;

  const referenceDate = referenceDateFor(membership.merchant);
  let customers: ReturnType<typeof inactiveCustomers> | null = null;
  try {
    customers = inactiveCustomers(await getCustomerRecency(membership.merchant.id, referenceDate));
  } catch (e) {
    console.error("inactive customers failed to load:", e);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Recover Customers</h1>
      <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-3 text-sm text-slate-600">
        <span className="mr-2 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">Coming soon</span>
        Win-back offers and messages are not available yet. For now, this list shows who has stopped visiting.
      </p>
      <Panel title="Inactive customers" subtitle={`No paid purchase in the last ${SEGMENT_RULES.coolingMaxDays} days, as of ${formatLocalDate(referenceDate)}. Customers with no purchase history are not listed.`}>
        {customers === null ? (
          <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">We could not load this list right now. Please refresh the page.</p>
        ) : customers.length === 0 ? (
          <EmptyState message="No inactive customers right now." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th scope="col" className="py-2 pr-4 font-medium">Customer</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Last purchase</th>
                  <th scope="col" className="py-2 text-right font-medium">Days since</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {customers.map((c) => (
                  <tr key={c.customerId}>
                    <td className="py-2 pr-4">{c.name}</td>
                    <td className="py-2 pr-4">{c.lastPurchaseDate ? formatLocalDate(c.lastPurchaseDate) : "-"}</td>
                    <td className="py-2 text-right font-medium">{c.daysSinceLastPurchase}</td>
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
