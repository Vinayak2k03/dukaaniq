import { festiveCandidates } from "./generators/festive";
import { loyaltyCandidates } from "./generators/loyalty";
import { bundleCandidates, reminderCandidates, slowMovingCandidates, winbackCandidates } from "./generators/others";
import type { Built } from "./generators/shared";
import { offPeakCandidates, peakCandidates } from "./generators/timing";
import type { Candidate, TipContext, TipFamily, TipFeedback, TipHistory } from "./types";

/** Merchant priorities first (loyalty, festive, low hours), then the extra families. */
export const FAMILY_WEIGHT: Record<TipFamily, number> = { LOYALTY: 100, FESTIVE: 90, OFF_PEAK: 80, CREDIT_REMINDER: 70, WINBACK: 65, BUNDLE: 60, SLOW_MOVING: 50, PEAK_TIMING: 45 };

const GENERATORS: Record<TipFamily, (ctx: TipContext, fb: TipFeedback) => Built[]> = {
  LOYALTY: loyaltyCandidates,
  FESTIVE: festiveCandidates,
  OFF_PEAK: offPeakCandidates,
  CREDIT_REMINDER: reminderCandidates,
  WINBACK: winbackCandidates,
  BUNDLE: bundleCandidates,
  SLOW_MOVING: slowMovingCandidates,
  PEAK_TIMING: peakCandidates,
};

/**
 * Learning from what the merchant approved: each earlier approval of a family adds up to +20 in total, and measured
 * sales that rose (or fell) by 5% or more after those approvals add (or remove) 10. Only families they approved move.
 */
export function historyBoost(family: TipFamily, h: TipHistory | undefined): number {
  const f = h?.families[family];
  if (!f || f.approved === 0) return 0;
  const measured = f.avgSalesChangePct === null ? 0 : f.avgSalesChangePct >= 5 ? 10 : f.avgSalesChangePct <= -5 ? -10 : 0;
  return Math.min(20, f.approved * 6) + measured;
}

/** A plain sentence about why history moved a tip, or null. Restated as evidence in the tip's explanation. */
export function historyNote(family: TipFamily, h: TipHistory | undefined): string | null {
  const f = h?.families[family];
  if (!f || f.approved === 0) return null;
  const label = family.toLowerCase().replace("_", " ");
  const moved = f.avgSalesChangePct === null ? "" : `; sales per day were ${f.avgSalesChangePct >= 0 ? "up" : "down"} ${Math.abs(f.avgSalesChangePct)}% in the days after`;
  return `You approved ${f.approved} ${label} ${f.approved === 1 ? "tip" : "tips"} before${moved}.`;
}

const scoreOf = (b: Built, fb: TipFeedback, h: TipHistory | undefined) =>
  Math.round(
    (FAMILY_WEIGHT[b.family] +
      b.quality +
      historyBoost(b.family, h) +
      (fb.preferFamilies.includes(b.family) ? 30 : 0) -
      (fb.demoteFamilies.includes(b.family) ? 30 : 0) +
      (fb.preferLargeAudience ? Math.min(10, b.audience.length / 10) : 0)) *
      100,
  ) / 100;

/** Builds and ranks every candidate. Zero LLM calls, zero queries: a pure function of the snapshot and the feedback. */
export function generateCandidates(ctx: TipContext, fb: TipFeedback, families: readonly TipFamily[] = Object.keys(GENERATORS) as TipFamily[]): Candidate[] {
  return families
    .filter((f) => !fb.excludeFamilies.includes(f))
    .flatMap((f) => GENERATORS[f](ctx, fb))
    .map((b): Candidate => {
      const { quality, ...rest } = b;
      const note = historyNote(b.family, ctx.history);
      return { ...rest, whyFacts: note ? [...rest.whyFacts, note] : rest.whyFacts, score: scoreOf({ ...rest, quality }, fb, ctx.history), changes: [...fb.notes] };
    })
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
}

export type BatchOptions = { count: number; focus?: TipFamily[]; shown: Iterable<string>; open: Iterable<string> };

const productSet = (c: Candidate) => (c.productIds.length ? [...c.productIds].sort().join("+") : null);

/**
 * Next batch: the best `count` candidates not shown in this session and not already open in the Action Centre.
 * Without a focus, at most one tip per family per batch (diversity); with a focus, only those families.
 * A combo on the same products as a tip already shown or picked is skipped, so the same idea is not repeated
 * under another family.
 */
export function selectBatch(ranked: Candidate[], o: BatchOptions): { batch: Candidate[]; remaining: number } {
  const shown = new Set(o.shown);
  const skip = new Set([...shown, ...o.open]);
  const focus = o.focus?.length ? new Set(o.focus) : null;
  const seenProducts = new Set(ranked.filter((c) => shown.has(c.key)).flatMap((c) => productSet(c) ?? []));
  const pool = ranked.filter((c) => !skip.has(c.key) && (!focus || focus.has(c.family)) && !seenProducts.has(productSet(c) ?? ""));
  const used = new Set<TipFamily>();
  const batch: Candidate[] = [];
  for (const c of pool) {
    if (batch.length >= o.count) break;
    const products = productSet(c);
    if ((!focus && used.has(c.family)) || (products && seenProducts.has(products))) continue;
    used.add(c.family);
    if (products) seenProducts.add(products);
    batch.push(c);
  }
  return { batch, remaining: pool.filter((c) => !batch.includes(c) && !seenProducts.has(productSet(c) ?? "")).length };
}
