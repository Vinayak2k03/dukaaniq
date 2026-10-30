import type { Prisma } from "@/generated/prisma/client";
import type { MessageChannel, RecommendationType } from "@/generated/prisma/enums";

/**
 * The shared recommendation format (PRD 6.2). Any generator (credit reminders, and later the
 * growth/insight engine) produces Drafts; the approval workflow persists and governs them.
 * Numbers in `evidence`, `offerTerms` and `economics` must come from deterministic code, never from an LLM.
 */
export type DraftAudience = { customerId: string; lastPurchaseAt: Date | null; daysSinceLastPurchase: number | null };

export type Draft = {
  type: RecommendationType;
  title: string;
  explanation: string;
  evidence: Prisma.InputJsonObject;
  offerTerms: Prisma.InputJsonObject;
  economics: Prisma.InputJsonObject;
  message: string;
  language: "HINDI" | "HINGLISH" | "ENGLISH";
  channel: MessageChannel;
  audience: DraftAudience[];
};
