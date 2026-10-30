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
});
export type IntentParams = z.infer<typeof intentParamsSchema>;

export const intentSchema = z.object({ intent: z.enum(INTENTS), params: intentParamsSchema.default({}), confidence: z.number().min(0).max(1).default(0.5) });

export type IntentResult = { intent: Intent; params: IntentParams; confidence: number; needsConfirmation: boolean; source: "keywords" | "sarvam" | "none"; answer?: string };

export const NEEDS_CONFIRMATION: Intent[] = ["ADD_CREDIT", "RECORD_REPAYMENT", "REQUEST_REMINDER", "APPROVE_RECOMMENDATION", "CONFIRM"];

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

const amountOf = (t: string) => {
  const m = t.match(/(?:₹|rs\.?\s*)?(\d[\d,]*)(?:\s*(?:rupaye|rupees|rupee|rupay|rs|रुपये|रुपए))?/);
  const n = m ? Number(m[1].replace(/,/g, "")) : NaN;
  return Number.isFinite(n) && n > 0 ? n * 100 : undefined;
};

/** "Rahul ka ...", "Ramesh ji ko ...", "राहुल का ...", "in Rahul's account", "... for Rahul". Returns up to two words, without "ji". */
const nameOf = (raw: string) => {
  const t = raw.trim();
  const inAccount = t.match(/\b(?:in|to|for)\s+([\p{L}\p{M}]+(?: [\p{L}\p{M}]+)?)(?:'s|\s+ke|\s+ki|\s+ka)?\s+(?:account|khate|wallet|ledger)\b/iu);
  if (inAccount) return inAccount[1].trim();
  const before = t.match(/^(?:mera |meri )?([\p{L}\p{M}]+(?: [\p{L}\p{M}]+)?)\s+(?:ji\s+|जी\s+)?(?:ka|ki|ko|ne|ke|का|की|को|ने|के)\s/u);
  if (before) return before[1].replace(/\s+(ji|जी)$/u, "").trim();
  const after = t.match(/\b(?:for|to|from|in)\s+([\p{L}\p{M}]+(?: [\p{L}\p{M}]+)?)\s*$/iu) ?? t.match(/\b(?:for|to|from|in)\s+([\p{L}\p{M}]+)/iu);
  return after ? after[1].trim() : undefined;
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

export const SLOT_INTENTS = ["ADD_CREDIT", "RECORD_REPAYMENT"] as const;
export type SlotIntent = (typeof SLOT_INTENTS)[number];
/** What an unfinished ledger command still had when the app asked its follow-up question. */
export type Pending = { intent: SlotIntent; customerName?: string; amountPaise?: number };
type Lang = "HINDI" | "HINGLISH" | "ENGLISH";

const CONFIRM_ONLY = /^(haan|haa|han|ha|ji haan|yes|ok|okay|theek hai|thik hai|nahi|no|हाँ|हां|नहीं|ठीक है)( ji| जी)?$/;
const FILLER = new Set(["ji", "ka", "ki", "ke", "ko", "ne", "account", "khata", "khate", "mein", "me", "naam", "name", "hai", "likho", "add", "karo", "rupaye", "rupees", "rs", "जी", "का", "की", "के", "को", "ने", "खाते", "में", "है", "रुपये", "रुपए"]);

/** Which required detail a ledger command still lacks: the customer first, then the amount. */
export function missingSlot(r: { intent: Intent; params: IntentParams }): "customer" | "amount" | null {
  if (!(SLOT_INTENTS as readonly string[]).includes(r.intent)) return null;
  if (!r.params.customerName) return "customer";
  if (!r.params.amountPaise) return "amount";
  return null;
}

/**
 * Merges a short answer ("Rahul", "500 rupaye", "राहुल 500") into the pending command from the previous turn.
 * Returns null when the new text is its own command (so it is handled normally) or adds nothing.
 */
export function fillSlots(text: string, pending: Pending, current: IntentResult | null): IntentResult | null {
  const t = norm(text);
  if (!t || CONFIRM_ONLY.test(t)) return null;
  // A new, different command wins over the old question.
  if (current && current.intent !== "UNKNOWN" && current.intent !== pending.intent && current.intent !== "GET_CUSTOMER_BALANCE") return null;
  const amount = current?.params.amountPaise ?? amountOf(t);
  let name = current?.params.customerName ?? nameOf(text);
  if (!name) {
    const bare = text.replace(/[₹\d०-९,.]+/g, " ").split(/\s+/).filter((w) => w && !FILLER.has(w.toLowerCase())).join(" ");
    if (bare && bare.split(" ").length <= 2 && /^[\p{L}\p{M} ]+$/u.test(bare)) name = bare;
  }
  const params: IntentParams = { customerName: pending.customerName ?? name, amountPaise: pending.amountPaise ?? amount };
  if (params.customerName === pending.customerName && params.amountPaise === pending.amountPaise) return null;
  return { intent: pending.intent, params, confidence: 0.85, needsConfirmation: true, source: "keywords" };
}

const ASK: Record<"customer" | "amount", Record<SlotIntent, Record<Lang, (name: string) => string>>> = {
  customer: {
    ADD_CREDIT: { HINGLISH: () => "Kiske khate mein likhna hai?", HINDI: () => "किसके खाते में लिखना है?", ENGLISH: () => "Which customer's account should I add it to?" },
    RECORD_REPAYMENT: { HINGLISH: () => "Kisne paise diye?", HINDI: () => "किसने पैसे दिए?", ENGLISH: () => "Which customer paid?" },
  },
  amount: {
    ADD_CREDIT: { HINGLISH: (n) => `${n} ke khate mein kitne rupaye likhne hain?`, HINDI: (n) => `${n} के खाते में कितने रुपये लिखने हैं?`, ENGLISH: (n) => `How much should I add to ${n}'s account?` },
    RECORD_REPAYMENT: { HINGLISH: (n) => `${n} ne kitne rupaye diye?`, HINDI: (n) => `${n} ने कितने रुपये दिए?`, ENGLISH: (n) => `How much did ${n} pay?` },
  },
};

export const clarifyQuestion = (slot: "customer" | "amount", intent: SlotIntent, language: Lang, name = "") => ASK[slot][intent][language](name);

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

/** Collapses common speech-to-text spelling variants (aa/a, ee/i, sh/s, w/v, doubled letters). */
const phonetic = (s: string) =>
  s.toLowerCase().normalize("NFKC").replace(/aa/g, "a").replace(/ee|ii/g, "i").replace(/oo|uu/g, "u").replace(/sh/g, "s").replace(/w/g, "v").replace(/ph/g, "f").replace(/(.)\1+/g, "$1").replace(/[^\p{L}\p{M} ]/gu, "").trim();

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
