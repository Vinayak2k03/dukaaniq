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

/** Add AI providers (e.g. Sarvam) ahead of the template provider; each must return null on any failure. */
const providers: TextProvider[] = [templateProvider];

export async function composeMessage(facts: MessageFacts): Promise<ComposedMessage> {
  for (const p of providers) {
    const text = await p.compose(facts).catch(() => null);
    if (text) return { message: text, source: p.name };
  }
  return { message: templateMessage(facts), source: "template" };
}

export const renderForCustomer = (message: string, name: string) => message.replaceAll(NAME_PLACEHOLDER, name);

export function rupeesText(paise: number) {
  const r = paise / 100;
  return `₹${Number.isInteger(r) ? r.toLocaleString("en-IN") : r.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}
