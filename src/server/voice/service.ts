import "server-only";
import { db } from "@/lib/db";
import { sarvamEnabled, sarvamJson } from "@/server/sarvam/client";
import type { VoiceLanguage } from "@/lib/validation/tips";
import { askData, type Turn } from "./ask";
import { INTENTS, NEEDS_CONFIRMATION, intentSchema, matchIntent, unknownIntent, type Intent, type IntentResult } from "./intent";

/**
 * Intent classification only, used when the free keyword matcher found nothing. The reply is Zod-validated
 * (intentSchema); the model can never confirm or approve anything (CONFIRM is mapped to UNKNOWN below).
 */
const SYSTEM = [
  "Role: you classify ONE command from a small Indian shop owner (Hindi, Hinglish or English) for the DukaanIQ shop app.",
  `Allowed intents: ${INTENTS.filter((i) => i !== "CONFIRM").join(", ")}.`,
  "Meanings: GET_TIPS=wants business ideas; GET_MORE_TIPS=wants more ideas; GET_TIPS_FOR=ideas for a specific area (set focus); TIP_FEEDBACK=complains about a suggested tip (set reason);",
  "GET_SALES_SUMMARY=asks about sales (set range); GET_INACTIVE_CUSTOMERS=asks who stopped coming; GET_CUSTOMER_BALANCE=asks how much udhaar a customer owes;",
  "ASK_DATA=any other question about the shop's own data (products, profit, customers, payments, udhaar totals, comparisons);",
  "ADD_CREDIT=wants to write new udhaar; RECORD_REPAYMENT=customer paid back; REQUEST_REMINDER=wants to remind a customer to pay; APPROVE_RECOMMENDATION=wants to approve an offer; UNKNOWN=anything else.",
  "Params (include only when clearly said): focus: [LOYALTY|FESTIVE|OFF_PEAK|CREDIT_REMINDER|WINBACK|BUNDLE|SLOW_MOVING|PEAK_TIMING]; reason: COST_TOO_HIGH|BENEFIT_UNCLEAR|WRONG_AUDIENCE|BAD_TIMING|OPERATIONAL_CONSTRAINT|DO_NOT_CONTACT|OTHER;",
  "customerName: the name exactly as spoken; amountPaise: rupees x 100, only if a number was spoken; range: today|7d|30d.",
  "Commands may be Hindi in Devanagari, Hinglish in Roman letters, or English, with spelling mistakes from speech recognition (e.g. 'udar', 'bikri', 'kitna hua'). Understand the meaning, not the spelling.",
  "Use the recent conversation for follow-ups: 'aur pichle hafte?' after a sales question is GET_SALES_SUMMARY range 7d; 'uska?' refers to the last customer named.",
  "RULES: never guess a name or an amount; if the command is unclear or unrelated, answer UNKNOWN with confidence below 0.5.",
  'OUTPUT: exactly one JSON object, no markdown, no explanation: {"intent":"...","params":{},"confidence":0.0}',
].join("\n");

export type CustomerMatch = { id: string; name: string; phone?: string | null; customerRef?: string | null };
export type InterpretResult = IntentResult & { customers?: CustomerMatch[] };

/** Read-only questions answered from the fact sheet (in the owner's language) when Sarvam is configured. */
const DATA_INTENTS: Intent[] = ["ASK_DATA", "GET_SALES_SUMMARY", "GET_INACTIVE_CUSTOMERS", "GET_CUSTOMER_BALANCE", "UNKNOWN"];

type Merchant = { id: string; isDemo: boolean; shopName: string };

/**
 * Keyword matcher first (free); the reasoning model only when nothing matched or a follow-up needs context.
 * Customer names are resolved inside the merchant's own data. Read-only questions get a validated answer.
 */
export async function interpret(merchant: Merchant, text: string, language: VoiceLanguage = "HINGLISH", history: Turn[] = []): Promise<InterpretResult> {
  let r: IntentResult = matchIntent(text) ?? unknownIntent();
  // A short follow-up ("aur pichle hafte?") may hit a keyword without its subject; let the model read it in context.
  const followUp = history.length > 0 && text.trim().split(/\s+/).length <= 5 && r.intent !== "CONFIRM";
  if ((r.intent === "UNKNOWN" || (followUp && DATA_INTENTS.includes(r.intent))) && sarvamEnabled()) {
    const convo = history.slice(-3).map((t) => `Owner: ${t.user}\nApp: ${t.assistant}`).join("\n");
    const parsed = intentSchema.safeParse(await sarvamJson(SYSTEM, `${convo ? `Recent conversation:\n${convo.slice(-1500)}\n\n` : ""}Command: ${text.slice(0, 300)}`));
    if (parsed.success) {
      const d = parsed.data;
      // Model output is capped below keyword confidence and can never be a bare confirmation.
      const intent = d.intent === "CONFIRM" ? "UNKNOWN" : d.intent;
      r = { intent, params: d.params, confidence: Math.min(0.8, d.confidence), needsConfirmation: NEEDS_CONFIRMATION.includes(intent), source: "sarvam" };
    }
  }
  let customers: CustomerMatch[] | undefined;
  if (r.params.customerName) {
    const rows = await db.customer.findMany({
      where: { merchantId: merchant.id, displayName: { contains: r.params.customerName, mode: "insensitive" } },
      select: { id: true, displayName: true, phone: true, customerRef: true },
      orderBy: { displayName: "asc" },
      take: 6,
    });
    customers = rows.map((c) => ({ id: c.id, name: c.displayName, phone: c.phone, customerRef: c.customerRef }));
  }
  const single = customers?.length === 1 ? customers[0].id : undefined;
  const askable = DATA_INTENTS.includes(r.intent) && (r.intent !== "GET_CUSTOMER_BALANCE" || single);
  if (askable && sarvamEnabled()) {
    const answer = await askData(merchant, text, language, history, single);
    if (answer) r = { ...r, intent: r.intent === "UNKNOWN" ? "ASK_DATA" : r.intent, answer };
  }
  if (!customers) return r;
  return { ...r, customers, needsConfirmation: r.needsConfirmation || customers.length !== 1 };
}
