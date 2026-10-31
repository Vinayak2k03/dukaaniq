import { z } from "zod";

export const TIP_FAMILY_VALUES = ["LOYALTY", "FESTIVE", "OFF_PEAK", "CREDIT_REMINDER", "WINBACK", "BUNDLE", "SLOW_MOVING", "PEAK_TIMING"] as const;
/** Same values as DECLINE_REASONS in ./recommendation (PRD 7.3). */
const reason = z.enum(["COST_TOO_HIGH", "BENEFIT_UNCLEAR", "WRONG_AUDIENCE", "BAD_TIMING", "OPERATIONAL_CONSTRAINT", "DO_NOT_CONTACT", "OTHER"]);
const note = z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(300).optional());
const id = z.string().trim().min(1).max(64);

export const tipFeedbackInputSchema = z.object({ recommendationId: id.optional(), tipKey: z.string().trim().min(1).max(200).optional(), reason: reason.optional(), note });

export const tipsRequestSchema = z.object({
  sessionId: id.optional(),
  count: z.number().int().min(1).max(5).default(3),
  focus: z.array(z.enum(TIP_FAMILY_VALUES)).max(8).optional(),
  feedback: tipFeedbackInputSchema.optional(),
});

export const OFFER_AUDIENCE_VALUES = ["LOYAL", "INACTIVE", "COOLING", "ACTIVE", "ALL"] as const;
export const customOfferSchema = z.object({ discountPct: z.number().int().min(1).max(50), audience: z.enum(OFFER_AUDIENCE_VALUES), days: z.number().int().min(1).max(30).optional() });

export const tipFeedbackSchema = tipFeedbackInputSchema.extend({ sessionId: id });

export const approveApiSchema = z.object({ version: z.number().int().min(1).max(10_000), confirmed: z.literal(true, { error: "Confirm that you reviewed this exact version." }) });

export const rejectApiSchema = z
  .object({ version: z.number().int().min(1).max(10_000), reason, note })
  .refine((v) => v.reason !== "OTHER" || Boolean(v.note), { path: ["note"], message: "Please explain the reason." });

export const VOICE_LANGUAGES = ["HINDI", "HINGLISH", "ENGLISH"] as const;
export type VoiceLanguage = (typeof VOICE_LANGUAGES)[number];
/** The whole session (up to 12 exchanges) is sent back so follow-ups ("aur pichle hafte?", "uska kitna?") keep their context; the chat only displays the last 3. */
const voicePending = z.object({
  intent: z.enum(["ADD_CREDIT", "RECORD_REPAYMENT", "REQUEST_REMINDER", "GET_CUSTOMER_BALANCE", "CREATE_OFFER"]),
  customerName: z.string().trim().min(1).max(60).optional(),
  amountPaise: z.number().int().positive().max(100_000_000).optional(),
  discountPct: z.number().int().min(1).max(50).optional(),
  audience: z.enum(["LOYAL", "INACTIVE", "COOLING", "ACTIVE", "ALL"]).optional(),
});
/** What the session remembers beyond the words: the customer being talked about and the sale draft still open on screen. */
const voiceContext = z.object({ customerName: z.string().trim().min(1).max(60).optional(), saleText: z.string().trim().min(1).max(900).optional() });
export type VoiceContext = z.infer<typeof voiceContext>;
export const VOICE_SESSION_TURNS = 12;
const voiceTurn = z.object({ user: z.string().trim().max(300), assistant: z.string().trim().max(600), pending: voicePending.optional(), ctx: voiceContext.optional() });
export const voiceIntentSchema = z.object({ text: z.string().trim().min(1).max(300), language: z.enum(VOICE_LANGUAGES).default("HINGLISH"), sessionId: id.optional(), history: z.array(voiceTurn).max(VOICE_SESSION_TURNS).default([]) });
export const speakSchema = z.object({ text: z.string().trim().min(1).max(500), language: z.enum(VOICE_LANGUAGES).default("HINGLISH") });

/** Approve or reject a tip shown on the tips screen (it is not a recommendation until approved). */
export const tipDecisionSchema = z.object({ sessionId: id, key: z.string().trim().min(1).max(200) });
export const tipApproveSchema = tipDecisionSchema.extend({ confirmed: z.literal(true, { error: "Confirm that you reviewed this tip." }) });
export const tipRejectSchema = tipDecisionSchema.extend({ reason, note }).refine((v) => v.reason !== "OTHER" || Boolean(v.note), { path: ["note"], message: "Please explain the reason." });

/** Reapply an earlier approved tip: the earlier recommendation's id. The new proposal still needs approval. */
export const tipReapplySchema = z.object({ recommendationId: id });
