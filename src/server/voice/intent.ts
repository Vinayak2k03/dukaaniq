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

export type IntentResult = { intent: Intent; params: IntentParams; confidence: number; needsConfirmation: boolean; source: "keywords" | "sarvam" | "none" };

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
  const inAccount = t.match(/\b(?:in|to|for)\s+([\p{L}]+(?: [\p{L}]+)?)(?:'s|\s+ke|\s+ki|\s+ka)?\s+(?:account|khate|wallet|ledger)\b/iu);
  if (inAccount) return inAccount[1].trim();
  const before = t.match(/^(?:mera |meri )?([\p{L}]+(?: [\p{L}]+)?)\s+(?:ji\s+|जी\s+)?(?:ka|ki|ko|ne|ke|का|की|को|ने|के)\s/u);
  if (before) return before[1].replace(/\s+(ji|जी)$/u, "").trim();
  const after = t.match(/\b(?:for|to|from|in)\s+([\p{L}]+(?: [\p{L}]+)?)\s*$/iu) ?? t.match(/\b(?:for|to|from|in)\s+([\p{L}]+)/iu);
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
  if (/(sale|sales|bikri|बिक्री|सेल|kamai|कमाई|dhanda|revenue)/.test(t)) {
    const range = /hafte|week|7 din|हफ्ते/.test(t) ? "7d" : /mahine|month|30 din|महीने/.test(t) ? "30d" : "today";
    return result("GET_SALES_SUMMARY", { range });
  }
  return null;
}

export const unknownIntent = (): IntentResult => ({ intent: "UNKNOWN", params: {}, confidence: 0, needsConfirmation: false, source: "none" });
