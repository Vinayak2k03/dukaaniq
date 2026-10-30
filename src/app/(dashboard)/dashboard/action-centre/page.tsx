import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, Panel } from "@/components/dashboard/panel";
import { formatDateTimeIST } from "@/lib/money";
import { requireSession } from "@/server/auth/session";
import { getCurrentMembership } from "@/server/merchant/access";
import { listRecommendations, type RecommendationListItem } from "@/server/recommendations/service";
import { TYPE_LABEL } from "@/server/recommendations/labels";
import { STATUS_LABEL, STATUS_STYLE } from "@/server/recommendations/state";

export const metadata: Metadata = { title: "Action Centre" };

const GROUPS: { title: string; hint: string; statuses: string[] }[] = [
  { title: "Waiting for your approval", hint: "Nothing happens until you approve.", statuses: ["DRAFT", "PENDING_APPROVAL"] },
  { title: "Approved, ready to record", hint: "Approved but not yet run.", statuses: ["APPROVED", "EXECUTION_PENDING"] },
  { title: "Done", hint: "Demo actions are labelled; no real message was sent.", statuses: ["SIMULATED", "SENT", "DELIVERED", "READ"] },
  { title: "Rejected, cancelled or failed", hint: "These never ran.", statuses: ["REJECTED", "CANCELLED", "FAILED"] },
];

function Table({ rows }: { rows: RecommendationListItem[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase text-slate-500">
          <tr>
            <th scope="col" className="py-2 pr-4 font-medium">Recommendation</th>
            <th scope="col" className="py-2 pr-4 font-medium">Type</th>
            <th scope="col" className="py-2 pr-4 text-right font-medium">Customers</th>
            <th scope="col" className="py-2 pr-4 font-medium">Created</th>
            <th scope="col" className="py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="py-2 pr-4">
                <Link href={`/dashboard/action-centre/${r.id}`} className="font-medium text-indigo-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600">{r.title}</Link>
                {r.isAlternative ? <span className="ml-2 text-xs text-slate-500">(revised alternative)</span> : null}
              </td>
              <td className="py-2 pr-4">{TYPE_LABEL[r.type] ?? r.type}</td>
              <td className="py-2 pr-4 text-right">{r.audienceSize}</td>
              <td className="whitespace-nowrap py-2 pr-4">{formatDateTimeIST(r.createdAt)}</td>
              <td className="py-2"><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[r.status]}`}>{STATUS_LABEL[r.status]}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function ActionCentrePage() {
  const session = await requireSession();
  const membership = await getCurrentMembership(session.user.id);
  if (!membership) return <EmptyState message="Set up your shop first to see recommendations." />;

  let rows: RecommendationListItem[] | null = null;
  try {
    rows = await listRecommendations(membership.merchant.id);
  } catch (e) {
    console.error("action centre failed:", e);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Action Centre</h1>
      <p className="text-sm text-slate-600">DukaanIQ only proposes. Every recommendation waits here for your decision, and each decision is recorded.</p>
      {!rows ? (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700">We could not load your recommendations right now. Please refresh the page.</p>
      ) : rows.length === 0 ? (
        <EmptyState message="No recommendations yet. Overdue-credit reminders can be prepared from the Udhaar page." />
      ) : (
        GROUPS.map((g) => {
          const list = rows.filter((r) => g.statuses.includes(r.status));
          return list.length ? (
            <Panel key={g.title} title={`${g.title} (${list.length})`} subtitle={g.hint}>
              <Table rows={list} />
            </Panel>
          ) : null;
        })
      )}
    </div>
  );
}
