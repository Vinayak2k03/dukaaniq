import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonFacts } from "@/components/dashboard/json-facts";
import { EconomicsRange, OfferSummary } from "@/components/dashboard/offer-summary";
import { env } from "@/lib/env";
import { referenceDateFor } from "@/server/analytics/range";
import { Panel } from "@/components/dashboard/panel";
import { Badge } from "@/components/ui/badge";
import { formatDateTimeIST, formatLocalDate } from "@/lib/money";
import { DECLINE_REASONS } from "@/lib/validation/recommendation";
import { requireSession } from "@/server/auth/session";
import { getCurrentMembership } from "@/server/merchant/access";
import { TYPE_LABEL } from "@/server/recommendations/labels";
import { getRecommendationDetail } from "@/server/recommendations/service";
import { STATUS_LABEL, STATUS_STYLE } from "@/server/recommendations/state";
import { renderForCustomer } from "@/server/recommendations/text";
import { AlternativeForm, ApproveForm, ExecuteForm, RejectForm } from "../decision-forms";
import { VoiceApprove } from "./voice-approve";
import { ChevronLeft, Users, MessageSquare } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Review Recommendation" };

const EVENT_LABEL: Record<string, string> = {
  RECOMMENDATION_CREATED: "AI proposal drafted",
  APPROVED: "Owner approved",
  REJECTED: "Owner rejected",
  FEEDBACK_SUBMITTED: "Feedback recorded",
  ALTERNATIVE_CREATED: "Revised alternative generated",
  EXECUTION_REQUESTED: "Action queued",
  SIMULATED_ACTION_RECORDED: "Simulated demo action recorded",
};

const LANGUAGE_LABEL = { HINDI: "Hindi", HINGLISH: "Hinglish", ENGLISH: "English" } as const;
const asRecord = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export default async function RecommendationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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
  const source = asRecord(version.evidence).messageSource === "sarvam" ? "Sarvam AI" : "Deterministic Template";
  const highlights = asRecord(version.evidence).highlights;
  const summary = asRecord(version.offerTerms).summary;
  const termLines = Array.isArray(summary) ? summary.map(String) : [];
  const hasRange = Array.isArray(asRecord(version.economics).scenarios) || typeof asRecord(version.economics).maxExposurePaise === "number";
  const canAlternative = !rec.alternatives[0] && (rec.type === "CREDIT_REMINDER" || Boolean(asRecord(asRecord(version.evidence).tip).key));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Back button */}
      <div>
        <Link
          href="/dashboard/action-centre"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#4338CA] hover:underline"
        >
          <ChevronLeft size={14} />
          <span>Back to Recommendation Centre</span>
        </Link>

        {/* Title Bar */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E4E9] pb-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[rec.status]}`}>
                {STATUS_LABEL[rec.status]}
              </span>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                {TYPE_LABEL[rec.type] ?? rec.type}
              </span>
              <span className="text-xs text-[#737B8C]">Version {version.version}</span>
              {rec.alternativeOfId && (
                <Link
                  href={`/dashboard/action-centre/${rec.alternativeOfId}`}
                  className="text-xs font-semibold text-[#4338CA] hover:underline ml-1"
                >
                  (Revised from earlier proposal)
                </Link>
              )}
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#171A23]">
              {version.title}
            </h1>
          </div>
        </div>
      </div>

      {/* Demo notice */}
      {membership.merchant.isDemo && (
        <div
          role="note"
          className="flex items-center gap-2 rounded-xl border border-amber-200/80 bg-amber-50/70 p-3.5 text-xs text-amber-900 shadow-xs"
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-900 font-bold text-[10px]">
            i
          </span>
          <span>
            <strong>Demo environment:</strong> Approving records an authentic simulated demo execution. No external SMS or WhatsApp message is sent to actual mobile carriers.
          </span>
        </div>
      )}

      <VoiceApprove
        sarvam={Boolean(env.SARVAM_API_KEY)}
        referenceDate={referenceDateFor(membership.merchant)}
        recommendationId={rec.id}
        version={version.version}
        title={version.title}
        terms={termLines.length ? termLines : ["See the terms on this page"]}
        pending={rec.status === "PENDING_APPROVAL"}
        isOwner={isOwner}
      />

      {/* Why & What Happens If You Approve */}
      <Panel
        title="Executive Summary &amp; Opportunity Rationale"
        subtitle="Business context and projected operational consequences"
        badge={<Badge variant="brand" size="sm">Why This Matters</Badge>}
      >
        <div className="space-y-4 text-xs leading-relaxed text-[#171A23]">
          <p className="bg-[#FAFBFD] p-3.5 rounded-lg border border-[#F0F2F5] text-sm text-[#171A23] font-medium leading-relaxed">
            {why}
          </p>
          {whatIf && (
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3.5">
              <h4 className="font-semibold text-emerald-950 text-xs flex items-center gap-1.5">
                <span>Expected Result Upon Approval</span>
              </h4>
              <p className="mt-1 text-xs text-emerald-900 leading-relaxed">{whatIf}</p>
            </div>
          )}
        </div>
      </Panel>

      {/* What changed from earlier proposal */}
      {Array.isArray(changes) && changes.length > 0 && (
        <Panel title="Changes from Previous Proposal" subtitle="Adjustments made in this revised version">
          <ul className="list-disc pl-5 text-xs space-y-1 text-[#525866]">
            {changes.map((c, i) => (
              <li key={i}>{String(c)}</li>
            ))}
          </ul>
        </Panel>
      )}

      {/* Evidence & Economics Cards */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="Deterministic Evidence"
          subtitle="Calculated strictly from ledger records — zero hallucinations"
          badge={<Badge variant="neutral" size="sm">Facts</Badge>}
        >
          {Array.isArray(highlights) && highlights.length > 0 && (
            <ul className="mb-3 list-disc space-y-1 pl-4 text-xs text-[#171A23]">{highlights.map((h) => <li key={String(h)}>{String(h)}</li>)}</ul>
          )}
          <JsonFacts data={version.evidence} hide={["messageSource", "highlights", "tip"]} />
        </Panel>

        <Panel
          title="Economic Assumptions"
          subtitle="Scenario projections — estimates, not speculative promises"
          badge={<Badge variant="success" size="sm">ROI Model</Badge>}
        >
          {hasRange ? <EconomicsRange economics={version.economics} /> : <JsonFacts data={version.economics} />}
        </Panel>
      </div>

      {/* Terms */}
      {Object.keys(asRecord(version.offerTerms)).filter((k) => k !== "changesFromPrevious").length > 0 && (
        <Panel title="Policy &amp; Campaign Terms" subtitle="Exact offer terms in this version">
          {termLines.length > 0 ? (
            <>
              <OfferSummary terms={version.offerTerms} />
              <details className="mt-3 text-xs text-[#737B8C]">
                <summary className="cursor-pointer">All stored parameters</summary>
                <div className="mt-2"><JsonFacts data={version.offerTerms} hide={["changesFromPrevious", "summary", "items", "limits", "timeWindow"]} /></div>
              </details>
            </>
          ) : (
            <JsonFacts data={version.offerTerms} hide={["changesFromPrevious"]} />
          )}
        </Panel>
      )}

      {/* Target Audience List */}
      <Panel
        title={`Target Customers (${version.audience.length})`}
        subtitle="Individual shoppers qualifying for this recommendation"
        badge={<Badge variant="neutral" size="sm"><Users size={12} className="inline mr-1" />{version.audience.length} recipients</Badge>}
      >
        <ul className="divide-y divide-[#F0F2F5] text-xs">
          {version.audience.map((a) => (
            <li key={a.customer.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#4338CA]/10 font-bold text-[#4338CA] text-[10px]">
                  {a.customer.displayName[0]?.toUpperCase()}
                </div>
                <span className="font-semibold text-[#171A23]">{a.customer.displayName}</span>
              </div>
              <span className="text-[#737B8C]">
                {a.customer.isSynthetic ? "Demo Customer" : a.customer.optedOutAt ? "Opted Out" : "Consent OK"}
                {a.lastPurchaseAt && (
                  <> &middot; Last order {formatLocalDate(a.lastPurchaseAt.toISOString().slice(0, 10))}</>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      {/* Message Copy Preview */}
      <Panel
        title="WhatsApp Message Copy Preview"
        subtitle={`Channel: WhatsApp &middot; Language: ${LANGUAGE_LABEL[version.language as keyof typeof LANGUAGE_LABEL] ?? version.language} &middot; Author: ${source} &middot; Sample for ${sample}`}
        badge={<Badge variant="brand" size="sm"><MessageSquare size={12} className="inline mr-1" />Preview</Badge>}
      >
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-2xs">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-emerald-200/60 text-[11px] text-emerald-800 font-semibold">
            <span>WhatsApp Outbound Message</span>
            <span className="font-mono text-[10px]">Target: {sample}</span>
          </div>
          <p className="whitespace-pre-wrap font-sans text-xs text-[#171A23] leading-relaxed">
            {version.message ? renderForCustomer(version.message, sample) : "In-store tip: no customer message is sent."}
          </p>
        </div>
        {rec.type === "CREDIT_REMINDER" && (
          <p className="mt-2 text-[11px] text-[#737B8C]">
            Note: Sending a payment reminder is not a financial settlement. The customer&apos;s ledger balance updates only when you record an actual repayment received.
          </p>
        )}
      </Panel>

      {/* Executive Decision Panel */}
      <div id="decision" />
      <Panel
        title="Executive Sign-Off &amp; Action Decision"
        subtitle="Your decision governs this recommendation"
        className="border-indigo-200 bg-white"
      >
        {!isOwner ? (
          <p className="text-xs text-[#737B8C]">Only store owners have authority to approve or execute recommendations.</p>
        ) : rec.status === "PENDING_APPROVAL" ? (
          <div className="grid gap-6 md:grid-cols-2 pt-1">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
              <h3 className="text-sm font-bold text-emerald-950 mb-2">Approve &amp; Stage Action</h3>
              <ApproveForm recommendationId={rec.id} version={version.version} />
            </div>

            <div className="rounded-xl border border-[#E2E4E9] bg-[#FAFBFD] p-4">
              <h3 className="text-sm font-bold text-[#171A23] mb-2">Decline / Provide Feedback</h3>
              <RejectForm recommendationId={rec.id} version={version.version} />
            </div>
          </div>
        ) : rec.status === "APPROVED" ? (
          <div className="space-y-3">
            <p className="text-xs text-[#171A23]">
              Approved by <strong className="font-semibold text-emerald-800">{version.approval?.actor.name ?? "Store Owner"}</strong>. Staged and ready for execution.
            </p>
            <ExecuteForm recommendationId={rec.id} />
          </div>
        ) : rec.status === "REJECTED" ? (
          <div className="space-y-3">
            <p className="text-xs text-rose-800">
              Rejected: <strong>{reasonLabel(version.approval?.declineReason ?? null)}</strong>
              {version.approval?.note ? ` (${version.approval.note})` : ""}.
            </p>
            {rec.alternatives[0] ? (
              <Link
                href={`/dashboard/action-centre/${rec.alternatives[0].id}`}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#4338CA] hover:underline"
              >
                <span>View the revised alternative proposal</span>
                <ChevronLeft size={14} className="rotate-180" />
              </Link>
            ) : canAlternative ? (
              <AlternativeForm recommendationId={rec.id} />
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-[#171A23]">
            {run
              ? `Action executed on ${formatDateTimeIST(run.createdAt)} (${run.simulated ? "Simulated demo event logged" : "Sent"} to ${run._count.outboundMessages} recipients).`
              : STATUS_LABEL[rec.status]}
          </p>
        )}
      </Panel>

      {/* Immutable Audit Log History */}
      <Panel
        title="Immutable Governance Audit History"
        subtitle="Append-only log of every recommendation lifecycle event"
        badge={<Badge variant="neutral" size="sm">Audit Log</Badge>}
      >
        <ol className="space-y-3 text-xs">
          {events.map((e) => (
            <li key={e.id} className="flex items-center justify-between border-b border-[#F0F2F5] pb-2.5">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#4338CA]" />
                <span className="font-semibold text-[#171A23]">
                  {EVENT_LABEL[e.eventType] ?? e.eventType}
                </span>
                {e.actor && <span className="text-[#737B8C]">by {e.actor.name}</span>}
              </div>
              <span className="font-mono text-[11px] text-[#737B8C]">
                {formatDateTimeIST(e.createdAt)}
              </span>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}
