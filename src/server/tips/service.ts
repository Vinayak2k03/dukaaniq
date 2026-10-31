import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { DeclineReason } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { referenceDateFor } from "@/server/analytics/range";
import { composeBatch } from "@/server/recommendations/compose";
import { createApprovedRecommendation, submitDrafts } from "@/server/recommendations/service";
import { OPEN_STATUSES } from "@/server/recommendations/state";
import { buildContext } from "./context";
import { draftFor, factsFor, offerLines } from "./facts";
import { buildCustomOffer, type CustomOfferInput } from "./custom-offer";
import { applySignal, parseFeedback } from "./feedback";
import { applyFreeText } from "./notes";
import { generateCandidates, selectBatch } from "./rank";
import { parseStaged, stage, type StagedTip } from "./staged";
import { emptyFeedback, type Candidate, type TipContext, type TipFamily, type TipFeedback } from "./types";

/**
 * Batched growth tips (credit-saving flow):
 *   first request  → all queries once, all candidates ranked deterministically (0 LLM calls), snapshot stored;
 *   every batch    → top `count` unseen tips, ONE wording call for the whole batch, drafts STAGED on the session;
 *                    a tip becomes a recommendation only when the owner approves it (approveTip). Unapproved tips
 *                    never reach the Action Centre; a rejection is only a note on the session (rejectTip).
 *   "more tips"    → feedback applied to the snapshot (no queries), next batch, again one wording call.
 * LLM calls are counted per session and capped by SARVAM_MAX_CALLS_PER_SESSION; beyond it templates are used silently.
 */

type Merchant = { id: string; isDemo: boolean; shopName: string };
type Actor = { userId: string };
type Fail = { ok: false; error: string; status: number };

export type FeedbackInput = { recommendationId?: string; /** A tip key from this session (tips that are not recommendations yet). */ tipKey?: string; reason?: DeclineReason; note?: string };
export type TipsRequest = { sessionId?: string; count: number; focus?: TipFamily[]; feedback?: FeedbackInput };

export type TipCard = {
  key: string;
  family: TipFamily;
  title: string;
  why: string;
  highlights: string[];
  offerLines: string[];
  audienceSize: number;
  notOptedIn: number;
  demoCustomers: number;
  economics: EconomicsSummary;
  message: string;
  messageSource: "sarvam" | "template";
  language: string;
  changes: string[];
};

export type EconomicsSummary =
  | { kind: "scenario"; label: string; grossProfitLowPaise: number; grossProfitHighPaise: number; salesLowPaise: number; salesHighPaise: number; maxDiscountExposurePaise: number; assumptions: string[] }
  | { kind: "exposure"; label: string; maxExposurePaise: number; assumptions: string[] }
  | { kind: "note"; note: string };

export type TipsResponse = { ok: true; sessionId: string; batch: TipCard[]; remaining: number; llmCalls: number; feedbackNotes: string[] };

const fail = (error: string, status = 422): Fail => ({ ok: false, error, status });
const asJson = (v: unknown) => v as Prisma.InputJsonValue;

export function summarizeEconomics(e: Record<string, unknown>): EconomicsSummary {
  const scenarios = e.scenarios as { grossProfitImpactPaise: number; incrementalSalesPaise: number }[] | undefined;
  const assumptions = Array.isArray(e.assumptions) ? (e.assumptions as string[]) : [];
  if (scenarios?.length) {
    const gp = scenarios.map((s) => s.grossProfitImpactPaise);
    const sales = scenarios.map((s) => s.incrementalSalesPaise);
    return { kind: "scenario", label: String(e.label ?? "Scenario estimate"), grossProfitLowPaise: Math.min(...gp), grossProfitHighPaise: Math.max(...gp), salesLowPaise: Math.min(...sales), salesHighPaise: Math.max(...sales), maxDiscountExposurePaise: Number(e.maxDiscountExposurePaise ?? 0), assumptions };
  }
  if (typeof e.maxExposurePaise === "number") return { kind: "exposure", label: String(e.label ?? "Risk exposure"), maxExposurePaise: e.maxExposurePaise, assumptions };
  return { kind: "note", note: String(e.note ?? "No estimate for this tip.") };
}

/** Tip keys that already have an open recommendation, so the same idea is not proposed twice. */
export async function openTipKeys(merchantId: string): Promise<string[]> {
  const rows = await db.recommendation.findMany({
    where: { merchantId, status: { in: OPEN_STATUSES } },
    select: { type: true, versions: { orderBy: { version: "desc" }, take: 1, select: { evidence: true, audience: { select: { customerId: true }, take: 1 } } } },
  });
  return rows.flatMap((r) => {
    const v = r.versions[0];
    const key = (v?.evidence as { tip?: { key?: string } } | null)?.tip?.key;
    if (key) return [key];
    return r.type === "CREDIT_REMINDER" && v?.audience[0] ? [`CREDIT_REMINDER:${v.audience[0].customerId}`] : [];
  });
}

async function loadSession(merchantId: string, id: string) {
  return db.tipSession.findFirst({ where: { id, merchantId } });
}

/** Applies one feedback input (structured reason and/or free-text note) to the session's feedback. */
async function withFeedback(merchantId: string, fb: TipFeedback, input: FeedbackInput, ctx: TipContext, snapshot: Candidate[], llmBudget: number) {
  let next = fb;
  let llmCalls = 0;
  let target: Candidate | undefined;
  if (input.tipKey) target = snapshot.find((c) => c.key === input.tipKey);
  else if (input.recommendationId) {
    const rec = await db.recommendation.findFirst({ where: { id: input.recommendationId, merchantId }, select: { versions: { orderBy: { version: "desc" }, take: 1, select: { evidence: true } } } });
    const key = (rec?.versions[0]?.evidence as { tip?: { key?: string } } | null)?.tip?.key;
    target = snapshot.find((c) => c.key === key);
  }
  const feedbackId = input.recommendationId ?? input.tipKey;
  if (input.reason && !(feedbackId && next.appliedRejections.includes(feedbackId))) {
    next = applySignal(next, input.reason, target);
    if (feedbackId) next = { ...next, appliedRejections: [...next.appliedRejections, feedbackId] };
  }
  if (input.note) {
    const r = await applyFreeText(next, input.note, ctx, llmBudget > 0);
    next = r.feedback;
    llmCalls = r.llmCalls;
  }
  return { feedback: next, llmCalls };
}

/** Creates a session (first call) or returns the next batch for an existing one. */
export async function getTips(merchant: Merchant, _actor: Actor, req: TipsRequest): Promise<TipsResponse | Fail> {
  const ref = referenceDateFor(merchant);
  const cap = env.SARVAM_MAX_CALLS_PER_SESSION;
  let session = req.sessionId ? await loadSession(merchant.id, req.sessionId) : null;
  if (req.sessionId && !session) return fail("This tips session was not found. Start again.", 404);
  if (session && session.referenceDate !== ref) return fail("This tips session is from an earlier day. Start again for fresh numbers.", 409);

  if (!session) {
    const id = randomUUID();
    const ctx = await buildContext(merchant, ref, id);
    session = await db.tipSession.create({ data: { id, merchantId: merchant.id, referenceDate: ref, context: asJson(ctx), candidates: [], feedback: asJson(emptyFeedback()) } });
  }
  const ctx = session.context as unknown as TipContext;
  let feedback = parseFeedback(session.feedback);
  let noteCalls = 0;
  if (req.feedback && (req.feedback.reason || req.feedback.note)) {
    const r = await withFeedback(merchant.id, feedback, req.feedback, ctx, session.candidates as unknown as Candidate[], cap - session.llmCalls);
    feedback = r.feedback;
    noteCalls = r.llmCalls;
  }

  const ranked = generateCandidates(ctx, feedback);
  const open = [...(await openTipKeys(merchant.id)), ...(ctx.history?.recentKeys ?? []), ...(ctx.history?.rejectedKeys ?? [])];
  const sessionId = session.id;

  const claim = await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ shownKeys: string[]; llmCalls: number }[]>`SELECT "shownKeys", "llmCalls" FROM tip_session WHERE "id" = ${sessionId} AND "merchantId" = ${merchant.id} FOR UPDATE`;
    const row = rows[0];
    if (!row) return null;
    const { batch, remaining } = selectBatch(ranked, { count: req.count, focus: req.focus, shown: row.shownKeys, open });
    await tx.tipSession.update({
      where: { id: sessionId },
      data: { shownKeys: { push: batch.map((c) => c.key) }, feedback: asJson(feedback), candidates: asJson(ranked), llmCalls: { increment: noteCalls } },
    });
    return { batch, remaining, llmCalls: row.llmCalls + noteCalls };
  });
  if (!claim) return fail("This tips session was not found. Start again.", 404);
  if (claim.batch.length === 0) return { ok: true, sessionId, batch: [], remaining: 0, llmCalls: claim.llmCalls, feedbackNotes: feedback.notes };

  const facts = claim.batch.map((c) => factsFor(c, merchant.shopName));
  const { results, llmCalls } = await composeBatch(
    claim.batch.map((c, i) => ({ facts: facts[i], evidence: c.whyFacts, fallbackWhy: c.why })),
    claim.llmCalls < cap,
  );
  if (llmCalls) await db.tipSession.update({ where: { id: sessionId }, data: { llmCalls: { increment: llmCalls } } });
  const drafts = claim.batch.map((c, i) => draftFor(c, results[i], facts[i], { isDemo: merchant.isDemo, sessionId }));
  const staged = Object.fromEntries(claim.batch.map((c, i) => [c.key, stage(drafts[i])]));
  await db.$executeRaw`UPDATE tip_session SET "drafts" = "drafts" || ${JSON.stringify(staged)}::jsonb WHERE "id" = ${sessionId} AND "merchantId" = ${merchant.id}`;

  return {
    ok: true,
    sessionId,
    remaining: claim.remaining,
    llmCalls: claim.llmCalls + llmCalls,
    feedbackNotes: feedback.notes,
    batch: claim.batch.map((c, i) => ({
      key: c.key,
      family: c.family,
      title: c.title,
      why: results[i].why,
      highlights: c.whyFacts,
      offerLines: offerLines(c.offer),
      audienceSize: c.audience.length,
      notOptedIn: c.audience.filter((a) => !a.optedIn).length,
      demoCustomers: c.audience.filter((a) => a.synthetic).length,
      economics: summarizeEconomics(c.economics),
      message: results[i].message,
      messageSource: results[i].source,
      language: drafts[i].language,
      changes: c.changes,
    })),
  };
}

/** Records feedback without producing tips (POST /api/tips/feedback). */
export async function recordTipFeedback(merchant: Merchant, sessionId: string, input: FeedbackInput): Promise<{ ok: true; remaining: number; feedbackNotes: string[] } | Fail> {
  const session = await loadSession(merchant.id, sessionId);
  if (!session) return fail("This tips session was not found.", 404);
  const ctx = session.context as unknown as TipContext;
  const r = await withFeedback(merchant.id, parseFeedback(session.feedback), input, ctx, session.candidates as unknown as Candidate[], env.SARVAM_MAX_CALLS_PER_SESSION - session.llmCalls);
  const ranked = generateCandidates(ctx, r.feedback);
  const { remaining } = selectBatch(ranked, { count: 0, shown: session.shownKeys, open: [...(await openTipKeys(merchant.id)), ...(ctx.history?.recentKeys ?? []), ...(ctx.history?.rejectedKeys ?? [])] });
  await db.tipSession.update({ where: { id: session.id }, data: { feedback: asJson(r.feedback), candidates: asJson(ranked), llmCalls: { increment: r.llmCalls } } });
  return { ok: true, remaining, feedbackNotes: r.feedback.notes };
}

const lockedDrafts = async (tx: Prisma.TransactionClient, merchantId: string, sessionId: string) => {
  const rows = await tx.$queryRaw<{ drafts: unknown }[]>`SELECT "drafts" FROM tip_session WHERE "id" = ${sessionId} AND "merchantId" = ${merchantId} FOR UPDATE`;
  return rows[0] ? parseStaged(rows[0].drafts) : null;
};
const saveEntry = (tx: Prisma.TransactionClient, sessionId: string, key: string, entry: StagedTip) =>
  tx.$executeRaw`UPDATE tip_session SET "drafts" = jsonb_set("drafts", ARRAY[${key}]::text[], ${JSON.stringify(entry)}::jsonb), "updatedAt" = now() WHERE "id" = ${sessionId}`;

/**
 * The owner approves a tip shown on the tips screen. This is the moment it becomes a recommendation: created and approved
 * in one transaction (coupon codes included), so it is never PENDING_APPROVAL. Approving twice returns the same recommendation.
 */
export async function approveTip(merchant: Merchant, actor: Actor, input: { sessionId: string; key: string }): Promise<{ ok: true; recommendationId: string; duplicate: boolean } | Fail> {
  return db.$transaction(async (tx): Promise<{ ok: true; recommendationId: string; duplicate: boolean } | Fail> => {
    const staged = await lockedDrafts(tx, merchant.id, input.sessionId);
    if (!staged) return fail("This tips session was not found. Ask for tips again.", 404);
    const entry = staged[input.key];
    if (!entry) return fail("This tip is no longer available. Ask for tips again.", 404);
    if (entry.status === "APPROVED" && entry.recommendationId) return { ok: true, recommendationId: entry.recommendationId, duplicate: true };
    if (entry.status === "REJECTED") return fail("You already rejected this tip.", 409);
    const active = await tx.recommendation.findFirst({ where: { merchantId: merchant.id, status: { in: OPEN_STATUSES }, versions: { some: { evidence: { path: ["tip", "key"], equals: input.key } } } }, select: { id: true } });
    if (active) return fail("This tip is already active in your Action Centre.", 409);
    const recommendationId = await createApprovedRecommendation(tx, merchant, actor, entry.draft);
    await saveEntry(tx, input.sessionId, input.key, { ...entry, status: "APPROVED", recommendationId, decidedAt: new Date().toISOString() });
    return { ok: true, recommendationId, duplicate: false };
  }, { timeout: 20_000 });
}

/**
 * The owner rejects a tip shown on the tips screen. No recommendation is created. The reason is kept on the session (so the
 * tip is not offered again for a while) and applied as feedback to the next batch.
 */
export async function rejectTip(merchant: Merchant, input: { sessionId: string; key: string; reason: DeclineReason; note?: string }): Promise<{ ok: true; feedbackNotes: string[] } | Fail> {
  if (input.reason === "OTHER" && !input.note) return fail("Please explain the reason.", 422);
  const err = await db.$transaction(async (tx): Promise<Fail | null> => {
    const staged = await lockedDrafts(tx, merchant.id, input.sessionId);
    if (!staged) return fail("This tips session was not found. Ask for tips again.", 404);
    const entry = staged[input.key];
    if (!entry) return fail("This tip is no longer available. Ask for tips again.", 404);
    if (entry.status === "APPROVED") return fail("You already approved this tip.", 409);
    if (entry.status !== "REJECTED") await saveEntry(tx, input.sessionId, input.key, { ...entry, status: "REJECTED", reason: input.reason, note: input.note ?? null, decidedAt: new Date().toISOString() });
    return null;
  });
  if (err) return err;
  const r = await recordTipFeedback(merchant, input.sessionId, { tipKey: input.key, reason: input.reason, note: input.note });
  return r.ok ? { ok: true, feedbackNotes: r.feedbackNotes } : r;
}

/** After a rejection in the Action Centre, feeds the reason back into the tip's session (best effort). */
export async function feedRejectionToSession(merchant: Merchant, recommendationId: string, reason: DeclineReason, note?: string) {
  const rec = await db.recommendation.findFirst({ where: { id: recommendationId, merchantId: merchant.id }, select: { versions: { orderBy: { version: "desc" }, take: 1, select: { evidence: true } } } });
  const sessionId = (rec?.versions[0]?.evidence as { tip?: { sessionId?: string | null } } | null)?.tip?.sessionId;
  if (!sessionId) return;
  await recordTipFeedback(merchant, sessionId, { recommendationId, reason, note }).catch((e) => console.error("tips: could not record rejection feedback:", e));
}

/**
 * One offer the owner asked for by name (voice: "25% off for loyal customers"). Built with the same margin floor and
 * audience rules as every tip, worded in one call, and saved as a PENDING_APPROVAL proposal. Nothing is sent or created
 * until the owner approves it in the Action Centre.
 */
export async function createCustomOffer(merchant: Merchant, actor: Actor, input: CustomOfferInput): Promise<{ ok: true; recommendationId: string; title: string; audienceSize: number; duplicate: boolean } | Fail> {
  const ref = referenceDateFor(merchant);
  const ctx = await buildContext(merchant, ref, randomUUID());
  const built = buildCustomOffer(ctx, input);
  if (!built.ok) return fail(built.error, 422);
  const c = built.candidate;
  const open = await db.recommendation.findFirst({ where: { merchantId: merchant.id, status: { in: OPEN_STATUSES }, versions: { some: { evidence: { path: ["tip", "key"], equals: c.key } } } }, select: { id: true } });
  if (open) return { ok: true, recommendationId: open.id, title: c.title, audienceSize: c.audience.length, duplicate: true };
  const facts = factsFor(c, merchant.shopName);
  const { results } = await composeBatch([{ facts, evidence: c.whyFacts, fallbackWhy: c.why }], true);
  const [id] = await submitDrafts(merchant, actor, [draftFor(c, results[0], facts, { isDemo: merchant.isDemo, sessionId: null })]);
  return { ok: true, recommendationId: id, title: c.title, audienceSize: c.audience.length, duplicate: false };
}
