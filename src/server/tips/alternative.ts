import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { DeclineReason } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { referenceDateFor } from "@/server/analytics/range";
import { composeBatch } from "@/server/recommendations/compose";
import type { Draft } from "@/server/recommendations/draft";
import { buildContext } from "./context";
import { describeChanges, draftFor, factsFor } from "./facts";
import { applySignal, parseFeedback } from "./feedback";
import { applyFreeText } from "./notes";
import { generateCandidates } from "./rank";
import { TIP_FAMILIES, type Candidate, type TipFamily } from "./types";

type Merchant = { id: string; isDemo: boolean; shopName: string };

export type TipOriginal = {
  id: string;
  evidence: unknown;
  offerTerms: unknown;
  audienceSize: number;
  declineReason: DeclineReason | null;
  note: string | null;
};

const variantOf = (key: string) => key.split(":").at(-1);

/**
 * Revised proposal for a rejected tip (PRD 7.3). Fresh queries, the session's feedback plus this rejection's
 * reason, the same family rebuilt, fresh economics, and the changed terms listed. The caller persists it as a NEW
 * recommendation that needs its own approval.
 */
export async function buildTipAlternative(merchant: Merchant, original: TipOriginal): Promise<{ ok: true; draft: Draft } | { ok: false; error: string }> {
  const tip = (original.evidence as { tip?: { key?: string; family?: string; sessionId?: string | null } } | null)?.tip;
  if (!tip?.key || !TIP_FAMILIES.includes(tip.family as TipFamily)) return { ok: false, error: "Alternatives are not available for this recommendation." };
  const family = tip.family as TipFamily;
  const ref = referenceDateFor(merchant);
  const session = tip.sessionId ? await db.tipSession.findFirst({ where: { id: tip.sessionId, merchantId: merchant.id } }) : null;
  const ctx = await buildContext(merchant, ref, randomUUID());

  let fb = parseFeedback(session?.feedback);
  const target = (session?.candidates as unknown as Candidate[] | undefined)?.find((c) => c.key === tip.key) ?? generateCandidates(ctx, fb, [family]).find((c) => c.key === tip.key);
  const before = fb.notes.length;
  let llmCalls = 0;
  const budget = env.SARVAM_MAX_CALLS_PER_SESSION - (session?.llmCalls ?? 0);
  if (original.declineReason && !fb.appliedRejections.includes(original.id)) {
    fb = { ...applySignal(fb, original.declineReason, target), appliedRejections: [...fb.appliedRejections, original.id] };
    if (original.note) {
      const r = await applyFreeText(fb, original.note, ctx, budget > 0);
      fb = r.feedback;
      llmCalls += r.llmCalls;
    }
  }

  const rebuilt = generateCandidates(ctx, fb, [family]);
  const next = rebuilt.find((c) => c.key === tip.key) ?? rebuilt.find((c) => variantOf(c.key) === variantOf(tip.key!)) ?? rebuilt[0];
  if (!next) return { ok: false, error: "No version of this tip fits your feedback and the current data. Try asking for new tips instead." };

  const terms = (original.offerTerms ?? {}) as Record<string, unknown>;
  const changes = describeChanges(terms, next.offer, original.audienceSize, next.audience.length, target?.festivalName, next.festivalName);
  if (changes.length === 0) return { ok: false, error: "Your feedback did not change this tip. Choose a different reason, or ask for new tips instead." };
  const candidate: Candidate = { ...next, changes: [...fb.notes.slice(before), ...changes] };

  const facts = factsFor(candidate, merchant.shopName);
  const { results, llmCalls: wordingCalls } = await composeBatch([{ facts, evidence: candidate.whyFacts, fallbackWhy: candidate.why }], budget - llmCalls > 0);
  llmCalls += wordingCalls;
  if (session) await db.tipSession.update({ where: { id: session.id }, data: { feedback: fb as unknown as Prisma.InputJsonValue, llmCalls: { increment: llmCalls } } });
  return { ok: true, draft: draftFor(candidate, results[0], facts, { isDemo: merchant.isDemo, sessionId: session?.id ?? null }) };
}
