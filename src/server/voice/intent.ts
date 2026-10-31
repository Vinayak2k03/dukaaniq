import { z } from "zod";
import type { TipFamily } from "@/server/tips/types";

/**
 * Voice / typed command → intent (PRD 10.2 plus growth-tip intents). A free keyword matcher runs first;
 * an LLM is only asked when nothing matches, and its answer is validated with `intentSchema`.
 * Intents never act on their own: writes and approvals always need an on-screen confirmation, and a bare
 * "haan" / "yes" is CONFIRM, which is never treated as approval without a pending, visible action (PRD 10.3).
 */

export const INTENTS = [
  "GET_TIPS",
  "GET_MORE_TIPS",
  "GET_TIPS_FOR",
  "TIP_FEEDBACK",
  "GET_SALES_SUMMARY",
  "GET_INACTIVE_CUSTOMERS",
  "GET_CUSTOMER_BALANCE",
  "ASK_DATA",
  "ADD_CREDIT",
  "RECORD_REPAYMENT",
  "REQUEST_REMINDER",
  "CREATE_OFFER",
  "ADD_PRODUCT",
  "ADD_CUSTOMER",
  "RECORD_SALE",
  "APPROVE_RECOMMENDATION",
  "CONFIRM",
  "UNKNOWN",
] as const;
export type Intent = (typeof INTENTS)[number];

export const FAMILIES = ["LOYALTY", "FESTIVE", "OFF_PEAK", "CREDIT_REMINDER", "WINBACK", "BUNDLE", "SLOW_MOVING", "PEAK_TIMING"] as const satisfies readonly TipFamily[];
const REASONS = ["COST_TOO_HIGH", "BENEFIT_UNCLEAR", "WRONG_AUDIENCE", "BAD_TIMING", "OPERATIONAL_CONSTRAINT", "DO_NOT_CONTACT", "OTHER"] as const;

export const intentParamsSchema = z.object({
  focus: z.array(z.enum(FAMILIES)).max(8).optional(),
  reason: z.enum(REASONS).optional(),
  note: z.string().max(300).optional(),
  customerName: z.string().trim().min(1).max(60).optional(),
  amountPaise: z.number().int().positive().max(100_000_000).optional(),
  range: z.enum(["today", "7d", "30d"]).optional(),
  discountPct: z.number().int().min(1).max(50).optional(),
  audience: z.enum(["LOYAL", "INACTIVE", "COOLING", "ACTIVE", "ALL"]).optional(),
});
export type IntentParams = z.infer<typeof intentParamsSchema>;

export const intentSchema = z.object({ intent: z.enum(INTENTS), params: intentParamsSchema.default({}), confidence: z.number().min(0).max(1).default(0.5) });

export type IntentResult = { intent: Intent; params: IntentParams; confidence: number; needsConfirmation: boolean; source: "keywords" | "sarvam" | "none"; answer?: string };

export const NEEDS_CONFIRMATION: Intent[] = ["ADD_CREDIT", "RECORD_REPAYMENT", "REQUEST_REMINDER", "CREATE_OFFER", "ADD_PRODUCT", "ADD_CUSTOMER", "RECORD_SALE", "APPROVE_RECOMMENDATION", "CONFIRM"];

/** Commands that create shop records. They are answered with a pre-filled review card, never saved by voice. */
export const RECORD_INTENTS = ["ADD_PRODUCT", "ADD_CUSTOMER", "RECORD_SALE"] as const satisfies readonly Intent[];
export type RecordIntent = (typeof RECORD_INTENTS)[number];

/** A question ("kitna becha?") is never a command to write something. */
const QUESTION = /(kitna|kitne|kitni|how much|how many|kaun|\bkon\b|which|\bwhat\b|\bkya\b|कितना|कितने|कितनी|कौन|क्या)/;
const CREDIT_WORD = /(udhaar|udhar|उधार|credit|reminder|repay)/;
const ADD_VERB = String.raw`(add|jodo|jod do|joddo|banao|bana do|daalo|dalo|daal do|likho|save|darj|जोड़ो|जोड़ दो|बनाओ|डालो|लिखो|सेव)`;
const NEW_CUSTOMER = new RegExp(String.raw`(naya|nayi|new|नया|नई).{0,12}(customer|grahak|ग्राहक)|(customer|grahak|ग्राहक).{0,30}${ADD_VERB}|add .{0,30}(customer|grahak)`);
const NEW_PRODUCT = new RegExp(String.raw`(naya|new|नया).{0,12}(product|item|saman|सामान|प्रोडक्ट|maal)|(product|item|saman|सामान|प्रोडक्ट).{0,30}${ADD_VERB}|add .{0,30}(product|item)`);
/** "Rahul ne 1 kg cheeni li": a buyer, then what they took. */
const BOUGHT = /(\bne\b|ने).{1,40}(\s|^)(li|liya|liye|le gaya|le gaye|le gayi|लिया|ली|लिए|ले गया)(\s|$)/;
const SOLD = /(becha|beche|bechi|bech diya|bech diye|\bbika\b|\bbike\b|bik gaya|bik gaye|\bsold\b|sell kiya|sale (hui|hua|kiya|ki\b|karo|likho|add|darj)|kharida|kharidi|kharide|kharid liya|ne liya|ne liye|ne li\b|bill (banao|bana do|banaiye|likho)|बेचा|बेचे|बेची|बिका|बिके|खरीदा|खरीदी|खरीदे|बिल बनाओ)/;

const DEV = "०१२३४५६७८९";
const norm = (t: string) =>
  t
    .toLowerCase()
    .replace(/[०-९]/g, (d) => String(DEV.indexOf(d)))
    .replace(/[?.!,।]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const FOCUS_WORDS: [TipFamily, RegExp][] = [
  ["FESTIVE", /festiv|festival|tyohar|tyohaar|त्योहार|त्यौहार|diwali|दिवाली|holi|होली|eid|ईद|chhath|छठ/],
  ["LOYALTY", /loyal|regular|best customer|vip|purane grahak|pakke grahak|पुराने ग्राहक|पक्के ग्राहक|वफादार/],
  ["OFF_PEAK", /khali time|khaali time|khali samay|खाली समय|खाली टाइम|low hour|quiet hour|off.?peak|happy hour|kam bheed|कम भीड़/],
  ["WINBACK", /nahi aa rahe|nahi aaye|नहीं आ रहे|नहीं आए|win.?back|inactive|wapas/],
  ["BUNDLE", /combo|bundle|कॉम्बो/],
  ["CREDIT_REMINDER", /udhaar|udhar|उधार|reminder/],
];

const DISCOUNT_WORD = /(discount|offer|ऑफर|छूट|chhoot|chhut|coupon|कूपन|\d\s*%|percent|प्रतिशत|\boff\b)/;

/** "25% off", "25 percent discount", "२५ प्रतिशत छूट", "discount 25". Only 1 to 50 counts as a discount. */
export function discountPctOf(t: string): number | undefined {
  const m = t.match(/(\d{1,2})\s*(?:%|percent|pratishat|prathishat|प्रतिशत|फीसदी|fisadi|\boff\b)/) ?? t.match(/(?:discount|chhoot|chhut|छूट|off)\s*(?:of\s*)?(\d{1,2})\b/);
  const n = m ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 50 ? n : undefined;
}

/** Which group of customers an offer is for, from the words used. Order matters: "inactive" before "all". */
export function audienceOfText(t: string): IntentParams["audience"] {
  if (/(inactive|nahi aa rahe|nahi aaye|नहीं आ|win.?back|lapsed|wapas|दूर हो गए|chhod)/.test(t)) return "INACTIVE";
  if (/(loyal|regular|best customer|vip|top customer|purane grahak|pakke grahak|पुराने ग्राहक|पक्के ग्राहक|वफादार|नियमित)/.test(t)) return "LOYAL";
  if (/(cooling|kam aa rahe|kam aate)/.test(t)) return "COOLING";
  if (/(\bactive\b|abhi aa rahe|current customer)/.test(t)) return "ACTIVE";
  if (/(\ball\b|everyone|sabhi|\bsab\b|saare|sare|har customer|har grahak|सभी|सब|सारे|हर ग्राहक)/.test(t)) return "ALL";
  return undefined;
}

const amountOf = (t: string) => {
  const m = t.match(/(?:₹|rs\.?\s*)?(\d[\d,]*)(?:\s*(?:rupaye|rupees|rupee|rupay|rs|रुपये|रुपए))?/);
  const n = m ? Number(m[1].replace(/,/g, "")) : NaN;
  return Number.isFinite(n) && n > 0 ? n * 100 : undefined;
};

/** Words that stand for "a customer" without naming one ("ek customer ko reminder", "kisi ko"). */
const GENERIC_NAME = new Set(["ek", "koi", "kisi", "kuch", "customer", "customers", "grahak", "ग्राहक", "एक", "कोई", "किसी", "sab", "sabhi", "all", "a", "any", "my", "mera", "meri", "credit", "overdue", "udhaar", "udhar", "उधार", "payment", "the", "someone", "him", "her", "i", "he", "she", "they", "who", "unko", "usko", "inko"]);

/** "Rahul ka ...", "Ramesh ji ko ...", "राहुल का ...", "in Rahul's account", "... for Rahul". Returns up to two words, without "ji". */
const rawNameOf = (raw: string) => {
  const t = raw.trim();
  const inAccount = t.match(/\b(?:in|to|for)\s+([\p{L}\p{M}]+(?: [\p{L}\p{M}]+)?)(?:'s|\s+ke|\s+ki|\s+ka)?\s+(?:account|khate|wallet|ledger)\b/iu);
  if (inAccount) return inAccount[1].trim();
  const before = t.match(/^(?:mera |meri )?([\p{L}\p{M}]+(?: [\p{L}\p{M}]+)?)\s+(?:ji\s+|जी\s+)?(?:ka|ki|ko|ne|ke|का|की|को|ने|के)\s/u);
  if (before) return before[1].replace(/\s+(ji|जी)$/u, "").trim();
  const subject = t.match(/^([\p{L}\p{M}]+(?: [\p{L}\p{M}]+)?)\s+(?:(?:has|have|had)\s+)?(?:paid|repaid|returned|gave|given|cleared|settled|deposited)\b/iu);
  if (subject) return subject[1].replace(/\s+(has|have|had)$/i, "").trim();
  const after = t.match(/\b(?:for|to|from|in)\s+([\p{L}\p{M}]+(?: [\p{L}\p{M}]+)?)\s*$/iu) ?? t.match(/\b(?:for|to|from|in)\s+([\p{L}\p{M}]+)/iu);
  return after ? after[1].trim() : undefined;
};
const nameOf = (raw: string) => {
  const n = rawNameOf(raw);
  return n && n.toLowerCase().split(/\s+/).every((w) => GENERIC_NAME.has(w)) ? undefined : n;
};

const result = (intent: Intent, params: IntentParams = {}, confidence = 0.9): IntentResult => ({ intent, params, confidence, needsConfirmation: NEEDS_CONFIRMATION.includes(intent), source: "keywords" });

/** Keyword / regex matcher for Hindi (Devanagari), Hinglish and English. Returns null when nothing matches. */
export function matchIntent(input: string): IntentResult | null {
  const t = norm(input);
  if (!t) return null;
  const original = input.trim();

  if (/^(haan|haa|han|ha|ji haan|yes|ok|okay|theek hai|thik hai|हाँ|हां|जी हाँ|ठीक है)( ji| जी)?$/.test(t)) return result("CONFIRM", {}, 0.95);

  if (/approve|manzoor|मंज़ूर|मंजूर|स्वीकार|pass kar/.test(t)) return result("APPROVE_RECOMMENDATION");

  if (/(aur|more|aage|next|और|दूसरे|doosre|dusre).{0,20}(tips?|tip|idea|sujhav|सुझाव|टिप)|tips?.{0,10}(aur|more|और)|show more/.test(t)) return result("GET_MORE_TIPS");

  if (/(discount|chhoot|chhut|छूट|kharcha|cost).{0,20}(zyada|jyada|ज़्यादा|ज्यादा|high|much|bahut)|too expensive|mehenga|महंगा/.test(t)) return result("TIP_FEEDBACK", { reason: "COST_TOO_HIGH", note: original });
  if (/(ye|yeh|these|ये|इन).{0,15}(customers?|grahak|ग्राहक).{0,15}(nahi|not|no|नहीं|galat|गलत)|wrong customers?/.test(t)) return result("TIP_FEEDBACK", { reason: "WRONG_AUDIENCE", note: original });
  if (/(abhi nahi|baad mein|later|sahi time nahi|timing (galat|theek nahi)|बाद में|अभी नहीं)/.test(t) && /(offer|tip|discount|छूट|ऑफर)/.test(t)) return result("TIP_FEEDBACK", { reason: "BAD_TIMING", note: original });
  if (/(message|msg|contact|sampark|संपर्क).{0,20}(mat|nahi|don'?t|मत|नहीं)/.test(t)) return result("TIP_FEEDBACK", { reason: "DO_NOT_CONTACT", note: original });

  // "25% off for loyal customers", "discount ka message bhejna hai": the owner wants a discount sent to customers.
  // That is an offer proposal, never a payment reminder; "loyal customers ke liye offer" without a number stays a tips request.
  const pct = discountPctOf(t);
  if (DISCOUNT_WORD.test(t) && (pct !== undefined || /(reminder|message|msg|bhej|भेज|रिमाइंडर|send|banao|बनाओ|create)/.test(t))) return result("CREATE_OFFER", { discountPct: pct, audience: audienceOfText(t) }, pct ? 0.9 : 0.7);

  // Creating records: a new customer or product, or a bill. Questions ("kitna becha?") fall through to the summaries below.
  if (!QUESTION.test(t)) {
    if (NEW_CUSTOMER.test(t) && !CREDIT_WORD.test(t)) return result("ADD_CUSTOMER");
    if (NEW_PRODUCT.test(t)) return result("ADD_PRODUCT");
    if ((SOLD.test(t) || BOUGHT.test(t)) && !/(udhaar|udhar|उधार)\s*(liya|li|liye|le gaya|le gaye|लिया)/.test(t)) return result("RECORD_SALE");
  }

  const focus = FOCUS_WORDS.filter(([, re]) => re.test(t)).map(([f]) => f);
  const wantsTips = /tips?|tip do|idea|sujhav|सुझाव|टिप|offer|ऑफर|business kaise badh|dhanda kaise badh|धंधा|बिज़नेस|बिजनेस|grow|badhaun|badhau|बढ़ाऊं|बढ़ाएं|kya karu|kya karun|क्या करूं|what should i do/.test(t);
  if (wantsTips && focus.length && !/udhaar add|udhaar likh|de diye|reminder bhej/.test(t)) return result("GET_TIPS_FOR", { focus });
  if (wantsTips) return result("GET_TIPS");

  const amount = amountOf(t);
  if (/(de diye|de diya|lauta|wapas kiye|chuka|jama kiye|paid|repaid|repayment|दे दिए|दे दिया|चुका|लौटा)/.test(t)) return result("RECORD_REPAYMENT", { customerName: nameOf(original), amountPaise: amount }, amount ? 0.85 : 0.6);
  if (/(udhaar|udhar|उधार|credit).{0,25}(add|likh|likho|jodo|daalo|दर्ज|लिखो|जोड़ो|डालो|de do|diya)|add .{0,20}(credit|udhaar)/.test(t)) return result("ADD_CREDIT", { customerName: nameOf(original), amountPaise: amount }, amount ? 0.85 : 0.6);
  if (/(reminder|yaad dila|याद दिला|रिमाइंडर)/.test(t)) return result("REQUEST_REMINDER", { customerName: nameOf(original) });
  if (/(kitna|kitne|how much|कितना|कितने).{0,25}(udhaar|udhar|baaki|baki|उधार|बाकी|balance|owe)|balance of|(udhaar|उधार).{0,10}(kitna|कितना)/.test(t)) return result("GET_CUSTOMER_BALANCE", { customerName: nameOf(original) });

  if (/(kaun|kon|which|कौन).{0,30}(nahi aaye|nahi aa rahe|not (come|visited)|नहीं आए|नहीं आ रहे)|inactive customers?|kaafi (time|din) se nahi/.test(t)) return result("GET_INACTIVE_CUSTOMERS");
  if (/(sale|sales|bikri|bikree|बिक्री|सेल|kamai|kamaai|कमाई|dhanda|dhandha|धंधा|revenue|income|kitna bika|kitna becha|बेचा|बिका)/.test(t)) {
    const range = /hafte|hafta|week|7 din|हफ्ते|हफ़्ते|सप्ताह/.test(t) ? "7d" : /mahine|mahina|month|30 din|महीने|महीना/.test(t) ? "30d" : "today";
    return result("GET_SALES_SUMMARY", { range });
  }
  return null;
}

export const unknownIntent = (): IntentResult => ({ intent: "UNKNOWN", params: {}, confidence: 0, needsConfirmation: false, source: "none" });

/* ---------- Conversational slot-filling ---------- */

/** Commands that need a customer (and, for ledger writes, an amount) before an on-screen action can be offered. */
export const SLOT_INTENTS = ["ADD_CREDIT", "RECORD_REPAYMENT", "REQUEST_REMINDER", "GET_CUSTOMER_BALANCE"] as const;
export type SlotIntent = (typeof SLOT_INTENTS)[number];
const NEEDS_AMOUNT: readonly Intent[] = ["ADD_CREDIT", "RECORD_REPAYMENT"];
/** What an unfinished ledger command still had when the app asked its follow-up question. */
export type Pending = { intent: SlotIntent | "CREATE_OFFER"; customerName?: string; amountPaise?: number; discountPct?: number; audience?: IntentParams["audience"] };
type Lang = "HINDI" | "HINGLISH" | "ENGLISH";

const strip = (t: string) => t.replace(/[?.!,।|]+/g, " ").replace(/\s+/g, " ").trim();
const CONFIRM_ONLY = /^(haan|haa|han|ha|ji haan|yes|ok|okay|theek hai|thik hai|nahi|no|हाँ|हां|नहीं|ठीक है)( ji| जी)?$/;
const FILLER = new Set(["ji", "ka", "ki", "ke", "ko", "ne", "account", "khata", "khate", "mein", "me", "naam", "name", "hai", "likho", "add", "karo", "rupaye", "rupees", "rs", "जी", "का", "की", "के", "को", "ने", "खाते", "में", "है", "रुपये", "रुपए"]);

/** Which required detail a ledger command still lacks: the customer first, then the amount. */
export function missingSlot(r: { intent: Intent; params: IntentParams }): "customer" | "amount" | null {
  if (!(SLOT_INTENTS as readonly string[]).includes(r.intent)) return null;
  if (!r.params.customerName) return "customer";
  if (NEEDS_AMOUNT.includes(r.intent) && !r.params.amountPaise) return "amount";
  return null;
}

/**
 * Merges a short answer ("Rahul", "500 rupaye", "राहुल 500") into the pending command from the previous turn.
 * Returns null when the new text is its own command (so it is handled normally) or adds nothing.
 */
export function fillSlots(text: string, pending: Pending, current: IntentResult | null): IntentResult | null {
  const t = norm(text);
  if (!t || CONFIRM_ONLY.test(t)) return null;
  if (pending.intent === "CREATE_OFFER") return fillOffer(t, pending, current);
  // A new, different command wins over the old question.
  if (current && current.intent !== "UNKNOWN" && current.intent !== pending.intent && current.intent !== "GET_CUSTOMER_BALANCE") return null;
  const amount = current?.params.amountPaise ?? amountOf(t);
  let name = current?.params.customerName ?? nameOf(text);
  if (!name) {
    const bare = strip(text).replace(/[₹\d०-९]+/g, " ").split(/\s+/).filter((w) => w && !FILLER.has(w.toLowerCase())).join(" ");
    if (bare && bare.split(" ").length <= 2 && /^[\p{L}\p{M} ]+$/u.test(bare)) name = bare;
  }
  const params: IntentParams = { customerName: pending.customerName ?? name, ...(NEEDS_AMOUNT.includes(pending.intent) ? { amountPaise: pending.amountPaise ?? amount } : {}) };
  if (!params.customerName && !params.amountPaise) return null;
  if (params.customerName === pending.customerName && params.amountPaise === pending.amountPaise) return null;
  return { intent: pending.intent, params, confidence: 0.85, needsConfirmation: true, source: "keywords" };
}

type Ask = Record<Lang, (name: string) => string>;
/** Which detail an offer command still lacks: the percentage, then the customer group. */
export function missingOfferSlot(p: { discountPct?: number; audience?: IntentParams["audience"] }): "percent" | "audience" | null {
  return p.discountPct === undefined ? "percent" : p.audience === undefined ? "audience" : null;
}

/** "25", "25%" or "loyal" / "inactive" / "sabhi" answering the previous offer question. A different command wins. */
function fillOffer(t: string, pending: Pending, current: IntentResult | null): IntentResult | null {
  if (current && current.intent !== "UNKNOWN" && current.intent !== "CREATE_OFFER") return null;
  const bare = t.match(/^(\d{1,2})$/);
  const discountPct = pending.discountPct ?? discountPctOf(t) ?? (bare ? discountPctOf(`${bare[1]} %`) : undefined);
  const audience = pending.audience ?? audienceOfText(t);
  if (discountPct === pending.discountPct && audience === pending.audience) return null;
  return { intent: "CREATE_OFFER", params: { discountPct, audience }, confidence: 0.85, needsConfirmation: true, source: "keywords" };
}

const OFFER_ASK: Record<"percent" | "audience", Record<Lang, (pct?: number) => string>> = {
  percent: { HINGLISH: () => "Kitne percent ki chhoot dena chahte hain? (jaise 10, 15 ya 25)", HINDI: () => "कितने प्रतिशत की छूट देना चाहते हैं? (जैसे 10, 15 या 25)", ENGLISH: () => "How much discount do you want to give, in percent? (for example 10, 15 or 25)" },
  audience: {
    HINGLISH: (p) => `${p}% off kin customers ke liye? Loyal, inactive (jo nahi aa rahe), active ya sabhi customers?`,
    HINDI: (p) => `${p}% छूट किन ग्राहकों के लिए? लॉयल, इनएक्टिव (जो नहीं आ रहे), एक्टिव या सभी ग्राहक?`,
    ENGLISH: (p) => `Who should get ${p}% off: loyal, inactive (stopped coming), active or all customers?`,
  },
};
export const clarifyOffer = (slot: "percent" | "audience", language: Lang, pct?: number) => OFFER_ASK[slot][language](pct);

const ASK: { customer: Record<SlotIntent, Ask>; amount: Partial<Record<SlotIntent, Ask>> } = {
  customer: {
    REQUEST_REMINDER: { HINGLISH: () => "Kis customer ko payment reminder bhejna hai?", HINDI: () => "किस ग्राहक को पेमेंट रिमाइंडर भेजना है?", ENGLISH: () => "Which customer should I prepare the payment reminder for?" },
    GET_CUSTOMER_BALANCE: { HINGLISH: () => "Kis customer ka udhaar dekhna hai?", HINDI: () => "किस ग्राहक का उधार देखना है?", ENGLISH: () => "Which customer's udhaar do you want to check?" },
    ADD_CREDIT: { HINGLISH: () => "Kiske khate mein likhna hai?", HINDI: () => "किसके खाते में लिखना है?", ENGLISH: () => "Which customer's account should I add it to?" },
    RECORD_REPAYMENT: { HINGLISH: () => "Kisne paise diye?", HINDI: () => "किसने पैसे दिए?", ENGLISH: () => "Which customer paid?" },
  },
  amount: {
    ADD_CREDIT: { HINGLISH: (n) => `${n} ke khate mein kitne rupaye likhne hain?`, HINDI: (n) => `${n} के खाते में कितने रुपये लिखने हैं?`, ENGLISH: (n) => `How much should I add to ${n}'s account?` },
    RECORD_REPAYMENT: { HINGLISH: (n) => `${n} ne kitne rupaye diye?`, HINDI: (n) => `${n} ने कितने रुपये दिए?`, ENGLISH: (n) => `How much did ${n} pay?` },
  },
};

export const clarifyQuestion = (slot: "customer" | "amount", intent: SlotIntent, language: Lang, name = "") => (ASK[slot][intent] ?? ASK.customer[intent])[language](name);

const NOT_FOUND: Record<Lang, (n: string) => string> = {
  HINGLISH: (n) => `"${n}" naam ka koi customer nahi mila. Customer ka naam dobara batayein?`,
  HINDI: (n) => `"${n}" नाम का कोई ग्राहक नहीं मिला। ग्राहक का नाम फिर से बताइए?`,
  ENGLISH: (n) => `I couldn't find a customer called "${n}". Which customer did you mean?`,
};
export const notFoundQuestion = (name: string, language: Lang) => NOT_FOUND[language](name);

/* ---------- Fuzzy customer names ---------- */

const levenshtein = (a: string, b: string) => {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
};

const DEV_CONS: Record<string, string> = { क: "k", ख: "kh", ग: "g", घ: "gh", ङ: "n", च: "ch", छ: "chh", ज: "j", झ: "jh", ञ: "n", ट: "t", ठ: "th", ड: "d", ढ: "dh", ण: "n", त: "t", थ: "th", द: "d", ध: "dh", न: "n", प: "p", फ: "f", ब: "b", भ: "bh", म: "m", य: "y", र: "r", ल: "l", व: "v", श: "sh", ष: "sh", स: "s", ह: "h", ळ: "l", "\u095C": "d", "\u095D": "dh", "\u095E": "f", "\u0958": "k", "\u0959": "kh", "\u095A": "g", "\u095B": "z", "\u095F": "y" };
const DEV_VOWEL: Record<string, string> = { अ: "a", आ: "a", इ: "i", ई: "i", उ: "u", ऊ: "u", ए: "e", ऐ: "ai", ओ: "o", औ: "au", ऋ: "ri", ऑ: "o", ॲ: "e" };
const DEV_MATRA: Record<string, string> = { "ा": "a", "ि": "i", "ी": "i", "ु": "u", "ू": "u", "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ृ": "ri", "ॉ": "o", "ॅ": "e" };

/** Devanagari → rough Latin sound ("कविता चोपड़ा" → "kavita chopda") so Hindi-script names can be compared with names stored in English. Other text passes through. */
export function romanize(text: string): string {
  const cs = [...text.normalize("NFC")];
  let out = "";
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    if (c in DEV_CONS) {
      const afterVowel = /[aeiou]$/.test(out);
      out += DEV_CONS[c];
      while (cs[i + 1] === "\u093C") i++;
      const n = cs[i + 1];
      if (n && n in DEV_MATRA) out += DEV_MATRA[cs[++i]];
      else if (n === "\u094D") i++;
      else if (n && /[\p{L}\p{M}]/u.test(n)) {
        // Hindi drops the silent "a" in the middle of a word (चोपड़ा = "chopda"): when a vowel came before and the next consonant carries its own vowel sign.
        let j = i + 1;
        while (cs[j + 1] === "\u093C") j++;
        const dropped = afterVowel && cs[i + 1] in DEV_CONS && cs[j + 1] !== undefined && cs[j + 1] in DEV_MATRA;
        if (!dropped) out += "a";
      }
    } else if (c in DEV_VOWEL) out += DEV_VOWEL[c];
    else if (c === "ं" || c === "ँ") out += "n";
    else if (c === "ः") out += "h";
    else if (c !== "\u093C" && c !== "\u094D") out += c;
  }
  return out;
}

/** Collapses common speech-to-text spelling variants (aa/a, ee/i, sh/s, w/v, doubled letters). */
export const phonetic = (s: string) =>
  romanize(s).toLowerCase().normalize("NFKC").replace(/aa/g, "a").replace(/ee|ii/g, "i").replace(/oo|uu/g, "u").replace(/sh/g, "s").replace(/w/g, "v").replace(/ph/g, "f").replace(/(.)\1+/g, "$1").replace(/[^\p{L}\p{M} ]/gu, "").trim();

/**
 * 0..1 similarity between a heard name and a stored one. Each heard word is compared with the closest word of the
 * stored name, so "Rahul" matches "Rahul Sharma" and "Raahul" / "Rahool" still match "Rahul".
 */
export function nameSimilarity(heard: string, stored: string): number {
  const h = phonetic(heard).split(" ").filter(Boolean);
  const s = phonetic(stored).split(" ").filter(Boolean);
  if (!h.length || !s.length) return 0;
  const scores = h.map((w) => Math.max(...s.map((x) => 1 - levenshtein(w, x) / Math.max(w.length, x.length))));
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

/** Best fuzzy matches above `min`, closest first. */
export function fuzzyCustomers<T extends { name: string }>(heard: string, list: T[], min = 0.75, take = 3): T[] {
  return list
    .map((c) => ({ c, score: nameSimilarity(heard, c.name) }))
    .filter((x) => x.score >= min)
    .sort((a, b) => b.score - a.score)
    .slice(0, take)
    .map((x) => x.c);
}
