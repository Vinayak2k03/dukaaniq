import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, Panel } from "@/components/dashboard/panel";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { formatLocalDate, formatPaise } from "@/lib/money";
import { ledgerFilterSchema } from "@/lib/validation/credit";
import { STATUS_LABEL, STATUS_STYLE } from "@/lib/validation/credit-labels";
import { referenceDateFor } from "@/server/analytics/range";
import { requireSession } from "@/server/auth/session";
import { listAccounts, summarize, type AccountRow } from "@/server/credit/service";
import { getCurrentMembership } from "@/server/merchant/access";
import { GenerateRemindersForm } from "../action-centre/decision-forms";

export const metadata: Metadata = { title: "Udhaar" };

const control = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/30";
const STATUS_FILTERS = [
  ["outstanding", "Has balance"],
  ["overdue", "Overdue"],
  ["upcoming", "Due soon / upcoming"],
  ["settled", "Settled"],
  ["all", "All with credit history"],
] as const;

function applyFilter(rows: AccountRow[], status: string, q?: string) {
  const needle = q?.toLowerCase();
  return rows
    .filter((r) => (needle ? r.name.toLowerCase().includes(needle) : true))
    .filter((r) => {
      switch (status) {
        case "outstanding": return r.account.balancePaise > 0;
        case "overdue": return r.account.status === "OVERDUE";
        case "upcoming": return r.account.status === "UPCOMING" || r.account.status === "DUE_TODAY";
        case "settled": return r.account.status === "SETTLED";
        default: return r.entryCount > 0 || Boolean(needle);
      }
    })
    .sort((a, b) => b.account.overduePaise - a.account.overduePaise || b.account.balancePaise - a.account.balancePaise || a.name.localeCompare(b.name));
}

export default async function UdhaarPage({ searchParams }: PageProps<"/dashboard/udhaar">) {
  const session = await requireSession();
  const membership = await getCurrentMembership(session.user.id);
  if (!membership) return <EmptyState message="Set up your shop first to use the credit ledger." />;

  const raw = await searchParams;
  const parsed = ledgerFilterSchema.safeParse({ q: Array.isArray(raw.q) ? raw.q[0] : raw.q, status: Array.isArray(raw.status) ? raw.status[0] : raw.status });
  const filter = parsed.success ? parsed.data : ledgerFilterSchema.parse({});

  const referenceDate = referenceDateFor(membership.merchant);
  let rows: AccountRow[] | null = null;
  try {
    rows = await listAccounts(membership.merchant, referenceDate);
  } catch (e) {
    console.error("udhaar list failed:", e);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Udhaar</h1>
      {membership.merchant.isDemo ? (
        <p role="note" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Demo store with synthetic data. Overdue is counted as of {formatLocalDate(referenceDate)}.
        </p>
      ) : null}

      {!rows ? (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">We could not load the credit ledger right now. Please refresh the page.</p>
      ) : (
        <>
          {(() => {
            const s = summarize(rows);
            return (
              <section aria-label="Credit summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard label="Total outstanding" value={formatPaise(s.totalOutstandingPaise)} hint="Credit given minus repayments" />
                <KpiCard label="Customers with balance" value={String(s.customersWithBalance)} />
                <KpiCard label="Overdue amount" value={formatPaise(s.totalOverduePaise)} hint="Unpaid credit past its due date" />
                <KpiCard label="Overdue customers" value={String(s.overdueCustomers)} />
              </section>
            );
          })()}

          <Panel title="Payment reminders" subtitle="DukaanIQ drafts a polite reminder for customers whose credit is overdue past the grace period. Nothing is sent until you approve it in the Action Centre.">
            {membership.role === "OWNER" ? (
              <div className="max-w-md space-y-2">
                <GenerateRemindersForm />
                <Link href="/dashboard/action-centre" className="inline-block text-sm font-medium text-indigo-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600">Open the Action Centre</Link>
              </div>
            ) : (
              <p className="text-sm text-slate-600">Only the shop owner can prepare reminders.</p>
            )}
          </Panel>

          <form method="get" action="/dashboard/udhaar" className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
            <div>
              <label htmlFor="q" className="block text-xs font-medium text-slate-600">Search customer</label>
              <input id="q" name="q" type="search" defaultValue={filter.q} maxLength={60} className={control} />
            </div>
            <div>
              <label htmlFor="status" className="block text-xs font-medium text-slate-600">Show</label>
              <select id="status" name="status" defaultValue={filter.status} className={control}>
                {STATUS_FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2">Apply</button>
          </form>

          <Panel title="Customers" subtitle="To add credit for a customer who has none yet, search their name under All and open them.">
            {(() => {
              const list = applyFilter(rows, filter.status, filter.q);
              if (list.length === 0) return <EmptyState message="No customers match this filter." />;
              return (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs uppercase text-slate-500">
                      <tr>
                        <th scope="col" className="py-2 pr-4 font-medium">Customer</th>
                        <th scope="col" className="py-2 pr-4 text-right font-medium">Outstanding</th>
                        <th scope="col" className="py-2 pr-4 text-right font-medium">Overdue</th>
                        <th scope="col" className="py-2 pr-4 font-medium">Next due</th>
                        <th scope="col" className="py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {list.map((r) => (
                        <tr key={r.customerId}>
                          <td className="py-2 pr-4">
                            <Link href={`/dashboard/udhaar/${r.customerId}`} className="font-medium text-indigo-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600">{r.name}</Link>
                          </td>
                          <td className="py-2 pr-4 text-right font-medium">{formatPaise(Math.max(r.account.balancePaise, 0))}</td>
                          <td className="py-2 pr-4 text-right">{r.account.overduePaise ? `${formatPaise(r.account.overduePaise)} (${r.account.daysOverdue} days)` : "-"}</td>
                          <td className="whitespace-nowrap py-2 pr-4">{r.account.nextDueDate ? formatLocalDate(r.account.nextDueDate) : "-"}</td>
                          <td className="py-2">
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[r.account.status]}`}>{STATUS_LABEL[r.account.status]}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </Panel>
        </>
      )}
    </div>
  );
}
