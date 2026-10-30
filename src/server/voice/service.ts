import "server-only";
import { db } from "@/lib/db";
import { sarvamEnabled, sarvamJson } from "@/server/sarvam/client";
import { INTENTS, NEEDS_CONFIRMATION, intentSchema, matchIntent, unknownIntent, type IntentResult } from "./intent";

/**
 * Intent classification only, used when the free keyword matcher found nothing. The reply is Zod-validated
 * (intentSchema); the model can never confirm or approve anything (CONFIRM is mapped to UNKNOWN below).
 */
const SYSTEM = [
  "Role: you classify ONE command from a small Indian shop owner (Hindi, Hinglish or English) for the DukaanIQ shop app.",
  `Allowed intents: ${INTENTS.filter((i) => i !== "CONFIRM").join(", ")}.`,
  "Meanings: GET_TIPS=wants business ideas; GET_MORE_TIPS=wants more ideas; GET_TIPS_FOR=ideas for a specific area (set focus); TIP_FEEDBACK=complains about a suggested tip (set reason);",
  "GET_SALES_SUMMARY=asks about sales (set range); GET_INACTIVE_CUSTOMERS=asks who stopped coming; GET_CUSTOMER_BALANCE=asks how much udhaar a customer owes;",
  "ADD_CREDIT=wants to write new udhaar; RECORD_REPAYMENT=customer paid back; REQUEST_REMINDER=wants to remind a customer to pay; APPROVE_RECOMMENDATION=wants to approve an offer; UNKNOWN=anything else.",
  "Params (include only when clearly said): focus: [LOYALTY|FESTIVE|OFF_PEAK|CREDIT_REMINDER|WINBACK|BUNDLE|SLOW_MOVING|PEAK_TIMING]; reason: COST_TOO_HIGH|BENEFIT_UNCLEAR|WRONG_AUDIENCE|BAD_TIMING|OPERATIONAL_CONSTRAINT|DO_NOT_CONTACT|OTHER;",
  "customerName: the name exactly as spoken; amountPaise: rupees x 100, only if a number was spoken; range: today|7d|30d.",
  "RULES: never guess a name or an amount; if the command is unclear or unrelated, answer UNKNOWN with confidence below 0.5.",
  'OUTPUT: exactly one JSON object, no markdown, no explanation: {"intent":"...","params":{},"confidence":0.0}',
].join("\n");

export type CustomerMatch = { id: string; name: string; phone?: string | null; customerRef?: string | null };
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
  const customers = await db.customer.findMany({
    where: { merchantId, displayName: { contains: name, mode: "insensitive" } },
    select: { id: true, displayName: true, phone: true, customerRef: true },
    orderBy: { displayName: "asc" },
    take: 6,
  });
  return {
    ...r,
    customers: customers.map((c) => ({ id: c.id, name: c.displayName, phone: c.phone, customerRef: c.customerRef })),
    needsConfirmation: r.needsConfirmation || customers.length !== 1,
  };
}
