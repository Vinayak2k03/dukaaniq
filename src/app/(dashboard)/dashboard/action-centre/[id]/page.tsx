import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonFacts } from "@/components/dashboard/json-facts";
import { EconomicsRange, OfferSummary } from "@/components/dashboard/offer-summary";
import { env } from "@/lib/env";
import { referenceDateFor } from "@/server/analytics/range";
import { Panel } from "@/components/dashboard/panel";
import { Badge } from "@/components/ui/badge";
import { formatDateTimeIST, formatLocalDate, formatPaise } from "@/lib/money";
import { DECLINE_REASONS } from "@/lib/validation/recommendation";
import { requireSession } from "@/server/auth/session";
import { getCurrentMembership } from "@/server/merchant/access";
import { TYPE_LABEL } from "@/server/recommendations/labels";
import { getRecommendationDetail, listOutcomes } from "@/server/recommendations/service";
import { summarizeOutcomes } from "@/server/recommendations/outcome-math";
import { STATUS_LABEL, STATUS_STYLE } from "@/server/recommendations/state";
import { renderForCustomer } from "@/server/recommendations/text";
import { AlternativeForm, ApproveForm, ExecuteForm, OutcomeForm, RejectForm } from "../decision-forms";
import { VoiceApprove } from "./voice-approve";
import { WhatsAppSendList } from "../whatsapp-send-list";
import { ReminderOutcomesPanel } from "@/components/dashboard/reminder-outcomes";
import { getReminderOutcomes } from "@/server/outcomes/service";
import { whatsappLink } from "@/lib/whatsapp";
import { ChevronLeft, Users, MessageSquare } from "@/components/ui/icons";

export const metadata: Metadata = { title: "Review Suggestion" };

const EVENT_LABEL: Record<string, string> = {
  RECOMMENDATION_CREATED: "Suggestion prepared",
  APPROVED: "You approved",
  REJECTED: "You rejected",
  FEEDBACK_SUBMITTED: "Your feedback saved",
  ALTERNATIVE_CREATED: "New version prepared",
  EXECUTION_REQUESTED: "Sending started",
  SIMULATED_ACTION_RECORDED: "Demo: recorded, nothing sent",
  PROVIDER_RESPONSE: "Opened in WhatsApp by owner",
  OUTCOME_RECORDED: "Outcome recorded",
};

const LANGUAGE_LABEL = { HINDI: "Hindi", HINGLISH: "Hinglish", ENGLISH: "English" } as const;
const EXECUTED = ["SIMULATED", "SENT", "DELIVERED", "READ"];
const VERDICT = {
  "no-data": { text: "No outcome recorded yet.", variant: "neutral" },
  "no-estimate": { text: "No scenario estimate to compare against.", variant: "neutral" },
  below: { text: "Below the estimated range so far", variant: "warning" },
  within: { text: "Within the estimated range", variant: "success" },
  above: { text: "Above the estimated range", variant: "success" },
} as const;
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
  const reminderOutcomes = rec.type === "CREDIT_REMINDER" ? await getReminderOutcomes(membership.merchant.id, rec.id) : null;
  const executed = EXECUTED.includes(rec.status);
  const outcomes = executed ? await listOutcomes(membership.merchant.id, version.id) : [];
  const measured = summarizeOutcomes(outcomes, version.audience.length, version.economics);
  const outcomesSimulated = membership.merchant.isDemo || outcomes.some((o) => o.isSimulated);
  const isOwner = membership.role === "OWNER";
  const sample = version.audience[0]?.customer.displayName ?? "Customer";
  const [why, whatIf] = version.explanation.split("\n\n");
  const reasonLabel = (r: string | null) => DECLINE_REASONS.find(([v]) => v === r)?.[1] ?? r;
  const changes = asRecord(version.offerTerms).changesFromPrevious;
  const run = version.actionLogs[0];
  const source = asRecord(version.evidence).messageSource === "sarvam" ? "written by AI" : "standard template";
  const highlights = asRecord(version.evidence).highlights;
  const summary = asRecord(version.offerTerms).summary;
  const termLines = Array.isArray(summary) ? summary.map(String) : [];
  const hasRange = Array.isArray(asRecord(version.economics).scenarios) || typeof asRecord(version.economics).maxExposurePaise === "number";
  const terms = asRecord(version.offerTerms);
  const sharedCode = version.couponCodes.find((c) => c.customerId === null)?.code;
  const codeFor = new Map(version.couponCodes.flatMap((c) => (c.customerId ? [[c.customerId, c.code] as const] : [])));
  const sampleId = version.audience[0]?.customer.id;
  const sampleCode = sharedCode ?? (sampleId ? codeFor.get(sampleId) : undefined) ?? (typeof terms.codePrefix === "string" ? `[${terms.codeMode === "SHARED" ? "shared" : "unique"} code, created on approval]` : undefined);
  const canAlternative = !rec.alternatives[0] && (rec.type === "CREDIT_REMINDER" || Boolean(asRecord(asRecord(version.evidence).tip).key));
  const openedIds = new Set(run?.outboundMessages.map((m) => m.customerId));
  const liveSend = !membership.merchant.isDemo && version.channel === "WHATSAPP_MANUAL_LINK";
  const names = version.audience.map((a) => a.customer.displayName);
  const who = names.length <= 4 ? names.join(", ") : `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
  const targets = version.audience.map(({ customer: c }) => {
    const code = c.id ? codeFor.get(c.id) : sharedCode;
    const href = whatsappLink(c.phone, renderForCustomer(version.message, c.displayName, code));
    const blocked = c.isSynthetic ? "Demo customer" : !c.optedInAt || c.optedOutAt ? "No consent to message" : !href ? "No valid phone number" : null;
    return { customerId: c.id, name: c.displayName, href: blocked ? null : href, blocked, opened: openedIds.has(c.id) };
  });

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <Link href="/dashboard/action-centre" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#4338CA] hover:underline">
          <ChevronLeft size={14} />
          <span>Back to suggestions</span>
        </Link>
        <div className="mt-3 border-b border-[#E2E4E9] pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[rec.status]}`}>{STATUS_LABEL[rec.status]}</span>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{TYPE_LABEL[rec.type] ?? rec.type}</span>
            {rec.alternativeOfId && (
              <Link href={`/dashboard/action-centre/${rec.alternativeOfId}`} className="text-xs font-semibold text-[#4338CA] hover:underline">
                (New version of an earlier suggestion)
              </Link>
            )}
          </div>
          <h1 className="mt-2 text-xl font-bold tracking-tight text-[#171A23] sm:text-2xl">{version.title}</h1>
        </div>
      </div>

      {membership.merchant.isDemo && (
        <p role="note" className="rounded-xl border border-amber-200/80 bg-amber-50/70 p-3 text-xs text-amber-900">
          <strong>Demo shop:</strong> approving only records what would happen. No message is sent to anyone.
        </p>
      )}

      {/* What the owner needs to decide: why, who, the exact message, and what it could earn or cost. */}
      <Panel title="Why we suggest this">
        <div className="space-y-3 text-sm leading-relaxed text-[#171A23]">
          <p>{why}</p>
          {Array.isArray(highlights) && highlights.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-[#525866]">{highlights.slice(0, 4).map((h) => <li key={String(h)}>{String(h)}</li>)}</ul>
          )}
          {whatIf && <p className="rounded-lg bg-emerald-50/60 p-3 text-xs text-emerald-900"><strong>If you approve:</strong> {whatIf}</p>}
        </div>
      </Panel>

      <div className="grid gap-5 md:grid-cols-2">
        <Panel title={`Who gets it (${version.audience.length})`} badge={<Users size={14} className="text-[#737B8C]" />}>
          <p className="text-sm text-[#171A23]">{who || "No customers"}</p>
          {termLines.length > 0 && (
            <div className="mt-3 border-t border-[#F0F2F5] pt-3">
              <OfferSummary terms={version.offerTerms} />
            </div>
          )}
        </Panel>
        <Panel title="What it could earn or cost" subtitle="An estimate from your records, not a promise">
          {hasRange ? <EconomicsRange economics={version.economics} /> : <JsonFacts data={version.economics} />}
        </Panel>
      </div>

      <Panel title="The message" subtitle={`WhatsApp · ${LANGUAGE_LABEL[version.language as keyof typeof LANGUAGE_LABEL] ?? version.language} · ${source} · example for ${sample}`} badge={<MessageSquare size={14} className="text-[#737B8C]" />}>
        <p className="whitespace-pre-wrap rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 text-sm leading-relaxed text-[#171A23]">
          {version.message ? renderForCustomer(version.message, sample, sampleCode) : "Shop tip: no message goes to customers."}
        </p>
        {rec.type === "CREDIT_REMINDER" && (
          <p className="mt-2 text-[11px] text-[#737B8C]">A reminder does not change the balance. It changes only when you record the payment in Udhaar.</p>
        )}
      </Panel>

      <div id="decision" />
      <Panel title="Your decision" className="border-indigo-200 bg-white">
        {!isOwner ? (
          <p className="text-xs text-[#737B8C]">Only the shop owner can approve or send this.</p>
        ) : rec.status === "PENDING_APPROVAL" ? (
          <div className="grid gap-5 pt-1 md:grid-cols-2">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
              <h3 className="mb-2 text-sm font-bold text-emerald-950">Approve</h3>
              <ApproveForm recommendationId={rec.id} version={version.version} />
            </div>
            <div className="rounded-xl border border-[#E2E4E9] bg-[#FAFBFD] p-4">
              <h3 className="mb-2 text-sm font-bold text-[#171A23]">Not now</h3>
              <RejectForm recommendationId={rec.id} version={version.version} />
            </div>
          </div>
        ) : rec.status === "APPROVED" ? (
          <div className="space-y-3">
            <p className="text-xs text-[#171A23]">Approved by <strong className="font-semibold text-emerald-800">{version.approval?.actor.name ?? "the owner"}</strong>. Ready to send.</p>
            {liveSend ? <WhatsAppSendList recommendationId={rec.id} targets={targets} /> : <ExecuteForm recommendationId={rec.id} />}
          </div>
        ) : rec.status === "REJECTED" ? (
          <div className="space-y-3">
            <p className="text-xs text-rose-800">
              Rejected: <strong>{reasonLabel(version.approval?.declineReason ?? null)}</strong>
              {version.approval?.note ? ` (${version.approval.note})` : ""}.
            </p>
            {rec.alternatives[0] ? (
              <Link href={`/dashboard/action-centre/${rec.alternatives[0].id}`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#4338CA] hover:underline">
                <span>See the new version</span>
                <ChevronLeft size={14} className="rotate-180" />
              </Link>
            ) : canAlternative ? (
              <AlternativeForm recommendationId={rec.id} />
            ) : null}
          </div>
        ) : liveSend && rec.status === "EXECUTION_PENDING" ? (
          <WhatsAppSendList recommendationId={rec.id} targets={targets} />
        ) : (
          <p className="text-xs text-[#171A23]">
            {run ? `Done on ${formatDateTimeIST(run.createdAt)}: ${run.simulated ? "demo only, nothing sent" : "opened in WhatsApp"} for ${run._count.outboundMessages} customer${run._count.outboundMessages === 1 ? "" : "s"}.` : STATUS_LABEL[rec.status]}
          </p>
        )}
      </Panel>

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

      {reminderOutcomes ? <ReminderOutcomesPanel outcomes={reminderOutcomes} /> : null}

      {/* Results: recorded outcomes next to the estimate shown before approval (PRD 11.2). */}
      {executed && (
        <Panel
          title="Results so far"
          subtitle="What really happened, next to the estimate you saw before approving"
          badge={<Badge variant={outcomesSimulated ? "warning" : "success"} size="sm">{outcomesSimulated ? "Demo" : "Recorded"}</Badge>}
        >
          <div className="grid gap-4 text-xs md:grid-cols-2">
            <div className="rounded-lg border border-[#E2E4E9] bg-[#FAFBFD] p-3.5">
              <h4 className="mb-2 font-semibold text-[#171A23]">Estimated</h4>
              {measured.estimate ? (
                <dl className="space-y-1">
                  <div className="flex justify-between"><dt className="text-[#737B8C]">Customers who use it</dt><dd className="font-semibold tabular-nums">{measured.estimate.lowRedemptions} to {measured.estimate.highRedemptions}</dd></div>
                  <div className="flex justify-between"><dt className="text-[#737B8C]">Extra sales</dt><dd className="font-semibold tabular-nums">{formatPaise(measured.estimate.lowSalesPaise)} to {formatPaise(measured.estimate.highSalesPaise)}</dd></div>
                </dl>
              ) : (
                <p className="text-[#737B8C]">There was no estimate for this one.</p>
              )}
            </div>
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-3.5">
              <h4 className="mb-2 font-semibold text-emerald-950">Actual</h4>
              <dl className="space-y-1">
                <div className="flex justify-between"><dt className="text-[#737B8C]">Customers who came</dt><dd className="font-semibold tabular-nums">{measured.customersConverted} of {measured.customersReached} ({measured.conversionPct}%)</dd></div>
                <div className="flex justify-between"><dt className="text-[#737B8C]">Offers used</dt><dd className="font-semibold tabular-nums">{measured.redemptions}</dd></div>
                <div className="flex justify-between"><dt className="text-[#737B8C]">Return visits</dt><dd className="font-semibold tabular-nums">{measured.returns}</dd></div>
                <div className="flex justify-between"><dt className="text-[#737B8C]">Sales recorded</dt><dd className="font-semibold tabular-nums">{formatPaise(measured.measuredSalesPaise)}</dd></div>
              </dl>
            </div>
          </div>
          <div className="mt-3">
            <Badge variant={VERDICT[measured.verdict].variant} size="sm">{VERDICT[measured.verdict].text}</Badge>
          </div>
          {outcomes.length > 0 && (
            <ul className="mt-4 divide-y divide-[#F0F2F5] text-xs">
              {outcomes.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <strong className="font-semibold">{o.customer?.displayName ?? "Customer"}</strong>{" "}
                    {o.type === "OFFER_REDEEMED" ? "used the offer" : "came back to buy"}
                    {o.amountPaise > 0 && <> &middot; {formatPaise(o.amountPaise)}</>}
                    {o.isSimulated && <span className="ml-1.5 text-amber-700">(demo)</span>}
                  </span>
                  <span className="font-mono text-[11px] text-[#737B8C]">{formatDateTimeIST(o.occurredAt)}</span>
                </li>
              ))}
            </ul>
          )}
          {isOwner && (
            <div className="mt-4 border-t border-[#F0F2F5] pt-4">
              {membership.merchant.isDemo && <p className="mb-2 text-[11px] text-amber-800">Demo shop: results you record are marked as demo and never count as real.</p>}
              <OutcomeForm recommendationId={rec.id} demo={outcomesSimulated} customers={version.audience.map((a) => ({ id: a.customer.id, name: a.customer.displayName }))} />
            </div>
          )}
        </Panel>
      )}

      {/* Everything else stays available, one tap away. */}
      <details className="group rounded-xl border border-[#E2E4E9] bg-white">
        <summary className="cursor-pointer list-none px-4 py-3 text-xs font-semibold text-[#4338CA] hover:bg-[#F8F9FB]">
          <span className="group-open:hidden">See all details (numbers used, terms, every customer, history)</span>
          <span className="hidden group-open:inline">Hide details</span>
        </summary>
        <div className="space-y-5 border-t border-[#F0F2F5] p-4">
          {Array.isArray(changes) && changes.length > 0 && (
            <Panel title="What changed from the earlier version">
              <ul className="list-disc space-y-1 pl-5 text-xs text-[#525866]">{changes.map((c, i) => <li key={i}>{String(c)}</li>)}</ul>
            </Panel>
          )}

          <Panel title="Numbers this is based on" subtitle="Taken directly from your sales and udhaar records">
            <JsonFacts data={version.evidence} hide={["messageSource", "highlights", "tip"]} />
          </Panel>

          {Object.keys(terms).filter((k) => k !== "changesFromPrevious").length > 0 && (
            <Panel title="Full offer terms">
              <JsonFacts data={version.offerTerms} hide={["changesFromPrevious", "summary", "items", "limits", "timeWindow"]} />
            </Panel>
          )}

          {terms.kind === "COUPON" && (
            <Panel title="Coupon codes" subtitle={terms.codeMode === "SHARED" ? "One code for everyone" : "A different code for each customer"}>
              {version.couponCodes.length === 0 ? (
                <p className="text-xs text-[#737B8C]">Codes are created only when you approve.</p>
              ) : sharedCode ? (
                <p className="text-xs">Code: <span className="rounded bg-slate-100 px-2 py-0.5 font-mono font-semibold">{sharedCode}</span></p>
              ) : (
                <p className="text-xs">{version.couponCodes.length} codes created, shown next to each customer below.</p>
              )}
            </Panel>
          )}

          <Panel title={`Every customer (${version.audience.length})`}>
            <ul className="divide-y divide-[#F0F2F5] text-xs">
              {version.audience.map((a) => (
                <li key={a.customer.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span className="flex items-center gap-2">
                    <span className="font-semibold text-[#171A23]">{a.customer.displayName}</span>
                    {codeFor.get(a.customer.id) && <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px]">{codeFor.get(a.customer.id)}</span>}
                  </span>
                  <span className="text-[#737B8C]">
                    {a.customer.isSynthetic ? "Demo customer" : a.customer.optedOutAt ? "Said no to messages" : "Agreed to messages"}
                    {a.lastPurchaseAt && <> &middot; Last bought {formatLocalDate(a.lastPurchaseAt.toISOString().slice(0, 10))}</>}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="History" subtitle="Every step is saved and cannot be edited">
            <ol className="space-y-2.5 text-xs">
              {events.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F0F2F5] pb-2">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-[#4338CA]" />
                    <span className="font-semibold text-[#171A23]">{EVENT_LABEL[e.eventType] ?? e.eventType}</span>
                    {e.actor && <span className="text-[#737B8C]">by {e.actor.name}</span>}
                  </span>
                  <span className="font-mono text-[11px] text-[#737B8C]">{formatDateTimeIST(e.createdAt)}</span>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </details>
    </div>
  );
}
