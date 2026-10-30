import "server-only";
import { db } from "@/lib/db";
import { sarvamEnabled, sarvamJson } from "@/server/sarvam/client";
import { INTENTS, NEEDS_CONFIRMATION, intentSchema, matchIntent, unknownIntent, type IntentResult } from "./intent";

const SYSTEM =
  "You map a small Indian shop owner's command (Hindi, Hinglish or English) to one intent for the DukaanIQ app. " +
  `Allowed intents: ${INTENTS.join(", ")}. Params (all optional): focus (array of LOYALTY, FESTIVE, OFF_PEAK, CREDIT_REMINDER, WINBACK, BUNDLE, SLOW_MOVING, PEAK_TIMING), ` +
  "reason (COST_TOO_HIGH, BENEFIT_UNCLEAR, WRONG_AUDIENCE, BAD_TIMING, OPERATIONAL_CONSTRAINT, DO_NOT_CONTACT, OTHER), customerName, amountPaise (rupees × 100, only if the owner said a number), range (today, 7d, 30d). " +
  'Never guess an amount or a name. If unsure use UNKNOWN. Reply with JSON only: {"intent": "...", "params": {...}, "confidence": 0..1}.';

export type CustomerMatch = { id: string; name: string };
export type InterpretResult = IntentResult & { customers?: CustomerMatch[] };

/** Keyword matcher first (free); the reasoning model only when nothing matched. Customer names are resolved inside the merchant's own data. */
export async function interpret(merchantId: string, text: string): Promise<InterpretResult> {
  let r: IntentResult = matchIntent(text) ?? unknownIntent();
  if (r.intent === "UNKNOWN" && sarvamEnabled()) {
    const parsed = intentSchema.safeParse(await sarvamJson(SYSTEM, `Command: ${text.slice(0, 300)}`));
    if (parsed.success) {
      const d = parsed.data;
      // Model output is capped below keyword confidence and can never be a bare confirmation.
      const intent = d.intent === "CONFIRM" ? "UNKNOWN" : d.intent;
      r = { intent, params: d.params, confidence: Math.min(0.8, d.confidence), needsConfirmation: NEEDS_CONFIRMATION.includes(intent), source: "sarvam" };
    }
  }
  if (!r.params.customerName) return r;
  const name = r.params.customerName;
  const customers = await db.customer.findMany({ where: { merchantId, displayName: { contains: name, mode: "insensitive" } }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" }, take: 6 });
  return { ...r, customers: customers.map((c) => ({ id: c.id, name: c.displayName })), needsConfirmation: r.needsConfirmation || customers.length !== 1 };
}
