import "server-only";
import { db } from "@/lib/db";
import { sarvamEnabled, sarvamJson } from "@/server/sarvam/client";
import type { VoiceContext, VoiceLanguage } from "@/lib/validation/tips";
import { askData, type Turn } from "./ask";
import type { RecordDraft } from "@/lib/validation/records";
import { draftRecord } from "./records";
import { amendSale } from "./records-parse";
import { INTENTS, NEEDS_CONFIRMATION, RECORD_INTENTS, SLOT_INTENTS, clarifyOffer, clarifyQuestion, fillSlots, fuzzyCustomers, intentSchema, matchIntent, missingOfferSlot, missingSlot, notFoundQuestion, unknownIntent, type Intent, type IntentResult, type Pending, type RecordIntent, type SlotIntent } from "./intent";

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
  "customerName: the name exactly as spoken; amountPaise: rupees x 100, only if a number was spoken; range: today|7d|30d; discountPct and audience as described for CREATE_OFFER.",
  "Commands may be Hindi in Devanagari, Hinglish in Roman letters, or English, with spelling mistakes from speech recognition (e.g. 'udar', 'bikri', 'kitna hua'). Understand the meaning, not the spelling.",
  "Use the recent conversation for follow-ups: 'aur pichle hafte?' after a sales question is GET_SALES_SUMMARY range 7d; 'uska?' refers to the last customer named.",
  "ADD_PRODUCT=wants to add a new product to the shop's list (often with selling / buying price); ADD_CUSTOMER=wants to add a new customer (name, maybe phone); RECORD_SALE=tells you something was just sold or bought by a customer ('2 Maggi becha', 'Rahul ne 1 kg cheeni li, udhaar'). A question about past sales is GET_SALES_SUMMARY or ASK_DATA, never RECORD_SALE.",
  "REQUEST_REMINDER is ONLY asking a customer to repay udhaar. 'Credit overdue' is not a customer name.",
  "CREATE_OFFER=the owner wants a discount sent to a group of customers ('25% off for loyal customers', 'inactive customers ko 10 percent chhoot'): set discountPct (whole number 1-50, only if said) and audience (LOYAL=loyal/regular/best, INACTIVE=stopped coming, COOLING=not seen for 2-4 weeks, ACTIVE=recent buyers, ALL=everyone, only if said). Asking for ideas without a percentage is GET_TIPS.",
  "Customers are stored with English names; a name spoken or written in Hindi script is still a customerName, copy it as given.",
  "RULES: never guess a name or an amount; if the command is unclear or unrelated, answer UNKNOWN with confidence below 0.5.",
  'OUTPUT: exactly one JSON object, no markdown, no explanation: {"intent":"...","params":{},"confidence":0.0}',
].join("\n");

export type CustomerMatch = { id: string; name: string; phone?: string | null; customerRef?: string | null };
/** `pending` is set when the reply is a follow-up question; the client sends it back with the next turn. */
/** `draft` pre-fills the on-screen review card for a new product, customer or sale; nothing is saved until the owner taps Save. */
export type InterpretResult = IntentResult & { customers?: CustomerMatch[]; pending?: Pending; draft?: RecordDraft; context?: VoiceContext };

export type SessionTurn = Turn & { pending?: Pending; ctx?: VoiceContext };

/**
 * The client keeps the whole session (not only the 3 exchanges it shows). The most recent turns go to the model as
 * text; the customer being discussed and the open sale draft are remembered from ANY earlier turn.
 */
const lastCtx = (history: SessionTurn[], key: keyof VoiceContext) => history.findLast((t) => t.ctx?.[key])?.ctx?.[key];
const conversation = (history: SessionTurn[]) => history.slice(-6).map((t) => `Owner: ${t.user}\nApp: ${t.assistant}`).join("\n").slice(-1800);

/** "uska kitna udhaar hai", "usko reminder bhejo": a pronoun standing for the customer talked about earlier. */
const PRONOUN = /\b(?:uska|uski|uske|usko|usne|unka|unki|unke|unko|usse|his|her|him|them|their)\b|उसका|उसकी|उसके|उसको|उसने|उससे|उनका|उनकी|उनके|उनको/iu;

/** Read-only questions answered from the fact sheet (in the owner's language) when Sarvam is configured. */
const DATA_INTENTS: Intent[] = ["ASK_DATA", "GET_SALES_SUMMARY", "GET_INACTIVE_CUSTOMERS", "GET_CUSTOMER_BALANCE", "UNKNOWN"];

type Merchant = { id: string; isDemo: boolean; shopName: string };

/**
 * Keyword matcher first (free); the reasoning model only when nothing matched or a follow-up needs context.
 * Customer names are resolved inside the merchant's own data. Read-only questions get a validated answer.
 */
export async function interpret(merchant: Merchant, text: string, language: VoiceLanguage = "HINGLISH", history: SessionTurn[] = []): Promise<InterpretResult> {
  const matched = matchIntent(text);
  const carriedCustomer = lastCtx(history, "customerName");
  const openSale = history.at(-1)?.ctx?.saleText;
  const amended = amendSale(openSale, text, matched?.intent);
  // An answer to the previous follow-up question ("Rahul", "500 rupaye") completes that command.
  const pending = history.at(-1)?.pending;
  const filled = pending ? fillSlots(text, pending, matched) : null;
  let r: IntentResult = filled ?? matched ?? unknownIntent();
  // A short follow-up ("aur pichle hafte?") may hit a keyword without its subject; let the model read it in context.
  const followUp = !amended && history.length > 0 && text.trim().split(/\s+/).length <= 5 && r.intent !== "CONFIRM";
  if (!filled && !amended && (r.intent === "UNKNOWN" || (followUp && DATA_INTENTS.includes(r.intent))) && sarvamEnabled()) {
    const convo = conversation(history) + (carriedCustomer ? `\n(The customer being discussed: ${carriedCustomer})` : "");
    const parsed = intentSchema.safeParse(await sarvamJson(SYSTEM, `${convo ? `Recent conversation:\n${convo}\n\n` : ""}Command: ${text.slice(0, 300)}`));
    if (parsed.success) {
      const d = parsed.data;
      // Model output is capped below keyword confidence and can never be a bare confirmation.
      const intent = d.intent === "CONFIRM" ? "UNKNOWN" : d.intent;
      r = { intent, params: d.params, confidence: Math.min(0.8, d.confidence), needsConfirmation: NEEDS_CONFIRMATION.includes(intent), source: "sarvam" };
    }
  }
  if (amended || (RECORD_INTENTS as readonly string[]).includes(r.intent)) {
    const saleText = amended ?? text;
    const { draft, answer } = await draftRecord(merchant.id, amended ? "RECORD_SALE" : (r.intent as RecordIntent), saleText, language, findCustomers);
    const context: VoiceContext = { customerName: (draft.kind === "SALE" ? draft.customers[0]?.name ?? draft.customerHeard : undefined) ?? carriedCustomer, saleText: draft.kind === "SALE" ? saleText.slice(0, 900) : undefined };
    return { ...r, intent: amended ? "RECORD_SALE" : r.intent, needsConfirmation: true, answer, draft, context };
  }

  // An offer needs a percentage and a customer group; ask for whichever is missing. The offer itself is only prepared after the on-screen confirm.
  if (r.intent === "CREATE_OFFER") {
    const { discountPct, audience } = r.params;
    const slot = missingOfferSlot(r.params);
    if (slot) return { ...r, answer: clarifyOffer(slot, language, discountPct), pending: { intent: "CREATE_OFFER", discountPct, audience }, needsConfirmation: true };
  }

  if (!r.params.customerName && carriedCustomer && PRONOUN.test(text) && (SLOT_INTENTS as readonly string[]).includes(r.intent)) r = { ...r, params: { ...r.params, customerName: carriedCustomer } };
  const customers = r.params.customerName ? await findCustomers(merchant.id, r.params.customerName) : undefined;

  // Ledger commands ask for whatever is missing (or not found) instead of failing; voice still never writes anything itself.
  if ((SLOT_INTENTS as readonly string[]).includes(r.intent)) {
    const intent = r.intent as SlotIntent;
    const { amountPaise } = r.params;
    if (customers?.length === 0) return { ...r, customers, answer: notFoundQuestion(r.params.customerName ?? "", language), pending: { intent, amountPaise }, needsConfirmation: true };
    const slot = missingSlot(r);
    if (slot) {
      const customerName = customers?.length === 1 ? customers[0].name : r.params.customerName;
      return { ...r, customers, answer: clarifyQuestion(slot, intent, language, customerName), pending: { intent, customerName, amountPaise }, needsConfirmation: true };
    }
  }
  const single = customers?.length === 1 ? customers[0].id : undefined;
  const askable = DATA_INTENTS.includes(r.intent) && (r.intent !== "GET_CUSTOMER_BALANCE" || single);
  if (askable && sarvamEnabled()) {
    const answer = await askData(merchant, text, language, history, single);
    if (answer) r = { ...r, intent: r.intent === "UNKNOWN" ? "ASK_DATA" : r.intent, answer };
  }
  const context: VoiceContext = { customerName: (customers?.length === 1 ? customers[0].name : r.params.customerName) ?? carriedCustomer };
  if (!customers) return { ...r, context };
  return { ...r, customers, context, needsConfirmation: r.needsConfirmation || customers.length !== 1 };
}

/** Case-insensitive substring match first; if nothing matches, fuzzy matching for speech-recognition spellings. */
export async function findCustomers(merchantId: string, name: string): Promise<CustomerMatch[]> {
  const select = { id: true, displayName: true, phone: true, customerRef: true } as const;
  const toMatch = (c: { id: string; displayName: string; phone: string | null; customerRef: string | null }) => ({ id: c.id, name: c.displayName, phone: c.phone, customerRef: c.customerRef });
  const exact = await db.customer.findMany({ where: { merchantId, displayName: { contains: name, mode: "insensitive" } }, select, orderBy: { displayName: "asc" }, take: 6 });
  if (exact.length > 0) return exact.map(toMatch);
  const all = await db.customer.findMany({ where: { merchantId }, select, take: 2_000 });
  return fuzzyCustomers(name, all.map(toMatch));
}
