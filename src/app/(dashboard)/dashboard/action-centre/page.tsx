import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, Panel } from "@/components/dashboard/panel";
import { Badge } from "@/components/ui/badge";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { formatDateTimeIST } from "@/lib/money";
import { requireSession } from "@/server/auth/session";
import { getCurrentMembership } from "@/server/merchant/access";
import { listRecommendations, type RecommendationListItem } from "@/server/recommendations/service";
import { TYPE_LABEL } from "@/server/recommendations/labels";
import { STATUS_LABEL, STATUS_STYLE } from "@/server/recommendations/state";
import {
  Sparkles,
  ArrowRight,
  Shield,
  Clock,
  CheckCircle2,
  AlertCircle,
  Users,
} from "@/components/ui/icons";

export const metadata: Metadata = { title: "AI Recommendation Centre" };

const GROUPS = [
  {
    key: "PENDING",
    title: "Waiting for Your Executive Decision",
    hint: "DukaanIQ only proposes. No customer is contacted and no action executes without your explicit sign-off.",
    statuses: ["DRAFT", "PENDING_APPROVAL"],
    badgeVariant: "brand" as const,
  },
  {
    key: "APPROVED",
    title: "Approved Proposals &amp; Ready for Queue",
    hint: "Approved by store owner and staged for recorded execution.",
    statuses: ["APPROVED", "EXECUTION_PENDING"],
    badgeVariant: "success" as const,
  },
  {
    key: "EXECUTED",
    title: "Executed &amp; Verified Actions",
    hint: "Simulated demo actions and delivery log. All events recorded in append-only audit trail.",
    statuses: ["SIMULATED", "SENT", "DELIVERED", "READ"],
    badgeVariant: "neutral" as const,
  },
  {
    key: "REJECTED",
    title: "Rejected or Archived Proposals",
    hint: "Proposals declined with merchant feedback or superseded by revised alternatives.",
    statuses: ["REJECTED", "CANCELLED", "FAILED"],
    badgeVariant: "danger" as const,
  },
];

const CATEGORY_MAP: Record<string, { label: string; badge: string }> = {
  CREDIT_REMINDER: { label: "Cashflow & Credit Recovery", badge: "Cashflow" },
  WINBACK: { label: "Customer Retention & Reactivation", badge: "Retention" },
  BUNDLE: { label: "Revenue Growth & Basket Expansion", badge: "Revenue" },
  SLOW_MOVING: { label: "Sales & Inventory Optimization", badge: "Inventory" },
  PEAK_TIMING: { label: "Marketing & Footfall Timing", badge: "Marketing" },
  LOYALTY: { label: "Customer Loyalty & VIP Engagement", badge: "Loyalty" },
};

function RecommendationTable({ rows }: { rows: RecommendationListItem[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-[#E2E4E9] text-[11px] font-semibold uppercase tracking-wider text-[#737B8C]">
            <th scope="col" className="pb-3 pr-4">Business Opportunity</th>
            <th scope="col" className="pb-3 pr-4">Strategy Category</th>
            <th scope="col" className="pb-3 pr-4 text-center">Target Audience</th>
            <th scope="col" className="pb-3 pr-4">Generated Date</th>
            <th scope="col" className="pb-3 pr-4">State</th>
            <th scope="col" className="pb-3 text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#F0F2F5]">
          {rows.map((r) => {
            const cat = CATEGORY_MAP[r.type] ?? { label: TYPE_LABEL[r.type] ?? r.type, badge: "Strategy" };
            const isPending = r.status === "PENDING_APPROVAL";

            return (
              <tr key={r.id} className="hover:bg-[#F8F9FB] transition-colors">
                <td className="py-3 pr-4">
                  <Link
                    href={`/dashboard/action-centre/${r.id}`}
                    className="font-semibold text-[#171A23] hover:text-[#4338CA] transition-colors flex items-center gap-1.5"
                  >
                    <span>{r.title}</span>
                    {r.isAlternative && (
                      <span className="rounded bg-amber-50 px-1.5 py-0.2 text-[10px] font-semibold text-amber-800 border border-amber-200">
                        Revised Alternative
                      </span>
                    )}
                  </Link>
                  <p className="mt-0.5 text-[11px] text-[#737B8C]">
                    Calculated from ledger facts &middot; {r.isAlternative ? "Adjusted based on feedback" : "Initial AI draft"}
                  </p>
                </td>

                <td className="py-3 pr-4">
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                    {cat.label}
                  </span>
                </td>

                <td className="py-3 pr-4 text-center font-mono tabular-nums text-[#171A23]">
                  <span className="inline-flex items-center gap-1 font-semibold">
                    <Users size={12} className="text-[#94A3B8]" />
                    {r.audienceSize} {r.audienceSize === 1 ? "customer" : "customers"}
                  </span>
                </td>

                <td className="whitespace-nowrap py-3 pr-4 font-mono text-[#525866]">
                  {formatDateTimeIST(r.createdAt)}
                </td>

                <td className="py-3 pr-4">
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[r.status]}`}>
                    {STATUS_LABEL[r.status]}
                  </span>
                </td>

                <td className="py-3 text-right">
                  <Link
                    href={`/dashboard/action-centre/${r.id}`}
                    className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                      isPending
                        ? "bg-[#4338CA] text-white hover:bg-[#3730A3] shadow-xs"
                        : "border border-[#D0D5DD] bg-white text-[#171A23] hover:bg-[#F8F9FA]"
                    }`}
                  >
                    <span>{isPending ? "Review" : "Details"}</span>
                    <ArrowRight size={12} />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function ActionCentrePage() {
  const session = await requireSession();
  const membership = await getCurrentMembership(session.user.id);
  if (!membership) return <EmptyState message="Set up your shop first to view recommendations." />;

  let rows: RecommendationListItem[] | null = null;
  try {
    rows = await listRecommendations(membership.merchant.id);
  } catch (e) {
    console.error("Action centre failed to load:", e);
  }

  const allRows = rows ?? [];
  const pendingCount = allRows.filter((r) => r.status === "PENDING_APPROVAL" || r.status === "DRAFT").length;
  const approvedCount = allRows.filter((r) => r.status === "APPROVED" || r.status === "EXECUTION_PENDING").length;
  const doneCount = allRows.filter((r) => ["SIMULATED", "SENT", "DELIVERED", "READ"].includes(r.status)).length;
  const rejectedCount = allRows.filter((r) => ["REJECTED", "CANCELLED", "FAILED"].includes(r.status)).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E4E9] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-[#171A23]">AI Recommendation Centre</h1>
            <Badge variant="brand" size="sm">
              Copilot Governance
            </Badge>
          </div>
          <p className="mt-1 text-xs text-[#737B8C]">
            Enterprise decision workflow. DukaanIQ generates proposals with calculated evidence; you review, revise and approve.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href="/dashboard/udhaar"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#D0D5DD] bg-white px-3.5 py-2 text-xs font-semibold text-[#171A23] shadow-xs hover:bg-[#F8F9FA] transition-colors"
          >
            <span>Scan Overdue Ledger</span>
            <ArrowRight size={13} />
          </Link>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Pending Your Decision"
          value={`${pendingCount} proposals`}
          hint="Requires merchant sign-off"
          icon={<Clock size={16} />}
        />
        <KpiCard
          label="Approved &amp; Staged"
          value={`${approvedCount} actions`}
          hint="Ready for execution queue"
          icon={<CheckCircle2 size={16} />}
        />
        <KpiCard
          label="Verified Actions Completed"
          value={`${doneCount} recorded`}
          hint="Simulated demo actions logged"
          icon={<Shield size={16} />}
        />
        <KpiCard
          label="Declined / Archived"
          value={`${rejectedCount} proposals`}
          hint="Dismissed or revised"
          icon={<AlertCircle size={16} />}
        />
      </div>

      {/* Trust & Governance Notice */}
      <div className="flex items-center justify-between rounded-xl border border-indigo-200/80 bg-indigo-50/60 p-4 text-xs text-indigo-950 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#4338CA] text-white">
            <Shield size={15} />
          </div>
          <div>
            <strong className="font-semibold">Deterministic Decision Engine:</strong> All financial amounts, customer overdue balances and audience segments are computed directly by database code. Message text is phrased with Sarvam AI and validated before display.
          </div>
        </div>
      </div>

      {/* Grouped Recommendation Tables */}
      {!rows ? (
        <EmptyState message="Unable to load recommendations. Please refresh." />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No recommendations yet"
          message="Scan the Udhaar ledger to prepare polite credit payment reminders, or check customer recovery opportunities."
        />
      ) : (
        <div className="space-y-6">
          {GROUPS.map((g) => {
            const list = allRows.filter((r) => g.statuses.includes(r.status));
            if (list.length === 0) return null;

            return (
              <Panel
                key={g.key}
                title={
                  <div className="flex items-center gap-2">
                    <span>{g.title}</span>
                    <Badge variant={g.badgeVariant} size="sm">
                      {list.length}
                    </Badge>
                  </div>
                }
                subtitle={g.hint}
              >
                <RecommendationTable rows={list} />
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}
