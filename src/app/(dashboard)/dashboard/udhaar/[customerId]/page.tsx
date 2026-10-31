import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, Panel } from "@/components/dashboard/panel";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { formatDateTimeIST, formatLocalDate, formatPaise } from "@/lib/money";
import { ENTRY_TYPE_LABEL, STATUS_LABEL, STATUS_STYLE } from "@/lib/validation/credit-labels";
import { referenceDateFor } from "@/server/analytics/range";
import { requireSession } from "@/server/auth/session";
import { getCustomerLedger } from "@/server/credit/service";
import { getCurrentMembership } from "@/server/merchant/access";
import { AddCreditForm, CorrectionForm, RepaymentForm } from "./ledger-forms";
import { ChevronLeft, BookMarked, Wallet, Clock, AlertCircle } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Customer Ledger" };

export default async function CustomerLedgerPage({
  params,
}: PageProps<"/dashboard/udhaar/[customerId]">) {
  const session = await requireSession();
  const membership = await getCurrentMembership(session.user.id);
  if (!membership) return <EmptyState message="Set up your shop first to use the credit ledger." />;

  const { customerId } = await params;
  const referenceDate = referenceDateFor(membership.merchant);
  const ledger = await getCustomerLedger(membership.merchant, customerId, referenceDate);
  if (!ledger) notFound();

  const { customer, lines, account, correctable } = ledger;
  const options = correctable.map((c) => ({
    id: c.id,
    label: `${ENTRY_TYPE_LABEL[c.type]} ${formatPaise(c.amountPaise)} on ${formatLocalDate(c.date.toISOString().slice(0, 10))} (can correct up to ${formatPaise(c.remainingPaise)})`,
  }));
  const oldest = account.oldestUnpaid;

  return (
    <div className="space-y-6">
      {/* Back button & Title */}
      <div>
        <Link
          href="/dashboard/udhaar"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#4338CA] hover:underline"
        >
          <ChevronLeft size={14} />
          <span>Back to All Udhaar Accounts</span>
        </Link>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E4E9] pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#4338CA] text-white font-bold text-base shadow-xs">
              {customer.displayName[0]?.toUpperCase() ?? "C"}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-[#171A23]">
                  {customer.displayName}
                </h1>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[account.status]}`}>
                  {STATUS_LABEL[account.status]}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-[#737B8C]">
                Individual Credit Ledger Account &middot; Append-only audit integrity
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/dashboard/customers/${customer.id}`}
              className="rounded-lg border border-[#D0D5DD] bg-white px-3 py-1.5 text-xs font-medium text-[#171A23] hover:bg-[#F8F9FA] transition-colors"
            >
              CRM Profile &rarr;
            </Link>
          </div>
        </div>
      </div>

      {/* Credit Standing KPIs */}
      <section aria-label="Balance" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          label="Current Outstanding Balance"
          value={formatPaise(account.balancePaise)}
          hint="Credit given + corrections - repayments"
          icon={<Wallet size={16} />}
        />
        <KpiCard
          label="Total Credit Extended"
          value={formatPaise(account.creditGivenPaise)}
          hint="Cumulative historical udhaar"
          icon={<BookMarked size={16} />}
        />
        <KpiCard
          label="Total Repaid by Customer"
          value={formatPaise(account.repaidPaise)}
          hint="Verified settlement payments"
          icon={<Wallet size={16} />}
        />
        <KpiCard
          label="Oldest Unpaid Entry"
          value={oldest ? formatPaise(oldest.remainingPaise) : "None"}
          hint={oldest ? `From ${formatLocalDate(oldest.entryDate.toISOString().slice(0, 10))}` : undefined}
          icon={<Clock size={16} />}
        />
        <KpiCard
          label="Next Due Date"
          value={account.nextDueDate ? formatLocalDate(account.nextDueDate) : "None scheduled"}
          hint={account.nextDueDate ? "Agreed repayment deadline" : undefined}
          icon={<Clock size={16} />}
        />
        <KpiCard
          label="Overdue Past Grace Period"
          value={account.overduePaise ? formatPaise(account.overduePaise) : "₹0 (Current)"}
          hint={account.daysOverdue ? `Oldest overdue ${account.daysOverdue} days (as of ${formatLocalDate(referenceDate)})` : undefined}
          icon={<AlertCircle size={16} />}
        />
      </section>

      {/* Action Forms Grid */}
      <div className="grid gap-5 lg:grid-cols-3">
        <AddCreditForm customerId={customer.id} idempotencyKey={randomUUID()} today={referenceDate} />
        <RepaymentForm
          customerId={customer.id}
          idempotencyKey={randomUUID()}
          today={referenceDate}
          disabled={account.balancePaise <= 0}
        />
        {membership.role === "OWNER" && options.length ? (
          <CorrectionForm customerId={customer.id} idempotencyKey={randomUUID()} options={options} />
        ) : (
          <div className="rounded-xl border border-dashed border-[#D0D5DD] bg-[#FAFBFD] p-5 text-xs text-[#737B8C] flex flex-col justify-center">
            <h3 className="font-bold text-[#171A23] text-sm">Correct an Entry</h3>
            <p className="mt-1 leading-relaxed">
              {membership.role === "OWNER"
                ? "No entries currently available for adjustment."
                : "Only the store owner has permission to append ledger corrections."}
            </p>
          </div>
        )}
      </div>

      {/* Ledger History Table */}
      <Panel
        title={`Ledger History (${lines.length} entries)`}
        subtitle="Chronological transaction order. Entries are never modified or purged; discrepancies are resolved via audit corrections."
      >
        {lines.length === 0 ? (
          <EmptyState message="No credit entries recorded for this customer yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E2E4E9] text-[11px] font-semibold uppercase tracking-wider text-[#737B8C]">
                  <th scope="col" className="pb-3 pr-4">Timestamp (IST)</th>
                  <th scope="col" className="pb-3 pr-4">Entry Type</th>
                  <th scope="col" className="pb-3 pr-4 text-right">Amount (₹)</th>
                  <th scope="col" className="pb-3 pr-4 text-right">Running Balance</th>
                  <th scope="col" className="pb-3 pr-4">Due Date</th>
                  <th scope="col" className="pb-3">Details &amp; Audit Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F2F5]">
                {lines.map((l) => {
                  const plus = l.type === "CREDIT_GIVEN" || l.type === "ADJUSTMENT_INCREASE";
                  return (
                    <tr key={l.id} className="hover:bg-[#F8F9FB] transition-colors">
                      <td className="whitespace-nowrap py-3 pr-4 font-mono text-[#525866]">
                        {formatDateTimeIST(l.entryDate)}
                      </td>
                      <td className="py-3 pr-4 font-semibold text-[#171A23]">
                        {ENTRY_TYPE_LABEL[l.type]}
                      </td>
                      <td
                        className={`whitespace-nowrap py-3 pr-4 text-right font-mono font-bold tabular-nums ${
                          plus ? "text-[#171A23]" : "text-emerald-700"
                        }`}
                      >
                        {plus ? "+" : "-"}{formatPaise(l.amountPaise)}
                      </td>
                      <td className="whitespace-nowrap py-3 pr-4 text-right font-mono font-semibold tabular-nums text-[#171A23]">
                        {formatPaise(l.runningBalancePaise)}
                      </td>
                      <td className="whitespace-nowrap py-3 pr-4 text-[#525866]">
                        {l.dueYmd ? formatLocalDate(l.dueYmd) : "—"}
                      </td>
                      <td className="py-3 text-[#737B8C]">
                        {[
                          l.paymentMethod,
                          l.reason ? `Reason: ${l.reason}` : null,
                          l.note,
                          l.reversesEntryId ? "Reversal correction" : null,
                          l.imported ? "Dataset seed entry" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
