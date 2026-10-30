import { z } from "zod";
import type { DeclineReason } from "@/generated/prisma/enums";
import { DISCOUNT_LADDER_PCT, lowerStep } from "./economics";
import { TIP_FAMILIES, emptyFeedback, type Candidate, type TipFamily, type TipFeedback } from "./types";

/**
 * Merchant feedback → deterministic adjustments. Applied to later batches in the session and to
 * createAlternative. Nothing here calls an LLM; free-text notes are first matched by keywords and only
 * then (optionally) parsed by an LLM into `noteFeedbackSchema`, which is validated before use.
 */

const uniq = <T>(xs: T[]) => [...new Set(xs)];

export function parseFeedback(raw: unknown): TipFeedback {
  const base = emptyFeedback();
  if (!raw || typeof raw !== "object") return base;
  return { ...base, ...(raw as Partial<TipFeedback>) };
}

const discountOf = (c: Candidate | undefined) =>
  c?.offer.kind === "COUPON" ? c.offer.discountPct : c?.offer.kind === "COMBO" ? Math.round((1 - c.offer.comboPricePaise / c.offer.listPricePaise) * 100) : null;

/** One structured decline reason, optionally about a specific tip (`target`). Returns a new feedback object. */
export function applySignal(fb: TipFeedback, reason: DeclineReason, target?: Candidate): TipFeedback {
  const next: TipFeedback = { ...fb, notes: [...fb.notes] };
  const note = (s: string) => next.notes.push(s);
  switch (reason) {
    case "COST_TOO_HIGH": {
      const current = discountOf(target) ?? fb.maxDiscountPct ?? DISCOUNT_LADDER_PCT[2];
      const lower = lowerStep(Math.min(current, fb.maxDiscountPct ?? Infinity));
      if (lower !== null) {
        next.maxDiscountPct = lower;
        note(`Discount lowered to at most ${lower}% (cost too high).`);
      } else {
        next.audienceShrink = fb.audienceShrink + 1;
        note("Audience halved to the most valuable customers (cost too high).");
      }
      break;
    }
    case "BENEFIT_UNCLEAR":
      if (target) next.demoteFamilies = uniq([...fb.demoteFamilies, target.family]);
      next.preferLargeAudience = true;
      note(`Preferring tips with larger audiences and stronger evidence${target ? `; fewer ${target.family.toLowerCase().replace("_", " ")} tips` : ""}.`);
      break;
    case "WRONG_AUDIENCE":
      if (target && (target.audienceRule === "spend" || target.audienceRule === "frequency")) {
        next.audienceRule = target.audienceRule === "spend" ? "frequency" : "spend";
        note(`Audience rule switched to ${next.audienceRule === "frequency" ? "most frequent buyers" : "highest spenders"}.`);
      } else if (target) {
        next.excludeCustomerIds = uniq([...fb.excludeCustomerIds, ...target.audience.map((a) => a.customerId)]);
        note(`${target.audience.length} customers from that tip excluded.`);
      }
      break;
    case "BAD_TIMING":
      if (target?.offer.kind === "COUPON" && target.offer.timeWindow) {
        next.excludeSlots = uniq([...fb.excludeSlots, `${target.offer.timeWindow.dow}:${target.offer.timeWindow.startHour}`]);
        note("A different time slot will be suggested.");
      } else if (target?.family === "FESTIVE") {
        const key = target.key.split(":")[1];
        const days = typeof target.evidence.daysUntilFestival === "number" ? target.evidence.daysUntilFestival : 99;
        if (days <= 7 && key) {
          next.excludeFestivals = uniq([...fb.excludeFestivals, key]);
          note("That festival is too close; the next festival will be suggested.");
        } else {
          next.validityShiftDays = fb.validityShiftDays + 3;
          note("Offer start moved 3 days later.");
        }
      } else {
        next.validityShiftDays = fb.validityShiftDays + 7;
        note("Offer start moved 7 days later.");
      }
      break;
    case "OPERATIONAL_CONSTRAINT":
      if (target?.productIds.length) {
        next.excludeProductIds = uniq([...fb.excludeProductIds, ...target.productIds]);
        note("Products from that tip excluded.");
      } else if (target?.categories.length) {
        next.excludeCategories = uniq([...fb.excludeCategories, ...target.categories]);
        note(`Categories excluded: ${target.categories.join(", ")}.`);
      }
      break;
    case "DO_NOT_CONTACT":
      if (target) {
        next.excludeCustomerIds = uniq([...fb.excludeCustomerIds, ...target.audience.map((a) => a.customerId)]);
        note(`${target.audience.length} customers will not be contacted again in this session.`);
      }
      break;
    case "OTHER":
      break;
  }
  return next;
}

/** Structured shape an LLM may return for a free-text note. Invalid output is ignored. */
export const noteFeedbackSchema = z.object({
  excludeFamilies: z.array(z.enum(TIP_FAMILIES)).max(8).default([]),
  preferFamilies: z.array(z.enum(TIP_FAMILIES)).max(8).default([]),
  maxDiscountPct: z.number().int().min(0).max(50).nullable().optional(),
  excludeCustomerNames: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  excludeCategories: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
  timing: z.enum(["later", "earlier"]).nullable().optional(),
});
export type NoteFeedback = z.infer<typeof noteFeedbackSchema>;

/** Merges parsed note feedback, keeping only categories and customers that really exist in the snapshot. */
export function applyNote(fb: TipFeedback, n: NoteFeedback, known: { categories: string[]; customers: { id: string; name: string }[] }): TipFeedback {
  const next: TipFeedback = { ...fb, notes: [...fb.notes] };
  const lowerCats = new Map(known.categories.map((c) => [c.toLowerCase(), c]));
  const cats = n.excludeCategories.flatMap((c) => lowerCats.get(c.toLowerCase()) ?? []);
  const names = new Set(n.excludeCustomerNames.map((s) => s.toLowerCase()));
  const ids = known.customers.filter((c) => names.has(c.name.toLowerCase())).map((c) => c.id);
  if (n.excludeFamilies.length) next.excludeFamilies = uniq([...fb.excludeFamilies, ...n.excludeFamilies]);
  if (n.preferFamilies.length) next.preferFamilies = uniq([...fb.preferFamilies, ...n.preferFamilies]);
  if (typeof n.maxDiscountPct === "number") next.maxDiscountPct = Math.min(fb.maxDiscountPct ?? 100, n.maxDiscountPct);
  if (cats.length) next.excludeCategories = uniq([...fb.excludeCategories, ...cats]);
  if (ids.length) next.excludeCustomerIds = uniq([...fb.excludeCustomerIds, ...ids]);
  if (n.timing === "later") next.validityShiftDays = fb.validityShiftDays + 7;
  const parts = [
    n.excludeFamilies.length && `skip ${n.excludeFamilies.join(", ")}`,
    n.preferFamilies.length && `prefer ${n.preferFamilies.join(", ")}`,
    typeof n.maxDiscountPct === "number" && `discount at most ${n.maxDiscountPct}%`,
    cats.length && `exclude ${cats.join(", ")}`,
    ids.length && `exclude ${ids.length} named customers`,
    n.timing === "later" && "start later",
  ].filter(Boolean);
  if (parts.length) next.notes.push(`From your note: ${parts.join("; ")}.`);
  return next;
}

const FAMILY_WORDS: [TipFamily, RegExp][] = [
  ["LOYALTY", /loyal|regular|best customer|vip|purane grahak|पुराने|वफादार/i],
  ["FESTIVE", /festiv|festival|tyohar|tyohaar|त्योहार|diwali|दिवाली|holi|होली/i],
  ["OFF_PEAK", /off.?peak|happy hour|khali|khaali|खाली|quiet|low hour/i],
  ["WINBACK", /win.?back|inactive|nahi aaye|नहीं आए/i],
  ["BUNDLE", /bundle|combo|कॉम्बो/i],
  ["CREDIT_REMINDER", /udhaar|udhar|उधार|reminder|बकाया/i],
];

/** Free keyword pass over a note (Hindi, Hinglish, English). Returns null when nothing is recognised. */
export function keywordNote(note: string): { reasons: DeclineReason[]; note: NoteFeedback } | null {
  const t = note.toLowerCase();
  const reasons: DeclineReason[] = [];
  if (/(discount|chhoot|chhut|छूट|cost|mehenga|mehnga|महंगा).*(zyada|jyada|high|much|ज़्यादा|ज्यादा|kam karo|kam)|too expensive|costly/i.test(t)) reasons.push("COST_TOO_HIGH");
  if (/(wrong|galat|गलत).*(customer|grahak|ग्राहक|audience)|ye customers nahi|these customers no/i.test(t)) reasons.push("WRONG_AUDIENCE");
  if (/(timing|time|samay|समय|abhi nahi|later|baad mein|बाद में)/i.test(t)) reasons.push("BAD_TIMING");
  if (/(stock|maal|माल).*(nahi|khatam|no|out|नहीं)|out of stock/i.test(t)) reasons.push("OPERATIONAL_CONSTRAINT");
  if (/(contact|message|msg|sms|whatsapp).*(mat|nahi|don'?t|no|नहीं)|do not contact/i.test(t)) reasons.push("DO_NOT_CONTACT");
  const mentioned = FAMILY_WORDS.filter(([, re]) => re.test(t)).map(([f]) => f);
  const negative = /\b(nahi|no|don'?t|skip|mat)\b|नहीं|बिना/i.test(t);
  const pct = t.match(/(\d{1,2})\s*(%|percent|pratishat|प्रतिशत)/);
  const parsed: NoteFeedback = {
    excludeFamilies: negative ? mentioned : [],
    preferFamilies: negative || reasons.length ? [] : mentioned,
    maxDiscountPct: pct ? Number(pct[1]) : null,
    excludeCustomerNames: [],
    excludeCategories: [],
    timing: /later|baad mein|बाद में/i.test(t) ? "later" : null,
  };
  const any = reasons.length || parsed.excludeFamilies.length || parsed.preferFamilies.length || parsed.maxDiscountPct !== null || parsed.timing;
  return any ? { reasons, note: parsed } : null;
}
