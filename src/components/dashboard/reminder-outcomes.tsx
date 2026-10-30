import Link from "next/link";
import { Panel } from "@/components/dashboard/panel";
import { Badge } from "@/components/ui/badge";
import { formatDateTimeIST, formatPaise } from "@/lib/money";
import type { ReminderOutcomes } from "@/server/outcomes/service";
import { ATTRIBUTION_WINDOW_DAYS } from "@/server/outcomes/repayments";

/** Verified repayments after reminders. Shown apart from estimates, with demo events labelled. */
export function ReminderOutcomesPanel({ outcomes, linkRecommendation = false }: { outcomes: ReminderOutcomes; linkRecommendation?: boolean }) {
  const { rows, real, demo } = outcomes;
  if (rows.length === 0) return null;
  const summary = real.reminded > 0 ? real : demo;
  const onlyDemo = real.reminded === 0;

  return (
    <Panel
      title="Reminder Results"
      subtitle={`Repayments you recorded within ${ATTRIBUTION_WINDOW_DAYS} days after a reminder. Timing only: a reminder does not prove why someone paid.`}
      badge={<Badge variant={onlyDemo ? "neutral" : "success"} size="sm">{onlyDemo ? "Demo only" : "Recorded"}</Badge>}
    >
      <div className="grid gap-3 text-xs sm:grid-cols-3">
        <div className="rounded-lg border border-[#F0F2F5] bg-[#FAFBFD] p-3"><div className="text-[#737B8C]">Customers reminded</div><div className="mt-1 text-lg font-bold text-[#171A23]">{summary.reminded}</div></div>
        <div className="rounded-lg border border-[#F0F2F5] bg-[#FAFBFD] p-3"><div className="text-[#737B8C]">Customers who repaid</div><div className="mt-1 text-lg font-bold text-[#171A23]">{summary.repaidCustomers}</div></div>
        <div className="rounded-lg border border-[#F0F2F5] bg-[#FAFBFD] p-3"><div className="text-[#737B8C]">Repayments recorded</div><div className="mt-1 text-lg font-bold text-emerald-700">{formatPaise(summary.repaidPaise)}</div></div>
      </div>
      {!onlyDemo && demo.reminded > 0 ? <p className="mt-2 text-[11px] text-[#737B8C]">Demo reminders ({demo.reminded}) are excluded from these totals.</p> : null}
      <ul className="mt-3 divide-y divide-[#F0F2F5] text-xs">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <span className="font-semibold text-[#171A23]">
              {linkRecommendation ? <Link href={`/dashboard/action-centre/${r.recommendationId}`} className="hover:text-[#4338CA]">{r.customerName}</Link> : r.customerName}
              {r.simulated ? <span className="ml-2 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800">Demo</span> : null}
            </span>
            <span className="text-[#737B8C]">
              Reminded {formatDateTimeIST(r.sentAt)} &middot;{" "}
              {r.repaidPaise > 0 ? <strong className="text-emerald-700">{formatPaise(r.repaidPaise)} repaid</strong> : "No repayment recorded yet"}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
