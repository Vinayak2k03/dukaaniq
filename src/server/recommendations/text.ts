export type Language = "HINDI" | "HINGLISH" | "ENGLISH";
export type Tone = "standard" | "softer";

type Base = { language: Language; tone: Tone; shopName: string };
/** Offer wording pieces. Every string is pre-formatted by deterministic code; a text provider only arranges them. */
export type CouponBits = { offer: "coupon"; discountText: string; minSpendText: string; couponCode: string };
export type ComboBits = { offer: "combo"; comboText: string; comboPriceText: string; comboSavingText: string };

export type MessageFacts =
  | (Base & { kind: "CREDIT_REMINDER"; amountRupees: string; dueDate: string })
  | (Base & CouponBits & { kind: "LOYALTY_COUPON"; validTill: string })
  | (Base & ComboBits & { kind: "LOYALTY_COMBO"; validTill: string })
  | (Base & { kind: "LOYALTY_CREDIT"; creditLimitText: string })
  | (Base & (CouponBits | ComboBits) & { kind: "FESTIVE"; festivalName: string; validTill: string })
  | (Base & CouponBits & { kind: "OFF_PEAK"; timeWindowText: string; validTill: string })
  | (Base & CouponBits & { kind: "WINBACK"; validTill: string })
  | (Base & ComboBits & { kind: "BUNDLE"; validTill: string });

export type MessageKind = MessageFacts["kind"];

export type ComposedMessage = { message: string; source: string };

/** A provider turns facts into customer-facing copy. The first provider that returns text wins; the template provider never fails. */
export type TextProvider = { name: string; compose(facts: MessageFacts): Promise<string | null> };

export const NAME_PLACEHOLDER = "{name}";

const fill = (t: string, v: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (m, k: string) => (k === "name" ? m : String(v[k] ?? m)));

type Lines = Record<Language, string>;
type ToneLines = Record<Tone, Lines>;

const TEMPLATES: Record<string, ToneLines> = {
  CREDIT_REMINDER: {
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
  },
  LOYALTY_COUPON: {
    standard: {
      ENGLISH: "Hello {name}, thank you for being a regular at {shop}! Here is {discount} {minSpend} with code {code}, valid till {validTill}.",
      HINGLISH: "Namaste {name} ji, {shop} ke regular grahak hone ka shukriya! Code {code} se paayein {discount}, {minSpend}. {validTill} tak valid.",
      HINDI: "नमस्ते {name} जी, {shop} के नियमित ग्राहक होने के लिए धन्यवाद! कोड {code} से पाएं {discount}, {minSpend}। {validTill} तक मान्य।",
    },
    softer: {
      ENGLISH: "Hello {name}, we really value you at {shop}. A small thank-you: {discount} {minSpend} with code {code}, any time till {validTill}.",
      HINGLISH: "Namaste {name} ji, {shop} mein aapka saath hamare liye khaas hai. Chhota sa shukriya: code {code} se {discount}, {minSpend}. {validTill} tak kabhi bhi.",
      HINDI: "नमस्ते {name} जी, {shop} में आपका साथ हमारे लिए खास है। छोटा सा धन्यवाद: कोड {code} से {discount}, {minSpend}। {validTill} तक कभी भी।",
    },
  },
  LOYALTY_COMBO: {
    standard: {
      ENGLISH: "Hello {name}, a special combo for our regulars at {shop}: {combo} for {comboPrice} ({saving}). Valid till {validTill}.",
      HINGLISH: "Namaste {name} ji, {shop} ke regular grahakon ke liye khaas combo: {combo} sirf {comboPrice} mein ({saving}). {validTill} tak.",
      HINDI: "नमस्ते {name} जी, {shop} के नियमित ग्राहकों के लिए खास कॉम्बो: {combo} सिर्फ {comboPrice} में ({saving})। {validTill} तक।",
    },
    softer: {
      ENGLISH: "Hello {name}, thank you for shopping with {shop}. We kept a combo for you: {combo} for {comboPrice} ({saving}), till {validTill}.",
      HINGLISH: "Namaste {name} ji, {shop} se jude rehne ka shukriya. Aapke liye ek combo: {combo} sirf {comboPrice} mein ({saving}), {validTill} tak.",
      HINDI: "नमस्ते {name} जी, {shop} से जुड़े रहने के लिए धन्यवाद। आपके लिए एक कॉम्बो: {combo} सिर्फ {comboPrice} में ({saving}), {validTill} तक।",
    },
  },
  LOYALTY_CREDIT: {
    standard: {
      ENGLISH: "Hello {name}, thank you for always paying on time at {shop}. You can now buy on credit (udhaar) up to {limit}. Just ask at the counter.",
      HINGLISH: "Namaste {name} ji, {shop} mein hamesha samay par bhugtaan ke liye shukriya. Ab aap {limit} tak udhaar le sakte hain. Counter par bataiye.",
      HINDI: "नमस्ते {name} जी, {shop} में हमेशा समय पर भुगतान के लिए धन्यवाद। अब आप {limit} तक उधार ले सकते हैं। काउंटर पर बताइए।",
    },
    softer: {
      ENGLISH: "Hello {name}, we trust you at {shop}. Whenever you need it, udhaar up to {limit} is available for you. No pressure at all.",
      HINGLISH: "Namaste {name} ji, {shop} ko aap par poora bharosa hai. Jab zarurat ho, {limit} tak udhaar aapke liye hai. Koi jaldi nahi.",
      HINDI: "नमस्ते {name} जी, {shop} को आप पर पूरा भरोसा है। जब ज़रूरत हो, {limit} तक उधार आपके लिए उपलब्ध है। कोई जल्दी नहीं।",
    },
  },
  FESTIVE_coupon: {
    standard: {
      ENGLISH: "Hello {name}, {festival} greetings from {shop}! Get {discount} {minSpend} with code {code}. Valid till {validTill}.",
      HINGLISH: "Namaste {name} ji, {shop} ki taraf se {festival} ki shubhkamnayein! Code {code} se paayein {discount}, {minSpend}. {validTill} tak.",
      HINDI: "नमस्ते {name} जी, {shop} की ओर से {festival} की शुभकामनाएं! कोड {code} से पाएं {discount}, {minSpend}। {validTill} तक मान्य।",
    },
    softer: {
      ENGLISH: "Hello {name}, warm {festival} wishes from all of us at {shop}. For your festive shopping: {discount} {minSpend}, code {code}, till {validTill}.",
      HINGLISH: "Namaste {name} ji, {shop} parivaar ki taraf se {festival} ki dher saari shubhkamnayein. Tyohaar ki khareed par {discount}, {minSpend}, code {code}, {validTill} tak.",
      HINDI: "नमस्ते {name} जी, {shop} परिवार की ओर से {festival} की ढेर सारी शुभकामनाएं। त्योहार की खरीद पर {discount}, {minSpend}, कोड {code}, {validTill} तक।",
    },
  },
  FESTIVE_combo: {
    standard: {
      ENGLISH: "Hello {name}, {festival} special at {shop}: {combo} for {comboPrice} ({saving}). Valid till {validTill}.",
      HINGLISH: "Namaste {name} ji, {shop} par {festival} special: {combo} sirf {comboPrice} mein ({saving}). {validTill} tak.",
      HINDI: "नमस्ते {name} जी, {shop} पर {festival} स्पेशल: {combo} सिर्फ {comboPrice} में ({saving})। {validTill} तक।",
    },
    softer: {
      ENGLISH: "Hello {name}, warm {festival} wishes from {shop}! We made a festive combo: {combo} for {comboPrice} ({saving}), till {validTill}.",
      HINGLISH: "Namaste {name} ji, {shop} ki taraf se {festival} ki shubhkamnayein! Tyohaar combo: {combo} sirf {comboPrice} mein ({saving}), {validTill} tak.",
      HINDI: "नमस्ते {name} जी, {shop} की ओर से {festival} की शुभकामनाएं! त्योहार कॉम्बो: {combo} सिर्फ {comboPrice} में ({saving}), {validTill} तक।",
    },
  },
  OFF_PEAK: {
    standard: {
      ENGLISH: "Hello {name}, happy hours at {shop}! {window}: {discount} {minSpend} with code {code}. Valid till {validTill}.",
      HINGLISH: "Namaste {name} ji, {shop} par happy hours! {window}: code {code} se {discount}, {minSpend}. {validTill} tak.",
      HINDI: "नमस्ते {name} जी, {shop} पर हैप्पी आवर्स! {window}: कोड {code} से {discount}, {minSpend}। {validTill} तक मान्य।",
    },
    softer: {
      ENGLISH: "Hello {name}, skip the rush at {shop}! Visit {window} for {discount} {minSpend}, code {code}, till {validTill}.",
      HINGLISH: "Namaste {name} ji, bheed se bachiye! {shop} par {window} aaiye aur paayein {discount}, {minSpend}, code {code}, {validTill} tak.",
      HINDI: "नमस्ते {name} जी, भीड़ से बचिए! {shop} पर {window} आइए और पाएं {discount}, {minSpend}, कोड {code}, {validTill} तक।",
    },
  },
  WINBACK: {
    standard: {
      ENGLISH: "Hello {name}, we miss you at {shop}! Come back for {discount} {minSpend} with code {code}. Valid till {validTill}.",
      HINGLISH: "Namaste {name} ji, {shop} aapko yaad kar raha hai! Code {code} se paayein {discount}, {minSpend}. {validTill} tak.",
      HINDI: "नमस्ते {name} जी, {shop} आपको याद कर रहा है! कोड {code} से पाएं {discount}, {minSpend}। {validTill} तक मान्य।",
    },
    softer: {
      ENGLISH: "Hello {name}, hope all is well! It has been a while since your last visit to {shop}. Here is {discount} {minSpend}, code {code}, till {validTill}.",
      HINGLISH: "Namaste {name} ji, umeed hai sab theek hai! {shop} par kaafi din se nahi aaye. Aapke liye {discount}, {minSpend}, code {code}, {validTill} tak.",
      HINDI: "नमस्ते {name} जी, आशा है सब ठीक है! {shop} पर काफी दिनों से नहीं आए। आपके लिए {discount}, {minSpend}, कोड {code}, {validTill} तक।",
    },
  },
  BUNDLE: {
    standard: {
      ENGLISH: "Hello {name}, combo offer at {shop}: {combo} for {comboPrice} ({saving}). Valid till {validTill}.",
      HINGLISH: "Namaste {name} ji, {shop} par combo offer: {combo} sirf {comboPrice} mein ({saving}). {validTill} tak.",
      HINDI: "नमस्ते {name} जी, {shop} पर कॉम्बो ऑफर: {combo} सिर्फ {comboPrice} में ({saving})। {validTill} तक।",
    },
    softer: {
      ENGLISH: "Hello {name}, something you may like at {shop}: {combo} together for {comboPrice} ({saving}), till {validTill}.",
      HINGLISH: "Namaste {name} ji, {shop} par aapke kaam ka combo: {combo} saath mein sirf {comboPrice} ({saving}), {validTill} tak.",
      HINDI: "नमस्ते {name} जी, {shop} पर आपके काम का कॉम्बो: {combo} साथ में सिर्फ {comboPrice} ({saving}), {validTill} तक।",
    },
  },
};

export const templateIdFor = (f: MessageFacts) => (f.kind === "FESTIVE" ? `FESTIVE_${f.offer}` : f.kind);

function templateVars(f: MessageFacts): Record<string, string> {
  const v: Record<string, string> = { shop: f.shopName };
  if (f.kind === "CREDIT_REMINDER") return { ...v, amount: f.amountRupees, due: f.dueDate };
  if (f.kind === "LOYALTY_CREDIT") return { ...v, limit: f.creditLimitText };
  if ("validTill" in f) v.validTill = f.validTill;
  if (f.kind === "FESTIVE") v.festival = f.festivalName;
  if (f.kind === "OFF_PEAK") v.window = f.timeWindowText;
  if (f.offer === "coupon") Object.assign(v, { discount: f.discountText, minSpend: f.minSpendText, code: f.couponCode });
  else Object.assign(v, { combo: f.comboText, comboPrice: f.comboPriceText, saving: f.comboSavingText });
  return v;
}

export function templateMessage(f: MessageFacts): string {
  return fill(TEMPLATES[templateIdFor(f)][f.tone][f.language], templateVars(f));
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

type FactParts = { allowed: string[]; required: [string, string][]; exact: [string, string][] };

/** Which fact strings may appear (allowed), whose figures must appear (required) and which must appear verbatim (exact). */
function factParts(f: MessageFacts): FactParts {
  if (f.kind === "CREDIT_REMINDER") return { allowed: [f.amountRupees, f.dueDate], required: [["amount_missing", f.amountRupees]], exact: [] };
  if (f.kind === "LOYALTY_CREDIT") return { allowed: [f.creditLimitText], required: [["amount_missing", f.creditLimitText]], exact: [] };
  const p: FactParts = { allowed: [f.validTill], required: [["validity_missing", f.validTill]], exact: [] };
  if (f.offer === "coupon") {
    p.allowed.push(f.discountText, f.minSpendText, f.couponCode);
    p.required.push(["amount_missing", f.discountText]);
    p.exact.push(["code_missing", f.couponCode]);
  } else {
    p.allowed.push(f.comboText, f.comboPriceText, f.comboSavingText);
    p.required.push(["amount_missing", f.comboPriceText]);
  }
  if (f.kind === "FESTIVE") p.allowed.push(f.festivalName);
  if (f.kind === "OFF_PEAK") {
    p.allowed.push(f.timeWindowText);
    p.required.push(["time_window_missing", f.timeWindowText]);
  }
  return p;
}

/**
 * Safety check for AI-written copy. Returns a reason code when the text must be rejected, otherwise null.
 * AI may phrase the message but must not add, drop or change any figure (the only allowed numbers are the
 * ones inside the facts, including digits in the coupon code), and must keep the {name} placeholder.
 */
export function rejectReason(text: string, facts: MessageFacts): string | null {
  const t = text.trim();
  if (t.length < 20 || t.length > 500) return "length";
  if (/https?:|www\./i.test(t)) return "link";
  if ((t.match(/\{name\}/g) ?? []).length < 1) return "missing_name_placeholder";
  if ((t.match(/\{\w+\}/g) ?? []).some((p) => p !== NAME_PLACEHOLDER)) return "unknown_placeholder";
  const parts = factParts(facts);
  const found = numbersIn(t);
  for (const [code, s] of parts.required) if (!numbersIn(s).every((n) => found.includes(n))) return code;
  for (const [code, s] of parts.exact) if (!t.includes(s)) return code;
  const allowed = new Set(parts.allowed.flatMap(numbersIn));
  if (found.some((n) => !allowed.has(n))) return "unexpected_number";
  return null;
}

/** Same rule for the merchant-facing "why": it may only restate numbers that appear in the given evidence lines. */
export function whyRejectReason(text: string, evidence: string[]): string | null {
  const t = text.trim();
  if (t.length < 20 || t.length > 400) return "length";
  if (/https?:|www\./i.test(t)) return "link";
  if (/[{}]/.test(t)) return "placeholder";
  const allowed = new Set(evidence.flatMap(numbersIn));
  if (numbersIn(t).some((n) => !allowed.has(n))) return "unexpected_number";
  return null;
}

export const renderForCustomer = (message: string, name: string) => message.replaceAll(NAME_PLACEHOLDER, name);

export function rupeesText(paise: number) {
  const r = paise / 100;
  return `₹${Number.isInteger(r) ? r.toLocaleString("en-IN") : r.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}

// ---------------------------------------------------------------------------
// Language-aware offer strings. Numbers are formatted here, from deterministic values, before any AI sees them.
// ---------------------------------------------------------------------------

export const discountText = (pct: number, capPaise: number, lang: Language) =>
  ({ ENGLISH: `${pct}% off (up to ${rupeesText(capPaise)})`, HINGLISH: `${pct}% ki chhoot (max ${rupeesText(capPaise)})`, HINDI: `${pct}% की छूट (अधिकतम ${rupeesText(capPaise)})` })[lang];

export const minSpendText = (paise: number, lang: Language) =>
  ({ ENGLISH: `on bills of ${rupeesText(paise)} or more`, HINGLISH: `${rupeesText(paise)} ya usse zyada ki khareed par`, HINDI: `${rupeesText(paise)} या उससे अधिक की खरीद पर` })[lang];

export const comboSavingText = (paise: number, lang: Language) =>
  ({ ENGLISH: `you save ${rupeesText(paise)}`, HINGLISH: `${rupeesText(paise)} ki bachat`, HINDI: `${rupeesText(paise)} की बचत` })[lang];

const WEEKDAYS: Record<Language, string[]> = {
  ENGLISH: ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"],
  HINGLISH: ["Somvaar", "Mangalvaar", "Budhvaar", "Guruvaar", "Shukravaar", "Shanivaar", "Ravivaar"],
  HINDI: ["सोमवार", "मंगलवार", "बुधवार", "गुरुवार", "शुक्रवार", "शनिवार", "रविवार"],
};

const clock = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 || h === 24 ? "AM" : "PM"}`;

/** ISO weekday (1 = Monday) and a [startHour, endHour) window in shop-local time. */
export const timeWindowText = (dow: number, startHour: number, endHour: number, lang: Language) => {
  const day = WEEKDAYS[lang][dow - 1];
  return { ENGLISH: `${day}, ${clock(startHour)} to ${clock(endHour)}`, HINGLISH: `har ${day} ${clock(startHour)} se ${clock(endHour)} tak`, HINDI: `हर ${day} ${clock(startHour)} से ${clock(endHour)} तक` }[lang];
};
