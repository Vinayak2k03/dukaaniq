import { z } from "zod";

export const TIP_FAMILY_VALUES = ["LOYALTY", "FESTIVE", "OFF_PEAK", "CREDIT_REMINDER", "WINBACK", "BUNDLE", "SLOW_MOVING", "PEAK_TIMING"] as const;
/** Same values as DECLINE_REASONS in ./recommendation (PRD 7.3). */
const reason = z.enum(["COST_TOO_HIGH", "BENEFIT_UNCLEAR", "WRONG_AUDIENCE", "BAD_TIMING", "OPERATIONAL_CONSTRAINT", "DO_NOT_CONTACT", "OTHER"]);
const note = z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(300).optional());
const id = z.string().trim().min(1).max(64);

export const tipFeedbackInputSchema = z.object({ recommendationId: id.optional(), reason: reason.optional(), note });

export const tipsRequestSchema = z.object({
  sessionId: id.optional(),
  count: z.number().int().min(1).max(5).default(3),
  focus: z.array(z.enum(TIP_FAMILY_VALUES)).max(8).optional(),
  feedback: tipFeedbackInputSchema.optional(),
});

export const tipFeedbackSchema = tipFeedbackInputSchema.extend({ sessionId: id });

export const approveApiSchema = z.object({ version: z.number().int().min(1).max(10_000), confirmed: z.literal(true, { error: "Confirm that you reviewed this exact version." }) });

export const rejectApiSchema = z
  .object({ version: z.number().int().min(1).max(10_000), reason, note })
  .refine((v) => v.reason !== "OTHER" || Boolean(v.note), { path: ["note"], message: "Please explain the reason." });

export const VOICE_LANGUAGES = ["HINDI", "HINGLISH", "ENGLISH"] as const;
export type VoiceLanguage = (typeof VOICE_LANGUAGES)[number];
/** Up to the last 3 exchanges, so follow-up questions ("aur pichle hafte?") keep their context. */
const voiceTurn = z.object({ user: z.string().trim().max(300), assistant: z.string().trim().max(600) });
export const voiceIntentSchema = z.object({ text: z.string().trim().min(1).max(300), language: z.enum(VOICE_LANGUAGES).default("HINGLISH"), sessionId: id.optional(), history: z.array(voiceTurn).max(3).default([]) });
export const speakSchema = z.object({ text: z.string().trim().min(1).max(500), language: z.enum(VOICE_LANGUAGES).default("HINGLISH") });
