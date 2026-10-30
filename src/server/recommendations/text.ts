export type Language = "HINDI" | "HINGLISH" | "ENGLISH";
export type Tone = "standard" | "softer";

export type MessageFacts = { kind: "CREDIT_REMINDER"; language: Language; tone: Tone; shopName: string; amountRupees: string; dueDate: string };

export type ComposedMessage = { message: string; source: string };

/** A provider turns facts into customer-facing copy. The first provider that returns text wins; the template provider never fails. */
export type TextProvider = { name: string; compose(facts: MessageFacts): Promise<string | null> };

export const NAME_PLACEHOLDER = "{name}";

const fill = (t: string, v: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (m, k: string) => (k === "name" ? m : String(v[k] ?? m)));

export function templateMessage(f: MessageFacts): string {
  const v = { shop: f.shopName, amount: f.amountRupees, due: f.dueDate };
  const t = {
    standard: {
      ENGLISH: "Hello {name}, a gentle reminder from {shop}: {amount} has been pending since {due}. Please pay when convenient. Thank you!",
      HINGLISH: "Namaste {name} ji, {shop} ki taraf se ek chhoti si yaad: {amount} {due} se baaki hai. Suvidha anusaar chuka dein. Dhanyavaad!",
      HINDI: "नमस्ते {name} जी, {shop} की ओर से एक विनम्र याद: {amount} {due} से बकाया है। कृपया सुविधानुसार चुका दें। धन्यवाद!",
    },
    softer: {
      ENGLISH: "Hello {name}, hope you are well! Just a note from {shop}: {amount} from {due} is still open. No hurry at all, whenever it suits you. Thank you!",
      HINGLISH: "Namaste {name} ji, umeed hai aap theek hain! {shop} se bas ek note: {due} ka {amount} abhi baaki hai. Koi jaldi nahi, jab suvidha ho tab de dijiye. Dhanyavaad!",
      HINDI: "नमस्ते {name} जी, आशा है आप स्वस्थ होंगे! {shop} की ओर से बस एक सूचना: {due} का {amount} अभी बाकी है। कोई जल्दी नहीं, जब सुविधा हो तब दे दीजिए। धन्यवाद!",
    },
  }[f.tone][f.language];
  return fill(t, v);
}

export const templateProvider: TextProvider = { name: "template", compose: async (f) => templateMessage(f) };

/** Tries providers in order (each returns null on any failure); the template is always the last resort. */
export async function composeWith(providers: TextProvider[], facts: MessageFacts): Promise<ComposedMessage> {
  for (const p of providers) {
    const text = await p.compose(facts).catch(() => null);
    if (text) return { message: text, source: p.name };
  }
  return { message: templateMessage(facts), source: "template" };
}

const DEVANAGARI_DIGITS = "०१२३४५६७८९";
const asciiDigits = (t: string) => t.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));
const numbersIn = (t: string) => asciiDigits(t).match(/\d[\d,]*(?:\.\d+)?/g)?.map((n) => n.replace(/,/g, "")) ?? [];

/**
 * Safety check for AI-written copy. Returns a reason code when the text must be rejected, otherwise null.
 * AI may phrase the message but must not add, drop or change any figure, and must keep the {name} placeholder.
 */
export function rejectReason(text: string, facts: MessageFacts): string | null {
  const t = text.trim();
  if (t.length < 20 || t.length > 500) return "length";
  if (/https?:|www\./i.test(t)) return "link";
  if ((t.match(/\{name\}/g) ?? []).length < 1) return "missing_name_placeholder";
  if ((t.match(/\{\w+\}/g) ?? []).some((p) => p !== NAME_PLACEHOLDER)) return "unknown_placeholder";
  const allowed = new Set([...numbersIn(facts.amountRupees), ...numbersIn(facts.dueDate)]);
  const found = numbersIn(t);
  if (!numbersIn(facts.amountRupees).every((n) => found.includes(n))) return "amount_missing";
  if (found.some((n) => !allowed.has(n))) return "unexpected_number";
  return null;
}

export const renderForCustomer = (message: string, name: string) => message.replaceAll(NAME_PLACEHOLDER, name);

export function rupeesText(paise: number) {
  const r = paise / 100;
  return `₹${Number.isInteger(r) ? r.toLocaleString("en-IN") : r.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}
