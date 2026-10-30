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

export const metadata: Metadata = { title: "Customer ledger" };

export default async function CustomerLedgerPage({ params }: PageProps<"/dashboard/udhaar/[customerId]">) {
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
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link href="/dashboard/udhaar" className="text-sm font-medium text-indigo-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600">&larr; All customers</Link>
        <h1 className="mt-2 flex flex-wrap items-center gap-3 text-2xl font-semibold text-slate-900">
          {customer.displayName}
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[account.status]}`}>{STATUS_LABEL[account.status]}</span>
        </h1>
      </div>

      <section aria-label="Balance" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard label="Outstanding balance" value={formatPaise(account.balancePaise)} hint="Credit given + corrections - repayments" />
        <KpiCard label="Total credit given" value={formatPaise(account.creditGivenPaise)} />
        <KpiCard label="Total repaid" value={formatPaise(account.repaidPaise)} />
        <KpiCard label="Oldest unpaid" value={oldest ? formatPaise(oldest.remainingPaise) : "None"} hint={oldest ? `From ${formatLocalDate(oldest.entryDate.toISOString().slice(0, 10))}` : undefined} />
        <KpiCard label="Next due date" value={account.nextDueDate ? formatLocalDate(account.nextDueDate) : "None"} />
        <KpiCard label="Overdue" value={account.overduePaise ? formatPaise(account.overduePaise) : "None"} hint={account.daysOverdue ? `Oldest overdue ${account.daysOverdue} days (as of ${formatLocalDate(referenceDate)})` : undefined} />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <AddCreditForm customerId={customer.id} idempotencyKey={randomUUID()} today={referenceDate} />
        <RepaymentForm customerId={customer.id} idempotencyKey={randomUUID()} today={referenceDate} disabled={account.balancePaise <= 0} />
        {membership.role === "OWNER" && options.length ? (
          <CorrectionForm customerId={customer.id} idempotencyKey={randomUUID()} options={options} />
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">
            <h3 className="font-semibold text-slate-900">Correct an entry</h3>
            <p className="mt-2">{membership.role === "OWNER" ? "There are no entries to correct yet." : "Only the shop owner can correct ledger entries."}</p>
          </div>
        )}
      </div>

      <Panel title="Ledger history" subtitle="Oldest first. Entries are never edited or deleted; mistakes are fixed with a correction line.">
        {lines.length === 0 ? (
          <EmptyState message="No credit entries for this customer yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th scope="col" className="py-2 pr-4 font-medium">Date</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Type</th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">Amount</th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">Balance</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Due</th>
                  <th scope="col" className="py-2 font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lines.map((l) => {
                  const plus = l.type === "CREDIT_GIVEN" || l.type === "ADJUSTMENT_INCREASE";
                  return (
                    <tr key={l.id}>
                      <td className="whitespace-nowrap py-2 pr-4">{formatDateTimeIST(l.entryDate)}</td>
                      <td className="py-2 pr-4">{ENTRY_TYPE_LABEL[l.type]}</td>
                      <td className={`whitespace-nowrap py-2 pr-4 text-right font-medium ${plus ? "text-slate-900" : "text-emerald-700"}`}>{plus ? "+" : "-"}{formatPaise(l.amountPaise)}</td>
                      <td className="whitespace-nowrap py-2 pr-4 text-right">{formatPaise(l.runningBalancePaise)}</td>
                      <td className="whitespace-nowrap py-2 pr-4">{l.dueYmd ? formatLocalDate(l.dueYmd) : "-"}</td>
                      <td className="py-2 text-slate-600">
                        {[l.paymentMethod, l.reason ? `Reason: ${l.reason}` : null, l.note, l.reversesEntryId ? "Corrects an earlier entry" : null, l.imported ? "Imported demo entry" : null].filter(Boolean).join(" · ") || "-"}
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
