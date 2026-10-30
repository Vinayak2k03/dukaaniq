import { z } from "zod";

const id = z.string().trim().min(1).max(64);
const version = z.coerce.number().int().min(1).max(10_000);

export const DECLINE_REASONS = [
  ["COST_TOO_HIGH", "Cost is too high"],
  ["BENEFIT_UNCLEAR", "Benefit is too low or unclear"],
  ["WRONG_AUDIENCE", "Wrong customers"],
  ["BAD_TIMING", "Timing is not suitable"],
  ["OPERATIONAL_CONSTRAINT", "Stock or operational constraint"],
  ["DO_NOT_CONTACT", "I do not want to contact these customers"],
  ["OTHER", "Other (please explain)"],
] as const;

export const approveSchema = z.object({
  recommendationId: id,
  version,
  confirmed: z.literal("on", { error: "Tick the box to confirm you have reviewed this." }),
});

export const rejectSchema = z
  .object({
    recommendationId: id,
    version,
    reason: z.enum(DECLINE_REASONS.map(([v]) => v) as [string, ...string[]], { error: "Choose a reason." }),
    note: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(300, "Note is too long (300 characters max).").optional()),
  })
  .refine((v) => v.reason !== "OTHER" || Boolean(v.note), { path: ["note"], message: "Please explain the reason." });

export const recommendationIdSchema = z.object({ recommendationId: id });
