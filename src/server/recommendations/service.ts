import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { DeclineReason, RecommendationStatus, RecommendationType } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { referenceDateFor } from "@/server/analytics/range";
import { buildTipAlternative } from "@/server/tips/alternative";
import type { Draft } from "./draft";
import { TYPE_LABEL } from "./labels";
import { detectReminders } from "./reminders";
import { freshCodes, type CodeMode } from "./coupons";
import { OPEN_STATUSES, canTransition } from "./state";
import { renderForCustomer } from "./text";
import { normalizePhone } from "@/lib/whatsapp";
import { createNotification } from "@/server/notifications/service";

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

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Merchant alert for a failed run. Written after the transaction so it survives; never throws into the caller. */
async function notifyExecutionFailed(merchantId: string, recommendationId: string, error: string) {
  if (error === "Recommendation not found.") return; // unknown id: nothing to link to
  await createNotification(db, merchantId, {
    type: "EXECUTION_FAILED",
    title: "Action could not run",
    body: error,
    entityType: "recommendation",
    entityId: recommendationId,
  }).catch(() => undefined);
}

async function advisoryLock(tx: Tx, key: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))::text`;
}

async function lockRecommendation(tx: Tx, merchantId: string, id: string) {
  const rows = await tx.$queryRaw<{ id: string; status: RecommendationStatus; currentVersion: number }[]>`
    SELECT "id", "status", "currentVersion" FROM recommendation WHERE "id" = ${id} AND "merchantId" = ${merchantId} FOR UPDATE`;
  return rows[0] ?? null;
}

/**
 * Creates the coupon code(s) for an approved coupon version, inside the approval transaction. Unique per customer
 * (loyalty, win-back) or one shared code (festive, low hours). Returns how many codes were created.
 */
async function issueCouponCodes(tx: Tx, merchantId: string, versionId: string): Promise<number> {
  const v = await tx.recommendationVersion.findUnique({ where: { id: versionId }, select: { offerTerms: true, audience: { select: { customerId: true } } } });
  const terms = (v?.offerTerms ?? {}) as { kind?: string; codeMode?: CodeMode; codePrefix?: string };
  if (!v || terms.kind !== "COUPON" || !terms.codePrefix || !terms.codeMode) return 0;
  const owners = terms.codeMode === "SHARED" ? [null] : v.audience.map((a) => a.customerId);
  if (owners.length === 0) return 0;
  const taken = new Set((await tx.couponCode.findMany({ where: { merchantId, code: { startsWith: `${terms.codePrefix}-` } }, select: { code: true } })).map((c) => c.code));
  const codes = freshCodes(terms.codePrefix, terms.codeMode, owners.length, taken);
  await tx.couponCode.createMany({ data: owners.map((customerId, i) => ({ merchantId, recommendationVersionId: versionId, customerId, code: codes[i] })) });
  return codes.length;
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

/** One in-app alert per overdue reminder, opening its approval page (PRD 9.1 overdue credit summaries). */
const notifyReminder = (tx: Prisma.TransactionClient, merchantId: string, id: string, title: string) =>
  createNotification(tx, merchantId, {
    type: "OVERDUE_CREDIT",
    title: "Overdue Udhaar Reminder Ready",
    body: `"${title}" is ready. Open it to review and approve before anything is sent.`,
    entityType: "recommendation",
    entityId: id,
  });

/** Entry point for any recommendation generator: persists drafts as PENDING_APPROVAL proposals with audit events. */
export async function submitDrafts(merchant: Merchant, actor: Actor, drafts: Draft[]): Promise<string[]> {
  return db.$transaction(async (tx) => {
    const ids: string[] = [];
    for (const d of drafts) ids.push(await persistDraft(tx, merchant.id, actor.userId, d));
    // Overdue reminders live in the notification centre, not the Action Centre list: one alert each, linked to its approval page.
    for (const [i, d] of drafts.entries()) if (d.type === "CREDIT_REMINDER") await notifyReminder(tx, merchant.id, ids[i], d.title);
    const growth = drafts.flatMap((d, i) => (d.type === "CREDIT_REMINDER" ? [] : [{ d, id: ids[i] }]));
    if (growth.length > 0) {
      const kinds = [...new Set(growth.map(({ d }) => TYPE_LABEL[d.type] ?? d.type))].join(", ");
      await createNotification(tx, merchant.id, {
        type: "APPROVAL_PENDING",
        title: "New Growth Proposals Waiting for Review",
        body: `DukaanIQ drafted ${plural(growth.length, "recommendation")} (${kinds}). Review and sign off in Action Centre.`,
        entityType: "recommendation",
        entityId: growth.length === 1 ? growth[0].id : undefined,
      });
    }
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
    if (fresh.length === 0) return fail("Every overdue customer already has an open reminder.");
    for (const d of fresh) await notifyReminder(tx, merchant.id, await persistDraft(tx, merchant.id, actor.userId, d), d.title);
    return { ok: true, created: fresh.length, skipped: drafts.length - fresh.length };
  }, TX);
}

/**
 * Reminder proposal for ONE overdue customer (voice "Rahul ko reminder bhejo"). Creates a PENDING_APPROVAL
 * proposal only; nothing is sent until the owner approves it. Reuses an open reminder for that customer.
 */
export async function createReminderForCustomer(merchant: Merchant, actor: Actor, customerId: string): Promise<Result<{ id: string; duplicate: boolean }>> {
  const drafts = await detectReminders(merchant, referenceDateFor(merchant));
  const draft = drafts.find((d) => d.audience[0]?.customerId === customerId);
  if (!draft) return fail("This customer has no credit overdue past the grace period.");
  return db.$transaction(async (tx): Promise<Result<{ id: string; duplicate: boolean }>> => {
    await advisoryLock(tx, `${merchant.id}:CREDIT_REMINDER`);
    const open = await tx.recommendation.findFirst({
      where: { merchantId: merchant.id, type: "CREDIT_REMINDER", ...openFilter, versions: { some: { audience: { some: { customerId } } } } },
      select: { id: true },
    });
    if (open) return { ok: true, id: open.id, duplicate: true };
    const id = await persistDraft(tx, merchant.id, actor.userId, draft);
    await notifyReminder(tx, merchant.id, id, draft.title);
    return { ok: true, id, duplicate: false };
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
    // Codes exist only from this point: never for a pending, rejected or alternative-in-review version.
    const couponCodes = await issueCouponCodes(tx, merchant.id, version.id);
    await tx.auditEvent.create({ data: { merchantId: merchant.id, actorId: actor.userId, eventType: "APPROVED", entityType: "recommendation", entityId: rec.id, entityVersion: rec.currentVersion, metadata: { couponCodes } } });
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
  const result = await db.$transaction(async (tx): Promise<Result<{ messages: number; duplicate: boolean }>> => {
    const rec = await lockRecommendation(tx, merchant.id, recommendationId);
    if (!rec) return fail("Recommendation not found.");
    const version = await tx.recommendationVersion.findUnique({
      where: { recommendationId_version: { recommendationId: rec.id, version: rec.currentVersion } },
      select: { id: true, title: true, message: true, channel: true, recommendation: { select: { type: true } }, audience: { select: { customerId: true, customer: { select: { displayName: true } } } }, couponCodes: { select: { customerId: true, code: true } } },
    });
    if (!version) return fail("Recommendation version not found.");
    const shared = version.couponCodes.find((c) => c.customerId === null)?.code;
    const codeFor = new Map(version.couponCodes.flatMap((c) => (c.customerId ? [[c.customerId, c.code] as const] : [])));
    const needsCode = version.message.includes("{code}");
    if (needsCode && !shared && version.audience.some((a) => !codeFor.has(a.customerId))) return fail("Coupon codes for this version are missing. Approve it again.");

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
        copy: renderForCustomer(version.message, a.customer.displayName, needsCode ? (codeFor.get(a.customerId) ?? shared) : undefined),
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
  if (!result.ok) await notifyExecutionFailed(merchant.id, recommendationId, result.error);
  return result;
}

/**
 * Free WhatsApp path: the owner taps a wa.me link and sends from their own WhatsApp. We can only know the link was
 * opened, so each message is recorded as SENT (opened), never DELIVERED. Idempotent per customer.
 */
export async function recordWhatsAppOpened(merchant: Merchant, actor: Actor, recommendationId: string, customerId: string): Promise<Result<{ duplicate: boolean }>> {
  if (merchant.isDemo) return fail("Demo stores cannot send real messages.");
  const result = await db.$transaction(async (tx): Promise<Result<{ duplicate: boolean }>> => {
    const rec = await lockRecommendation(tx, merchant.id, recommendationId);
    if (!rec) return fail("Recommendation not found.");
    const version = await tx.recommendationVersion.findUnique({
      where: { recommendationId_version: { recommendationId: rec.id, version: rec.currentVersion } },
      select: { id: true, title: true, message: true, channel: true, audience: { select: { customerId: true, customer: { select: { displayName: true, phone: true, isSynthetic: true, optedInAt: true, optedOutAt: true } } } } },
    });
    if (!version) return fail("Recommendation version not found.");
    if (version.channel !== "WHATSAPP_MANUAL_LINK") return fail("This recommendation is not sent through a WhatsApp link.");
    const target = version.audience.find((a) => a.customerId === customerId);
    if (!target) return fail("This customer is not part of the recommendation.");
    const c = target.customer;
    if (c.isSynthetic) return fail("Demo customers cannot receive real messages.");
    if (!c.optedInAt || c.optedOutAt) return fail("This customer has not agreed to receive messages.");
    if (!normalizePhone(c.phone)) return fail("This customer has no valid phone number.");

    const messageKey = `exec:${version.id}:${customerId}`;
    if (await tx.outboundMessage.findUnique({ where: { merchantId_idempotencyKey: { merchantId: merchant.id, idempotencyKey: messageKey } }, select: { id: true } })) return { ok: true, duplicate: true };

    let action = await tx.actionLog.findUnique({ where: { merchantId_idempotencyKey: { merchantId: merchant.id, idempotencyKey: `exec:${version.id}` } }, select: { id: true } });
    if (!action) {
      if (!canTransition(rec.status, "EXECUTION_PENDING")) return fail("Only an approved recommendation can be sent.");
      await tx.recommendation.update({ where: { id: rec.id }, data: { status: "EXECUTION_PENDING" } });
      action = await tx.actionLog.create({
        data: { merchantId: merchant.id, recommendationVersionId: version.id, actionType: "WHATSAPP_LINK_OPENED", channel: "WHATSAPP_MANUAL_LINK", status: "PENDING", simulated: false, idempotencyKey: `exec:${version.id}`, actorId: actor.userId },
        select: { id: true },
      });
      await tx.auditEvent.create({ data: { merchantId: merchant.id, actorId: actor.userId, eventType: "EXECUTION_REQUESTED", entityType: "recommendation", entityId: rec.id, entityVersion: rec.currentVersion } });
    } else if (rec.status !== "EXECUTION_PENDING") return fail("This recommendation has already been completed.");

    await tx.outboundMessage.create({
      data: { merchantId: merchant.id, actionLogId: action.id, customerId, channel: "WHATSAPP_MANUAL_LINK", copy: renderForCustomer(version.message, c.displayName), status: "SENT", simulated: false, idempotencyKey: messageKey },
    });
    await tx.auditEvent.create({ data: { merchantId: merchant.id, actorId: actor.userId, eventType: "PROVIDER_RESPONSE", entityType: "recommendation", entityId: rec.id, entityVersion: rec.currentVersion, metadata: { customerId, channel: "WHATSAPP_MANUAL_LINK", note: "WhatsApp link opened by owner; delivery is not tracked." } } });

    await createNotification(tx, merchant.id, {
      type: "OUTCOME_UPDATE",
      title: "WhatsApp Campaign Message Opened",
      body: `WhatsApp link was opened for ${c.displayName} with offer "${version.title}".`,
      entityType: "recommendation",
      entityId: rec.id,
    });

    const done = await tx.outboundMessage.count({ where: { actionLogId: action.id } });
    if (done >= version.audience.length) {
      await tx.actionLog.update({ where: { id: action.id }, data: { status: "SENT" } });
      await tx.recommendation.update({ where: { id: rec.id }, data: { status: "SENT" } });
    }
    return { ok: true, duplicate: false };
  }, TX);
  if (!result.ok) await notifyExecutionFailed(merchant.id, recommendationId, result.error);
  return result;
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
          audience: { select: { daysSinceLastPurchase: true, lastPurchaseAt: true, customer: { select: { id: true, displayName: true, phone: true, isSynthetic: true, optedInAt: true, optedOutAt: true } } }, orderBy: { customer: { displayName: "asc" } } },
          couponCodes: { select: { customerId: true, code: true } },
          actionLogs: { select: { id: true, status: true, simulated: true, createdAt: true, outboundMessages: { select: { customerId: true } }, _count: { select: { outboundMessages: true } } }, orderBy: { createdAt: "desc" } },
        },
      },
    },
  });
  if (!rec || !rec.versions[0]) return null;
  const events = await db.auditEvent.findMany({ where: { merchantId, entityType: "recommendation", entityId: id }, orderBy: { createdAt: "asc" }, select: { id: true, eventType: true, createdAt: true, metadata: true, actor: { select: { name: true } } } });
  return { rec, version: rec.versions[0], events };
}

const EXECUTED_STATUSES: RecommendationStatus[] = ["SIMULATED", "SENT", "DELIVERED", "READ"];
export type RecordableOutcome = "OFFER_REDEEMED" | "CUSTOMER_RETURNED";

/**
 * Records a verified result (coupon redeemed, customer came back) for one customer of an executed recommendation.
 * Demo stores and simulated runs are always stored as simulated outcomes. One outcome per customer and type per version.
 */
export async function recordOutcome(
  merchant: Merchant,
  actor: Actor,
  input: { recommendationId: string; customerId: string; type: RecordableOutcome; amountPaise: number },
): Promise<Result<{ duplicate: boolean }>> {
  if (!Number.isInteger(input.amountPaise) || input.amountPaise < 0 || input.amountPaise > 10_000_000_00) return fail("Enter a valid purchase amount.");
  return db.$transaction(async (tx): Promise<Result<{ duplicate: boolean }>> => {
    const rec = await lockRecommendation(tx, merchant.id, input.recommendationId);
    if (!rec) return fail("Recommendation not found.");
    if (!EXECUTED_STATUSES.includes(rec.status)) return fail("Outcomes can be recorded only after the action has run.");
    const version = await tx.recommendationVersion.findUnique({
      where: { recommendationId_version: { recommendationId: rec.id, version: rec.currentVersion } },
      select: {
        id: true, title: true,
        audience: { where: { customerId: input.customerId }, select: { customer: { select: { displayName: true } } } },
        actionLogs: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, simulated: true } },
      },
    });
    if (!version) return fail("Recommendation version not found.");
    const target = version.audience[0];
    if (!target) return fail("This customer is not part of the recommendation.");
    const existing = await tx.outcomeEvent.findFirst({ where: { merchantId: merchant.id, recommendationVersionId: version.id, customerId: input.customerId, type: input.type }, select: { id: true } });
    if (existing) return { ok: true, duplicate: true };

    const run = version.actionLogs[0];
    const isSimulated = merchant.isDemo || (run?.simulated ?? true);
    const outcome = await tx.outcomeEvent.create({
      data: {
        merchantId: merchant.id,
        type: input.type,
        recommendationVersionId: version.id,
        actionLogId: run?.id ?? null,
        customerId: input.customerId,
        amount: (input.amountPaise / 100).toFixed(2),
        isSimulated,
        occurredAt: new Date(),
        metadata: { recordedBy: actor.userId, source: "owner_verified" },
      },
      select: { id: true },
    });
    await tx.auditEvent.create({
      data: { merchantId: merchant.id, actorId: actor.userId, eventType: "OUTCOME_RECORDED", entityType: "recommendation", entityId: rec.id, entityVersion: rec.currentVersion, metadata: { outcomeId: outcome.id, type: input.type, customerId: input.customerId, amountPaise: input.amountPaise, simulated: isSimulated } },
    });
    const what = input.type === "OFFER_REDEEMED" ? "redeemed the offer" : "came back to buy";
    await createNotification(tx, merchant.id, {
      type: "OUTCOME_UPDATE",
      title: isSimulated ? "Demo outcome recorded" : "Verified outcome recorded",
      body: `${target.customer.displayName} ${what} from "${version.title}"${input.amountPaise > 0 ? ` (₹${(input.amountPaise / 100).toFixed(2)})` : ""}.`,
      entityType: "recommendation",
      entityId: rec.id,
    });
    return { ok: true, duplicate: false };
  }, TX);
}

/** Outcomes recorded against a version, in paise, for the measured-vs-estimate panel. */
export async function listOutcomes(merchantId: string, versionId: string) {
  const rows = await db.outcomeEvent.findMany({
    where: { merchantId, recommendationVersionId: versionId },
    orderBy: { occurredAt: "desc" },
    select: { id: true, type: true, customerId: true, amount: true, isSimulated: true, occurredAt: true, customer: { select: { displayName: true } } },
  });
  return rows.map((r) => ({ ...r, amountPaise: r.amount ? Math.round(Number(r.amount) * 100) : 0 }));
}
