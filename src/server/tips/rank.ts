import { festiveCandidates } from "./generators/festive";
import { loyaltyCandidates } from "./generators/loyalty";
import { bundleCandidates, reminderCandidates, slowMovingCandidates, winbackCandidates } from "./generators/others";
import type { Built } from "./generators/shared";
import { offPeakCandidates, peakCandidates } from "./generators/timing";
import type { Candidate, TipContext, TipFamily, TipFeedback } from "./types";

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

const scoreOf = (b: Built, fb: TipFeedback) =>
  Math.round(
    (FAMILY_WEIGHT[b.family] +
      b.quality +
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
    .map(({ quality: _q, ...b }) => ({ ...b, score: scoreOf({ ...b, quality: _q }, fb), changes: [...fb.notes] }))
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
}

export type BatchOptions = { count: number; focus?: TipFamily[]; shown: Iterable<string>; open: Iterable<string> };

/**
 * Next batch: the best `count` candidates not shown in this session and not already open in the Action Centre.
 * Without a focus, at most one tip per family per batch (diversity); with a focus, only those families.
 */
export function selectBatch(ranked: Candidate[], o: BatchOptions): { batch: Candidate[]; remaining: number } {
  const skip = new Set([...o.shown, ...o.open]);
  const focus = o.focus?.length ? new Set(o.focus) : null;
  const pool = ranked.filter((c) => !skip.has(c.key) && (!focus || focus.has(c.family)));
  const used = new Set<TipFamily>();
  const batch: Candidate[] = [];
  for (const c of pool) {
    if (batch.length >= o.count) break;
    if (!focus && used.has(c.family)) continue;
    used.add(c.family);
    batch.push(c);
  }
  return { batch, remaining: pool.length - batch.length };
}
