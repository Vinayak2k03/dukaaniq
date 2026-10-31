import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { istYmd, referenceDateFor } from "@/server/analytics/range";
import { composeBatch } from "@/server/recommendations/compose";
import { submitDrafts } from "@/server/recommendations/service";
import { OPEN_STATUSES } from "@/server/recommendations/state";
import { buildContext } from "./context";
import { draftFor, factsFor } from "./facts";
import { recentRejectedKeys } from "./history";
import { getTipImpacts } from "./impact";
import { generateCandidates } from "./rank";
import { openTipKeys } from "./service";
import { DEFAULT_ACTIVE_DAYS, pickReapplyable, reapplyMessage, type PastApproval } from "./reapply-math";
import { emptyFeedback } from "./types";

type Merchant = { id: string; isDemo: boolean; shopName: string };
type Fail = { ok: false; error: string; status: number };

/** Approvals older than this are no longer offered again (the owner's situation has likely changed). */
const LOOKBACK_DAYS = 90;
const MAX_OFFERS = 3;

export type ReapplyOffer = { recommendationId: string; key: string; title: string; approvedYmd: string; message: string; verdict: string | null; changePct: number | null };

const tipKeyOf = (evidence: unknown) => (evidence as { tip?: { key?: string } } | null)?.tip?.key;
const daysOf = (terms: unknown) => {
  const t = terms as { validFrom?: string; validTill?: string } | null;
  if (!t?.validFrom || !t?.validTill) return null;
  const d = (Date.parse(`${t.validTill}T00:00:00Z`) - Date.parse(`${t.validFrom}T00:00:00Z`)) / 86_400_000;
  return Number.isFinite(d) && d >= 1 ? Math.round(d) + 1 : null;
};

/** Earlier approvals whose active period is over, each with the message and the sales movement that followed. */
export async function getReapplyOffers(merchantId: string, todayYmd = istYmd(new Date())): Promise<ReapplyOffer[]> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);
  const rows = await db.approvalDecision.findMany({
    where: { merchantId, decision: "APPROVED", decidedAt: { gte: since } },
    orderBy: { decidedAt: "desc" },
    select: { decidedAt: true, recommendationId: true, version: { select: { title: true, evidence: true, offerTerms: true } } },
  });
  const approvals = rows.flatMap((r): PastApproval[] => {
    const key = tipKeyOf(r.version.evidence);
    return key ? [{ recommendationId: r.recommendationId, key, title: r.version.title, approvedYmd: istYmd(r.decidedAt), validityDays: daysOf(r.version.offerTerms), impact: null }] : [];
  });
  const due = pickReapplyable(approvals, { todayYmd, blockedKeys: [...(await openTipKeys(merchantId)), ...(await recentRejectedKeys(merchantId))] }).slice(0, MAX_OFFERS);
  if (due.length === 0) return [];
  const impacts = new Map((await getTipImpacts(merchantId, 30, todayYmd)).map((i) => [i.recommendationId, i]));
  return due.map((a) => {
    const i = impacts.get(a.recommendationId);
    const m = i ? i.audience ?? i.shop : null;
    const withImpact: PastApproval = { ...a, impact: i && m ? { changePct: m.changePct, verdict: m.verdict, beforePerDayPaise: m.beforePerDayPaise, afterPerDayPaise: m.afterPerDayPaise, basis: i.audience ? "targeted customers" : "shop" } : null };
    return { recommendationId: a.recommendationId, key: a.key, title: a.title, approvedYmd: a.approvedYmd, message: reapplyMessage(withImpact), verdict: m?.verdict ?? null, changePct: m?.changePct ?? null };
  });
}

/**
 * "Reapply": the same idea rebuilt from today's numbers (fresh dates, codes and audience) and saved as a PENDING_APPROVAL
 * proposal. Nothing is approved or sent here; the owner reviews the new version in the Action Centre.
 */
export async function reapplyTip(merchant: Merchant, actor: { userId: string }, recommendationId: string): Promise<{ ok: true; recommendationId: string; duplicate: boolean } | Fail> {
  const past = await db.approvalDecision.findFirst({
    where: { merchantId: merchant.id, recommendationId, decision: "APPROVED" },
    select: { decidedAt: true, version: { select: { evidence: true } } },
  });
  const key = tipKeyOf(past?.version.evidence);
  if (!past || !key) return { ok: false, error: "That earlier tip was not found.", status: 404 };
  const open = await db.recommendation.findFirst({ where: { merchantId: merchant.id, status: { in: OPEN_STATUSES }, versions: { some: { evidence: { path: ["tip", "key"], equals: key } } } }, select: { id: true } });
  if (open) return { ok: true, recommendationId: open.id, duplicate: true };

  const ctx = await buildContext(merchant, referenceDateFor(merchant), randomUUID());
  const c = generateCandidates(ctx, emptyFeedback()).find((x) => x.key === key);
  if (!c) return { ok: false, error: "This tip no longer fits your current sales and customers, so it cannot be reapplied as it was.", status: 422 };
  const facts = factsFor(c, merchant.shopName);
  const { results } = await composeBatch([{ facts, evidence: c.whyFacts, fallbackWhy: c.why }], true);
  const draft = draftFor(c, results[0], facts, { isDemo: merchant.isDemo, sessionId: null });
  const reapplied = { ...draft, evidence: { ...draft.evidence, reapply: { fromRecommendationId: recommendationId, previouslyApprovedAt: past.decidedAt.toISOString(), activeDays: DEFAULT_ACTIVE_DAYS } } };
  const [id] = await submitDrafts(merchant, actor, [reapplied]);
  return { ok: true, recommendationId: id, duplicate: false };
}
