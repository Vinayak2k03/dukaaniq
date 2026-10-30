import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonFacts } from "@/components/dashboard/json-facts";
import { Panel } from "@/components/dashboard/panel";
import { formatDateTimeIST, formatLocalDate } from "@/lib/money";
import { DECLINE_REASONS } from "@/lib/validation/recommendation";
import { requireSession } from "@/server/auth/session";
import { getCurrentMembership } from "@/server/merchant/access";
import { TYPE_LABEL } from "@/server/recommendations/labels";
import { getRecommendationDetail } from "@/server/recommendations/service";
import { STATUS_LABEL, STATUS_STYLE } from "@/server/recommendations/state";
import { renderForCustomer } from "@/server/recommendations/text";
import { AlternativeForm, ApproveForm, ExecuteForm, RejectForm } from "../decision-forms";

export const metadata: Metadata = { title: "Review recommendation" };

const EVENT_LABEL: Record<string, string> = {
  RECOMMENDATION_CREATED: "Proposal created",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  FEEDBACK_SUBMITTED: "Feedback recorded",
  ALTERNATIVE_CREATED: "Alternative created",
  EXECUTION_REQUESTED: "Run requested",
  SIMULATED_ACTION_RECORDED: "Demo action recorded (nothing sent)",
};
const LANGUAGE_LABEL = { HINDI: "Hindi", HINGLISH: "Hinglish", ENGLISH: "English" } as const;
const asRecord = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export default async function RecommendationPage({ params }: PageProps<"/dashboard/action-centre/[id]">) {
  const session = await requireSession();
  const membership = await getCurrentMembership(session.user.id);
  if (!membership) notFound();

  const { id } = await params;
  const detail = await getRecommendationDetail(membership.merchant.id, id);
  if (!detail) notFound();

  const { rec, version, events } = detail;
  const isOwner = membership.role === "OWNER";
  const sample = version.audience[0]?.customer.displayName ?? "Customer";
  const [why, whatIf] = version.explanation.split("\n\n");
  const reasonLabel = (r: string | null) => DECLINE_REASONS.find(([v]) => v === r)?.[1] ?? r;
  const changes = asRecord(version.offerTerms).changesFromPrevious;
  const run = version.actionLogs[0];
  const source = asRecord(version.evidence).messageSource === "sarvam" ? "Written by Sarvam AI" : "Fixed template";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/dashboard/action-centre" className="text-sm font-medium text-indigo-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600">&larr; Action Centre</Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">{version.title}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[rec.status]}`}>{STATUS_LABEL[rec.status]}</span>
          <span>{TYPE_LABEL[rec.type] ?? rec.type}</span>
          <span>&middot; Version {version.version}</span>
          {rec.alternativeOfId ? <Link href={`/dashboard/action-centre/${rec.alternativeOfId}`} className="font-medium text-indigo-700 hover:underline">Revised from an earlier proposal</Link> : null}
        </p>
      </div>

      {membership.merchant.isDemo ? (
        <p role="note" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">Demo store with synthetic customers. Approving records a demo action only; no message is sent.</p>
      ) : null}

      <Panel title="Why this is suggested">
        <p className="text-sm text-slate-700">{why}</p>
        {whatIf ? <><h3 className="mt-4 text-sm font-semibold text-slate-900">What happens if you approve</h3><p className="mt-1 text-sm text-slate-700">{whatIf}</p></> : null}
      </Panel>

      {Array.isArray(changes) && changes.length ? (
        <Panel title="What changed from the earlier proposal">
          <ul className="list-disc pl-5 text-sm text-slate-700">{changes.map((c, i) => <li key={i}>{String(c)}</li>)}</ul>
        </Panel>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Evidence" subtitle="Calculated from your records, not guessed."><JsonFacts data={version.evidence} hide={["messageSource"]} /></Panel>
        <Panel title="Amounts and assumptions" subtitle="Estimates are scenarios, not promises."><JsonFacts data={version.economics} /></Panel>
      </div>
      {Object.keys(asRecord(version.offerTerms)).filter((k) => k !== "changesFromPrevious").length ? (
        <Panel title="Terms"><JsonFacts data={version.offerTerms} hide={["changesFromPrevious"]} /></Panel>
      ) : null}

      <Panel title={`Customers (${version.audience.length})`} subtitle="Exactly who this applies to.">
        <ul className="divide-y divide-slate-100 text-sm">
          {version.audience.map((a) => (
            <li key={a.customer.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="font-medium text-slate-900">{a.customer.displayName}</span>
              <span className="text-slate-600">
                {a.customer.isSynthetic ? "Synthetic demo customer" : a.customer.optedOutAt ? "Opted out" : a.customer.optedInAt ? "Opted in" : "No consent recorded"}
                {a.lastPurchaseAt ? ` · Last purchase ${formatLocalDate(a.lastPurchaseAt.toISOString().slice(0, 10))}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Message preview" subtitle={`${LANGUAGE_LABEL[version.language as keyof typeof LANGUAGE_LABEL] ?? version.language} · WhatsApp (manual) · ${source} · shown for ${sample}`}>
        <p className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-900">{renderForCustomer(version.message, sample)}</p>
        {rec.type === "CREDIT_REMINDER" ? <p className="mt-2 text-xs text-slate-500">A reminder is not a payment. The balance only changes when you record a repayment.</p> : null}
      </Panel>

      <Panel title="Your decision">
        {!isOwner ? (
          <p className="text-sm text-slate-600">Only the shop owner can approve, reject or run recommendations.</p>
        ) : rec.status === "PENDING_APPROVAL" ? (
          <div className="grid gap-6 md:grid-cols-2">
            <div><h3 className="mb-3 font-semibold text-slate-900">Approve</h3><ApproveForm recommendationId={rec.id} version={version.version} /></div>
            <div><h3 className="mb-3 font-semibold text-slate-900">Reject</h3><RejectForm recommendationId={rec.id} version={version.version} /></div>
          </div>
        ) : rec.status === "APPROVED" ? (
          <div className="max-w-md space-y-2">
            <p className="text-sm text-slate-700">Approved by {version.approval?.actor.name ?? "the owner"}. Nothing has run yet.</p>
            <ExecuteForm recommendationId={rec.id} />
          </div>
        ) : rec.status === "REJECTED" ? (
          <div className="max-w-md space-y-2">
            <p className="text-sm text-slate-700">Rejected: {reasonLabel(version.approval?.declineReason ?? null)}{version.approval?.note ? ` (${version.approval.note})` : ""}. Nothing will be sent.</p>
            {rec.alternatives[0] ? <Link href={`/dashboard/action-centre/${rec.alternatives[0].id}`} className="text-sm font-medium text-indigo-700 hover:underline">View the alternative</Link> : rec.type === "CREDIT_REMINDER" ? <AlternativeForm recommendationId={rec.id} /> : null}
          </div>
        ) : (
          <p className="text-sm text-slate-700">
            {run ? `Recorded on ${formatDateTimeIST(run.createdAt)} as ${run.simulated ? "a demo action: no message was sent" : "sent"} (${run._count.outboundMessages} customer${run._count.outboundMessages === 1 ? "" : "s"}).` : STATUS_LABEL[rec.status]}
          </p>
        )}
      </Panel>

      <Panel title="History" subtitle="Every step is recorded and cannot be edited.">
        <ol className="space-y-2 text-sm">
          {events.map((e) => (
            <li key={e.id} className="flex flex-wrap justify-between gap-2 border-b border-slate-100 pb-2">
              <span className="font-medium text-slate-900">{EVENT_LABEL[e.eventType] ?? e.eventType}{e.actor ? ` by ${e.actor.name}` : ""}</span>
              <span className="text-slate-600">{formatDateTimeIST(e.createdAt)}</span>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}
