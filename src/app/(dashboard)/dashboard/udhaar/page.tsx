import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, Panel } from "@/components/dashboard/panel";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Badge } from "@/components/ui/badge";
import { formatLocalDate, formatPaise } from "@/lib/money";
import { ledgerFilterSchema } from "@/lib/validation/credit";
import { STATUS_LABEL, STATUS_STYLE } from "@/lib/validation/credit-labels";
import { referenceDateFor } from "@/server/analytics/range";
import { requireSession } from "@/server/auth/session";
import { listAccounts, summarize, type AccountRow } from "@/server/credit/service";
import { getCurrentMembership } from "@/server/merchant/access";
import { GenerateRemindersForm } from "../action-centre/decision-forms";
import { BookMarked, Search, Filter, Shield, Clock, ArrowRight, Sparkles, AlertCircle } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Udhaar Ledger" };

const STATUS_FILTERS = [
  ["outstanding", "Has Outstanding Balance"],
  ["overdue", "Overdue Past Grace Period"],
  ["upcoming", "Due Soon / Upcoming"],
  ["settled", "Settled Accounts"],
  ["all", "All Customers with History"],
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
  const parsed = ledgerFilterSchema.safeParse({
    q: Array.isArray(raw.q) ? raw.q[0] : raw.q,
    status: Array.isArray(raw.status) ? raw.status[0] : raw.status,
  });
  const filter = parsed.success ? parsed.data : ledgerFilterSchema.parse({});

  const referenceDate = referenceDateFor(membership.merchant);
  let rows: AccountRow[] | null = null;
  try {
    rows = await listAccounts(membership.merchant, referenceDate);
  } catch (e) {
    console.error("Udhaar list failed:", e);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E4E9] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-[#171A23]">Udhaar &amp; Credit Ledger</h1>
            <Badge variant="brand" size="sm">
              Append-Only Ledger
            </Badge>
          </div>
          <p className="mt-1 text-xs text-[#737B8C]">
            Track credit extended to customers, repayments received and automated overdue payment reminders.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-lg border border-[#E2E4E9] bg-white px-3 py-1.5 text-[#525866] shadow-xs">
            Overdue counted as of: <strong className="text-[#171A23]">{formatLocalDate(referenceDate)}</strong>
          </span>
        </div>
      </div>

      {membership.merchant.isDemo && (
        <div
          role="note"
          className="flex items-center justify-between gap-3 rounded-xl border border-amber-200/80 bg-amber-50/70 px-4 py-3 text-xs text-amber-900 shadow-xs"
        >
          <span>
            <strong>Demo store dataset:</strong> 74 immutable ledger entries representing retail credit. Overdue days calculated relative to fixed reference date {referenceDate}.
          </span>
          <span className="shrink-0 font-mono text-[11px] text-amber-800">Deterministic Ledger</span>
        </div>
      )}

      {!rows ? (
        <EmptyState message="We could not load the credit ledger right now. Please refresh the page." />
      ) : (
        <>
          {/* Credit KPI Cards */}
          {(() => {
            const s = summarize(rows);
            return (
              <section aria-label="Credit summary" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard
                  label="Total Outstanding Credit"
                  value={formatPaise(s.totalOutstandingPaise)}
                  hint="Net credit given minus repayments"
                  icon={<BookMarked size={16} />}
                />
                <KpiCard
                  label="Customers with Balance"
                  value={`${s.customersWithBalance} accounts`}
                  hint="Borrowers with unpaid balances"
                  icon={<Shield size={16} />}
                />
                <KpiCard
                  label="Overdue Amount"
                  value={formatPaise(s.totalOverduePaise)}
                  hint="Past grace period without repayment"
                  icon={<Clock size={16} />}
                />
                <KpiCard
                  label="Overdue Borrowers"
                  value={`${s.overdueCustomers} customers`}
                  hint="Action Centre reminder candidates"
                  icon={<AlertCircle size={16} />}
                />
              </section>
            );
          })()}

          {/* AI Automated Payment Reminder Generator */}
          <div className="rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50/70 via-white to-indigo-50/40 p-5 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#4338CA] text-white">
                  <Sparkles size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#171A23]">AI Payment Reminder Copilot</h3>
                  <p className="mt-0.5 text-xs text-[#525866] max-w-xl leading-relaxed">
                    DukaanIQ scans your ledger for customers overdue past their grace period, drafting polite, multi-lingual WhatsApp reminders. Nothing is sent until you approve in the Action Centre.
                  </p>
                </div>
              </div>

              {membership.role === "OWNER" ? (
                <div className="flex items-center gap-3">
                  <GenerateRemindersForm />
                  <Link
                    href="/dashboard/action-centre"
                    className="rounded-lg border border-[#D0D5DD] bg-white px-3.5 py-2 text-xs font-semibold text-[#171A23] hover:bg-[#F8F9FA] transition-colors"
                  >
                    Open Action Centre &rarr;
                  </Link>
                </div>
              ) : (
                <p className="text-xs text-[#737B8C]">Only the store owner can generate reminder proposals.</p>
              )}
            </div>
          </div>

          {/* Search & Filter Bar */}
          <form
            method="get"
            action="/dashboard/udhaar"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E2E4E9] bg-white p-3.5 shadow-xs"
          >
            <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[240px]">
              <div className="relative flex-1 min-w-[180px] max-w-sm">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#737B8C]" />
                <input
                  id="q"
                  name="q"
                  type="search"
                  defaultValue={filter.q}
                  placeholder="Search customer by name..."
                  className="w-full rounded-lg border border-[#D0D5DD] bg-white py-1.5 pl-9 pr-3 text-xs text-[#171A23] placeholder:text-[#94A3B8] shadow-xs focus:border-[#4338CA] focus:outline-none focus:ring-2 focus:ring-[#4338CA]/20"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <label htmlFor="status" className="text-xs font-medium text-[#737B8C]">
                  Filter:
                </label>
                <select
                  id="status"
                  name="status"
                  defaultValue={filter.status}
                  className="rounded-lg border border-[#D0D5DD] bg-white px-2.5 py-1.5 text-xs font-medium text-[#171A23] shadow-xs focus:border-[#4338CA] focus:outline-none focus:ring-2 focus:ring-[#4338CA]/20"
                >
                  {STATUS_FILTERS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#4338CA] px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-[#3730A3] transition-colors cursor-pointer"
            >
              <Filter size={13} />
              <span>Apply Filter</span>
            </button>
          </form>

          {/* Customers Table */}
          <Panel
            title="Customer Credit Accounts"
            subtitle="To extend credit to a customer who has none yet, select 'All' and open their profile."
          >
            {(() => {
              const list = applyFilter(rows, filter.status, filter.q);
              if (list.length === 0) return <EmptyState message="No customers match this filter criteria." />;

              return (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#E2E4E9] text-[11px] font-semibold uppercase tracking-wider text-[#737B8C]">
                        <th scope="col" className="pb-3 pr-4">Customer Name</th>
                        <th scope="col" className="pb-3 pr-4 text-right">Outstanding Balance</th>
                        <th scope="col" className="pb-3 pr-4 text-right">Overdue Balance</th>
                        <th scope="col" className="pb-3 pr-4">Next Due Date</th>
                        <th scope="col" className="pb-3 pr-4">Standing Status</th>
                        <th scope="col" className="pb-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F0F2F5]">
                      {list.map((r) => (
                        <tr key={r.customerId} className="hover:bg-[#F8F9FB] transition-colors">
                          <td className="py-3 pr-4">
                            <Link
                              href={`/dashboard/udhaar/${r.customerId}`}
                              className="font-semibold text-[#171A23] hover:text-[#4338CA] transition-colors"
                            >
                              {r.name}
                            </Link>
                          </td>

                          <td className="py-3 pr-4 text-right font-mono font-semibold tabular-nums text-[#171A23]">
                            {formatPaise(Math.max(r.account.balancePaise, 0))}
                          </td>

                          <td className="py-3 pr-4 text-right font-mono tabular-nums">
                            {r.account.overduePaise ? (
                              <span className="font-semibold text-rose-700">
                                {formatPaise(r.account.overduePaise)}{" "}
                                <span className="text-[10px] text-rose-600">({r.account.daysOverdue}d)</span>
                              </span>
                            ) : (
                              <span className="text-[#94A3B8]">&mdash;</span>
                            )}
                          </td>

                          <td className="whitespace-nowrap py-3 pr-4 text-[#525866]">
                            {r.account.nextDueDate ? formatLocalDate(r.account.nextDueDate) : "—"}
                          </td>

                          <td className="py-3 pr-4">
                            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[r.account.status]}`}>
                              {STATUS_LABEL[r.account.status]}
                            </span>
                          </td>

                          <td className="py-3 text-right">
                            <Link
                              href={`/dashboard/udhaar/${r.customerId}`}
                              className="inline-flex items-center gap-1 rounded-md border border-[#D0D5DD] bg-white px-2.5 py-1 text-[11px] font-medium text-[#171A23] hover:bg-[#F8F9FA] transition-colors"
                            >
                              <span>Ledger</span>
                              <ArrowRight size={11} />
                            </Link>
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
