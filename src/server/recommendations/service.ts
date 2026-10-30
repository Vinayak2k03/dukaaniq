import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { DeclineReason, RecommendationStatus, RecommendationType } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { referenceDateFor } from "@/server/analytics/range";
import { buildTipAlternative } from "@/server/tips/alternative";
import type { Draft } from "./draft";
import { TYPE_LABEL } from "./labels";
import { detectReminders } from "./reminders";
import { OPEN_STATUSES, canTransition } from "./state";
import { renderForCustomer } from "./text";

/**
 * Approval workflow (PRD 7). Every write runs in one transaction with the recommendation row locked,
 * checks the state machine, and writes audit events. Callers pass a merchant taken from the user's
 * verified membership; role checks (OWNER) are done by the caller.
 */

type Merchant = { id: string; isDemo: boolean; shopName: string };
type Actor = { userId: string };
type Tx = Prisma.TransactionClient;
export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const TX = { timeout: 20_000 } as const;

async function advisoryLock(tx: Tx, key: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))::text`;
}

async function lockRecommendation(tx: Tx, merchantId: string, id: string) {
  const rows = await tx.$queryRaw<{ id: string; status: RecommendationStatus; currentVersion: number }[]>`
    SELECT "id", "status", "currentVersion" FROM recommendation WHERE "id" = ${id} AND "merchantId" = ${merchantId} FOR UPDATE`;
  return rows[0] ?? null;
}

async function persistDraft(tx: Tx, merchantId: string, actorId: string, draft: Draft, alternativeOfId?: string) {
  const rec = await tx.recommendation.create({
    data: {
      merchantId,
      type: draft.type,
      status: "PENDING_APPROVAL",
      currentVersion: 1,
      alternativeOfId: alternativeOfId ?? null,
      versions: {
        create: {
          version: 1,
          title: draft.title,
          explanation: draft.explanation,
          evidence: draft.evidence,
          offerTerms: draft.offerTerms,
          economics: draft.economics,
          message: draft.message,
          language: draft.language,
          channel: draft.channel,
          audience: { create: draft.audience.map((a) => ({ customerId: a.customerId, lastPurchaseAt: a.lastPurchaseAt, daysSinceLastPurchase: a.daysSinceLastPurchase })) },
        },
      },
    },
    select: { id: true },
  });
  await tx.auditEvent.create({
    data: { merchantId, actorId, eventType: "RECOMMENDATION_CREATED", entityType: "recommendation", entityId: rec.id, entityVersion: 1, metadata: { type: draft.type, title: draft.title, audience: draft.audience.length } },
  });
  return rec.id;
}

const openFilter = { status: { in: OPEN_STATUSES } } as const;

/** Entry point for any recommendation generator: persists drafts as PENDING_APPROVAL proposals with audit events. */
export async function submitDrafts(merchant: Merchant, actor: Actor, drafts: Draft[]): Promise<string[]> {
  return db.$transaction(async (tx) => {
    const ids: string[] = [];
    for (const d of drafts) ids.push(await persistDraft(tx, merchant.id, actor.userId, d));
    return ids;
  }, TX);
}

export async function createReminderProposals(merchant: Merchant, actor: Actor): Promise<Result<{ created: number; skipped: number }>> {
  const drafts = await detectReminders(merchant, referenceDateFor(merchant));
  if (drafts.length === 0) return fail("No customer has credit that is overdue past the grace period.");
  return db.$transaction(async (tx): Promise<Result<{ created: number; skipped: number }>> => {
    await advisoryLock(tx, `${merchant.id}:CREDIT_REMINDER`);
    const open = await tx.recommendationAudience.findMany({
      where: { version: { recommendation: { merchantId: merchant.id, type: "CREDIT_REMINDER", ...openFilter } } },
      select: { customerId: true },
    });
    const busy = new Set(open.map((o) => o.customerId));
    const fresh = drafts.filter((d) => !busy.has(d.audience[0]?.customerId ?? ""));
    for (const d of fresh) await persistDraft(tx, merchant.id, actor.userId, d);
    if (fresh.length === 0) return fail("Every overdue customer already has an open reminder.");
    return { ok: true, created: fresh.length, skipped: drafts.length - fresh.length };
  }, TX);
}

export async function approveRecommendation(merchant: Merchant, actor: Actor, input: { recommendationId: string; version: number }): Promise<Result> {
  return db.$transaction(async (tx): Promise<Result> => {
    const rec = await lockRecommendation(tx, merchant.id, input.recommendationId);
    if (!rec) return fail("Recommendation not found.");
    if (!canTransition(rec.status, "APPROVED")) return fail("This recommendation is no longer waiting for approval.");
    if (rec.currentVersion !== input.version) return fail("This recommendation changed. Reload the page and review it again.");
    const version = await tx.recommendationVersion.findUnique({ where: { recommendationId_version: { recommendationId: rec.id, version: rec.currentVersion } }, select: { id: true } });
    if (!version) return fail("Recommendation version not found.");
    await tx.approvalDecision.create({ data: { merchantId: merchant.id, recommendationId: rec.id, versionId: version.id, decision: "APPROVED", actorId: actor.userId } });
    await tx.recommendation.update({ where: { id: rec.id }, data: { status: "APPROVED" } });
    await tx.auditEvent.create({ data: { merchantId: merchant.id, actorId: actor.userId, eventType: "APPROVED", entityType: "recommendation", entityId: rec.id, entityVersion: rec.currentVersion } });
    return { ok: true };
  }, TX);
}

export async function rejectRecommendation(merchant: Merchant, actor: Actor, input: { recommendationId: string; version: number; reason: DeclineReason; note?: string }): Promise<Result> {
  if (input.reason === "OTHER" && !input.note) return fail("Please explain the reason.");
  return db.$transaction(async (tx): Promise<Result> => {
    const rec = await lockRecommendation(tx, merchant.id, input.recommendationId);
    if (!rec) return fail("Recommendation not found.");
    if (!canTransition(rec.status, "REJECTED")) return fail("This recommendation is no longer waiting for approval.");
    if (rec.currentVersion !== input.version) return fail("This recommendation changed. Reload the page and review it again.");
    const version = await tx.recommendationVersion.findUnique({ where: { recommendationId_version: { recommendationId: rec.id, version: rec.currentVersion } }, select: { id: true } });
    if (!version) return fail("Recommendation version not found.");
    await tx.approvalDecision.create({ data: { merchantId: merchant.id, recommendationId: rec.id, versionId: version.id, decision: "REJECTED", declineReason: input.reason, note: input.note ?? null, actorId: actor.userId } });
    await tx.recommendation.update({ where: { id: rec.id }, data: { status: "REJECTED" } });
    await tx.auditEvent.createMany({
      data: [
        { merchantId: merchant.id, actorId: actor.userId, eventType: "REJECTED", entityType: "recommendation", entityId: rec.id, entityVersion: rec.currentVersion },
        { merchantId: merchant.id, actorId: actor.userId, eventType: "FEEDBACK_SUBMITTED", entityType: "recommendation", entityId: rec.id, entityVersion: rec.currentVersion, metadata: { reason: input.reason, note: input.note ?? null } },
      ],
    });
    return { ok: true };
  }, TX);
}

/**
 * Builds a revised proposal from a rejected one. The revision is a NEW recommendation that needs its own approval.
 * Credit reminders get a softer tone; growth tips (loyalty, festive, off-peak, bundle, win-back, ...) are rebuilt
 * from fresh data with the decline reason applied (lower discount, other audience, later timing, ...).
 */
export async function createAlternative(merchant: Merchant, actor: Actor, recommendationId: string): Promise<Result<{ id: string }>> {
  const original = await db.recommendation.findFirst({
    where: { id: recommendationId, merchantId: merchant.id },
    select: {
      id: true, type: true, status: true, alternatives: { select: { id: true }, take: 1 },
      versions: { orderBy: { version: "desc" }, take: 1, select: { evidence: true, offerTerms: true, approval: { select: { declineReason: true, note: true } }, audience: { select: { customerId: true } } } },
    },
  });
  if (!original) return fail("Recommendation not found.");
  if (original.status !== "REJECTED") return fail("An alternative can only be requested after a rejection.");
  if (original.alternatives.length > 0) return fail("An alternative was already created for this recommendation.");
  const version = original.versions[0];
  const ref = referenceDateFor(merchant);

  let created: Draft;
  if (original.type === "CREDIT_REMINDER") {
    const customerId = version?.audience[0]?.customerId;
    const draft = (await detectReminders(merchant, ref, "softer", ["Message tone made softer."])).find((d) => d.audience[0]?.customerId === customerId) ?? null;
    if (!draft) return fail("This customer no longer has overdue credit.");
    created = draft;
  } else {
    if (!version) return fail("Recommendation version not found.");
    const r = await buildTipAlternative(merchant, {
      id: original.id,
      evidence: version.evidence,
      offerTerms: version.offerTerms,
      audienceSize: version.audience.length,
      declineReason: version.approval?.declineReason ?? null,
      note: version.approval?.note ?? null,
    });
    if (!r.ok) return fail(r.error);
    created = r.draft;
  }

  return db.$transaction(async (tx): Promise<Result<{ id: string }>> => {
    const rec = await lockRecommendation(tx, merchant.id, original.id);
    if (!rec || rec.status !== "REJECTED") return fail("This recommendation changed. Reload and try again.");
    if (await tx.recommendation.findFirst({ where: { alternativeOfId: rec.id }, select: { id: true } })) return fail("An alternative was already created for this recommendation.");
    const id = await persistDraft(tx, merchant.id, actor.userId, created, rec.id);
    await tx.auditEvent.create({ data: { merchantId: merchant.id, actorId: actor.userId, eventType: "ALTERNATIVE_CREATED", entityType: "recommendation", entityId: rec.id, entityVersion: rec.currentVersion, metadata: { alternativeId: id } } });
    return { ok: true, id };
  }, TX);
}

/** Demo execution: records what WOULD be sent. Nothing leaves the system. Only an APPROVED version can run, once. */
export async function executeSimulated(merchant: Merchant, actor: Actor, recommendationId: string): Promise<Result<{ messages: number; duplicate: boolean }>> {
  return db.$transaction(async (tx): Promise<Result<{ messages: number; duplicate: boolean }>> => {
    const rec = await lockRecommendation(tx, merchant.id, recommendationId);
    if (!rec) return fail("Recommendation not found.");
    const version = await tx.recommendationVersion.findUnique({
      where: { recommendationId_version: { recommendationId: rec.id, version: rec.currentVersion } },
      select: { id: true, title: true, message: true, channel: true, recommendation: { select: { type: true } }, audience: { select: { customerId: true, customer: { select: { displayName: true } } } } },
    });
    if (!version) return fail("Recommendation version not found.");

    const existing = await tx.actionLog.findUnique({ where: { merchantId_idempotencyKey: { merchantId: merchant.id, idempotencyKey: `exec:${version.id}` } }, select: { id: true } });
    if (existing) return { ok: true, messages: version.audience.length, duplicate: true };
    if (!canTransition(rec.status, "EXECUTION_PENDING")) return fail("Only an approved recommendation can run.");

    await tx.recommendation.update({ where: { id: rec.id }, data: { status: "EXECUTION_PENDING" } });
    const action = await tx.actionLog.create({
      data: { merchantId: merchant.id, recommendationVersionId: version.id, actionType: "SIMULATED_SEND", channel: version.channel, status: "SIMULATED", simulated: true, idempotencyKey: `exec:${version.id}`, actorId: actor.userId },
      select: { id: true },
    });
    await tx.outboundMessage.createMany({
      data: version.audience.map((a) => ({
        merchantId: merchant.id,
        actionLogId: action.id,
        customerId: a.customerId,
        channel: version.channel,
        copy: renderForCustomer(version.message, a.customer.displayName),
        status: "SIMULATED" as const,
        simulated: true,
        idempotencyKey: `exec:${version.id}:${a.customerId}`,
      })),
      skipDuplicates: true,
    });
    await tx.recommendation.update({ where: { id: rec.id }, data: { status: "SIMULATED" } });
    const type = version.recommendation.type;
    await tx.notification.create({
      data: {
        merchantId: merchant.id,
        type: "OUTCOME_UPDATE",
        title: type === "FESTIVE" ? "Festive campaign queued (simulated)" : `${TYPE_LABEL[type] ?? "Recommendation"} recorded (simulated)`,
        body: `"${version.title}" was recorded as a simulated action for ${version.audience.length} customer${version.audience.length === 1 ? "" : "s"}. No real message was sent.`,
        entityType: "recommendation",
        entityId: rec.id,
      },
    });
    await tx.auditEvent.createMany({
      data: [
        { merchantId: merchant.id, actorId: actor.userId, eventType: "EXECUTION_REQUESTED", entityType: "recommendation", entityId: rec.id, entityVersion: rec.currentVersion },
        { merchantId: merchant.id, actorId: actor.userId, eventType: "SIMULATED_ACTION_RECORDED", entityType: "recommendation", entityId: rec.id, entityVersion: rec.currentVersion, metadata: { actionLogId: action.id, messages: version.audience.length, simulated: true } },
      ],
    });
    return { ok: true, messages: version.audience.length, duplicate: false };
  }, TX);
}

export type RecommendationListItem = {
  id: string;
  type: RecommendationType;
  status: RecommendationStatus;
  title: string;
  audienceSize: number;
  createdAt: Date;
  isAlternative: boolean;
};

export async function listRecommendations(merchantId: string, type?: RecommendationType): Promise<RecommendationListItem[]> {
  const rows = await db.recommendation.findMany({
    where: { merchantId, ...(type ? { type } : {}) },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, type: true, status: true, createdAt: true, alternativeOfId: true, versions: { orderBy: { version: "desc" }, take: 1, select: { title: true, _count: { select: { audience: true } } } } },
  });
  return rows.map((r) => ({ id: r.id, type: r.type, status: r.status, title: r.versions[0]?.title ?? "Recommendation", audienceSize: r.versions[0]?._count.audience ?? 0, createdAt: r.createdAt, isAlternative: r.alternativeOfId !== null }));
}

export async function getRecommendationDetail(merchantId: string, id: string) {
  const rec = await db.recommendation.findFirst({
    where: { id, merchantId },
    select: {
      id: true, type: true, status: true, currentVersion: true, createdAt: true, alternativeOfId: true,
      alternatives: { select: { id: true }, take: 1 },
      versions: {
        orderBy: { version: "desc" },
        take: 1,
        select: {
          id: true, version: true, title: true, explanation: true, evidence: true, offerTerms: true, economics: true, message: true, language: true, channel: true,
          approval: { select: { decision: true, declineReason: true, note: true, decidedAt: true, actor: { select: { name: true } } } },
          audience: { select: { daysSinceLastPurchase: true, lastPurchaseAt: true, customer: { select: { id: true, displayName: true, isSynthetic: true, optedInAt: true, optedOutAt: true } } }, orderBy: { customer: { displayName: "asc" } } },
          actionLogs: { select: { id: true, status: true, simulated: true, createdAt: true, _count: { select: { outboundMessages: true } } }, orderBy: { createdAt: "desc" } },
        },
      },
    },
  });
  if (!rec || !rec.versions[0]) return null;
  const events = await db.auditEvent.findMany({ where: { merchantId, entityType: "recommendation", entityId: id }, orderBy: { createdAt: "asc" }, select: { id: true, eventType: true, createdAt: true, metadata: true, actor: { select: { name: true } } } });
  return { rec, version: rec.versions[0], events };
}
