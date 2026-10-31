import type { Draft } from "@/server/recommendations/draft";

/**
 * Tips shown to the owner live on the tips session until the owner approves one. Nothing here is a recommendation:
 * only an approval turns an entry into a (already approved) recommendation, and a rejection stays a note on the session.
 */
export type StagedStatus = "SHOWN" | "APPROVED" | "REJECTED";
export type StagedTip = { draft: Draft; status: StagedStatus; recommendationId?: string; reason?: string; note?: string | null; decidedAt?: string };
export type StagedTips = Record<string, StagedTip>;

/** JSON-safe copy (dates become strings) for the session's `drafts` column. */
export const stage = (draft: Draft): StagedTip => ({ draft: JSON.parse(JSON.stringify(draft)) as Draft, status: "SHOWN" });

/** Reads the `drafts` column back, turning audience dates into Dates again. Anything malformed is ignored. */
export function parseStaged(raw: unknown): StagedTips {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: StagedTips = {};
  for (const [key, v] of Object.entries(raw as Record<string, unknown>)) {
    const t = v as Partial<StagedTip> | null;
    if (!t || typeof t !== "object" || !t.draft || !Array.isArray(t.draft.audience) || !t.status) continue;
    out[key] = { ...(t as StagedTip), draft: { ...t.draft, audience: t.draft.audience.map((a) => ({ ...a, lastPurchaseAt: a.lastPurchaseAt ? new Date(a.lastPurchaseAt) : null })) } };
  }
  return out;
}

/** Keys the owner rejected in sessions touched since `since`, so those tips are not offered again for a while. */
export const rejectedKeysOf = (staged: StagedTips, since: Date): string[] =>
  Object.entries(staged).flatMap(([key, t]) => (t.status === "REJECTED" && t.decidedAt && new Date(t.decidedAt) >= since ? [key] : []));
