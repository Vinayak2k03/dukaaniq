import "server-only";
import { z } from "zod";
import { formatPaise } from "@/lib/money";
import { SALE_PAYMENTS, type CatalogItem, type CustomerDraft, type ProductDraft, type RecordDraft, type SaleDraft } from "@/lib/validation/records";
import type { VoiceLanguage } from "@/lib/validation/tips";
import { listCatalog } from "@/server/records/service";
import { billTotals } from "@/server/records/math";
import { sarvamEnabled, sarvamJson } from "@/server/sarvam/client";
import { nameSimilarity, type RecordIntent } from "./intent";
import { parseCustomerText, parseProductText, parseSaleText, paymentOf } from "./records-parse";

/**
 * "Add a product / customer / sale" by voice (PRD 10.1: interpret, then confirm). The AI may read the command into
 * fields, but every number it returns must have been spoken, and the result only pre-fills a review card. Prices for
 * known products come from the catalog, never from the model. Nothing is saved here.
 */

const DEV = "०१२३४५६७८९";
/** Every number the owner actually said, so a model-invented price or quantity is dropped. */
const spokenNumbers = (t: string) => new Set((t.replace(/[०-९]/g, (d) => String(DEV.indexOf(d))).match(/\d+(?:\.\d+)?/g) ?? []).map(Number));
const SPOKEN_WORD_NUMBERS = new Set([0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 9, 10, 12]);

const rupees = z.number().positive().max(10_000_000);
const saleShape = z.object({
  items: z.array(z.object({ name: z.string().trim().min(1).max(80), quantity: z.number().positive().max(10_000).default(1), unitRupees: rupees.optional() })).max(20).default([]),
  customerName: z.string().trim().min(1).max(60).optional(),
  payment: z.enum(SALE_PAYMENTS).optional(),
  totalRupees: rupees.optional(),
});
const productShape = z.object({ name: z.string().trim().min(1).max(80), category: z.string().trim().max(40).optional(), sellingRupees: rupees.optional(), costRupees: rupees.optional() });
const customerShape = z.object({ name: z.string().trim().min(1).max(60), phone: z.string().trim().max(20).optional() });

const COMMON = [
  "You read ONE spoken command from a small Indian shop owner (Hindi, Hinglish or English, possibly with speech-recognition spelling mistakes).",
  "Copy names as spoken (product and customer names may be brand names like Maggi, Parle-G, Tata Tea).",
  "Only include a number if the owner said it; never guess a price, quantity, phone or total. Leave a field out when it was not said.",
  "OUTPUT: exactly one JSON object, no markdown, no explanation.",
].join("\n");

const PROMPT: Record<RecordIntent, string> = {
  RECORD_SALE: `${COMMON}\nThe owner is recording a sale (bill). Output {"items":[{"name":"...","quantity":1,"unitRupees":0}],"customerName":"...","payment":"CASH|UPI|PAYTM|CARD|UDHAAR","totalRupees":0}.\nquantity: how many (do=2, teen=3, aadha=0.5, dedh=1.5); unitRupees only if a price per piece was said; totalRupees only if a bill total was said. payment UDHAAR means on credit / khate mein / baad mein dega. customerName only if a buyer was named ("Rahul ne liya").`,
  ADD_PRODUCT: `${COMMON}\nThe owner is adding a product to their shop. Output {"name":"...","category":"...","sellingRupees":0,"costRupees":0}.\nsellingRupees = price the shop sells at (bechte hain, MRP, rate); costRupees = price the shop buys at (kharidte hain, aata hai, lagat, cost). category only if said (e.g. Snacks, Dairy, Beverages, Staples).`,
  ADD_CUSTOMER: `${COMMON}\nThe owner is adding a new customer. Output {"name":"...","phone":"..."}. phone only if digits were said.`,
};

async function extract<T>(intent: RecordIntent, text: string, shape: z.ZodType<T>): Promise<T | null> {
  if (!sarvamEnabled()) return null;
  const parsed = shape.safeParse(await sarvamJson(PROMPT[intent], `Command: ${text.slice(0, 300)}`, 400).catch(() => null));
  return parsed.success ? parsed.data : null;
}

/** Catalog matches for a spoken product name: names containing it first, then close spellings. */
function productOptions(heard: string, catalog: CatalogItem[]): CatalogItem[] {
  const h = heard.toLowerCase();
  const contains = catalog.filter((p) => p.name.toLowerCase().includes(h));
  const fuzzy = catalog
    .map((p) => ({ p, score: nameSimilarity(heard, p.name) }))
    .filter((x) => x.score >= 0.72)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.p);
  return [...new Map([...contains, ...fuzzy].map((p) => [p.id, p])).values()].slice(0, 4);
}

const SAY: Record<VoiceLanguage, { sale: (n: number, total: string, unknown: number) => string; product: (missing: boolean, dup: string | null) => string; customer: (dup: string | null) => string; empty: string }> = {
  HINGLISH: {
    sale: (n, total, unknown) => `Bill taiyaar hai: ${n} item, ${total}.${unknown ? ` ${unknown} item aapke products mein nahi mila, use chun lijiye.` : ""} Check karke Save dabaiye.`,
    product: (missing, dup) => (dup ? `"${dup}" pehle se aapke products mein hai. Naya chahiye to naam badal dijiye.` : missing ? "Product ki details bhar di hain. Bechne aur kharidne ka daam check karke Save dabaiye." : "Product ki details bhar di hain. Check karke Save dabaiye."),
    customer: (dup) => (dup ? `"${dup}" naam ka customer pehle se hai. Naya hai to naam badal dijiye.` : "Customer ki details bhar di hain. Check karke Save dabaiye."),
    empty: "Kya becha? Jaise: \"2 Maggi aur 1 Parle-G becha, cash\".",
  },
  HINDI: {
    sale: (n, total, unknown) => `बिल तैयार है: ${n} आइटम, ${total}।${unknown ? ` ${unknown} आइटम आपके सामान में नहीं मिला, उसे चुन लीजिए।` : ""} जाँच कर Save दबाइए।`,
    product: (missing, dup) => (dup ? `"${dup}" पहले से आपके सामान में है।` : missing ? "सामान की जानकारी भर दी है। बेचने और खरीदने का दाम जाँच कर Save दबाइए।" : "सामान की जानकारी भर दी है। जाँच कर Save दबाइए।"),
    customer: (dup) => (dup ? `"${dup}" नाम का ग्राहक पहले से है।` : "ग्राहक की जानकारी भर दी है। जाँच कर Save दबाइए।"),
    empty: "क्या बेचा? जैसे: \"2 मैगी और 1 पारले-जी बेचा, नकद\"।",
  },
  ENGLISH: {
    sale: (n, total, unknown) => `Bill ready: ${n} item${n === 1 ? "" : "s"}, ${total}.${unknown ? ` ${unknown} item${unknown === 1 ? " is" : "s are"} not in your products yet; pick or add it.` : ""} Check it and tap Save.`,
    product: (missing, dup) => (dup ? `"${dup}" is already in your products. Change the name if this is a different one.` : missing ? "I filled in the product. Check the selling and buying price, then tap Save." : "I filled in the product. Check it and tap Save."),
    customer: (dup) => (dup ? `A customer named "${dup}" already exists. Change the name if this is someone new.` : "I filled in the customer. Check it and tap Save."),
    empty: 'What did you sell? For example: "2 Maggi and 1 Parle-G, cash".',
  },
};

type Found = { id: string; name: string; phone?: string | null };

export async function draftRecord(
  merchantId: string,
  intent: RecordIntent,
  text: string,
  language: VoiceLanguage,
  findCustomers: (merchantId: string, name: string) => Promise<Found[]>,
): Promise<{ draft: RecordDraft; answer: string }> {
  const said = spokenNumbers(text);
  const keep = (n: number | undefined, wordsOk = false) => (n !== undefined && (said.has(n) || (wordsOk && SPOKEN_WORD_NUMBERS.has(n))) ? n : undefined);
  const say = SAY[language];

  if (intent === "ADD_PRODUCT") {
    const ai = await extract(intent, text, productShape);
    const rule = parseProductText(text);
    const sellingRupees = keep(ai?.sellingRupees);
    const costRupees = keep(ai?.costRupees);
    const name = ai?.name ?? rule.name ?? "";
    const existing = name ? productOptions(name, await listCatalog(merchantId)).filter((p) => p.name.toLowerCase() === name.toLowerCase()) : [];
    const draft: ProductDraft = {
      kind: "PRODUCT",
      name,
      // The model sometimes adds a category nobody said; keep it only when it was spoken.
      category: ai?.category && text.toLowerCase().includes(ai.category.toLowerCase()) ? ai.category : undefined,
      sellingPaise: sellingRupees !== undefined ? Math.round(sellingRupees * 100) : rule.sellingPaise,
      costPaise: costRupees !== undefined ? Math.round(costRupees * 100) : rule.costPaise,
      existing,
    };
    return { draft, answer: say.product(draft.sellingPaise === undefined || draft.costPaise === undefined, existing[0]?.name ?? null) };
  }

  if (intent === "ADD_CUSTOMER") {
    const ai = await extract(intent, text, customerShape);
    const rule = parseCustomerText(text);
    const phoneDigits = (ai?.phone ?? "").replace(/\D/g, "");
    const phone = phoneDigits && text.replace(/\D/g, "").includes(phoneDigits) ? ai?.phone : rule.phone;
    const name = ai?.name ?? rule.name ?? "";
    const matches = name ? (await findCustomers(merchantId, name)).filter((c) => c.name.toLowerCase() === name.toLowerCase()) : [];
    const draft: CustomerDraft = { kind: "CUSTOMER", name, phone, existing: matches.map((c) => ({ id: c.id, name: c.name, phone: c.phone ?? null })) };
    return { draft, answer: say.customer(matches[0]?.name ?? null) };
  }

  const ai = await extract(intent, text, saleShape);
  const rule = parseSaleText(text);
  const heardLines = ai?.items.length
    ? ai.items.map((i) => ({ heard: i.name, quantity: keep(i.quantity, true) ?? 1, unitPaise: keep(i.unitRupees) !== undefined ? Math.round(i.unitRupees! * 100) : undefined }))
    : rule.lines;
  const catalog = await listCatalog(merchantId);
  const lines = heardLines.map((l) => {
    const options = productOptions(l.heard, catalog);
    const best = options[0] && (options.length === 1 || nameSimilarity(l.heard, options[0].name) >= 0.9) ? options[0] : undefined;
    return { heard: l.heard, quantity: l.quantity, options, productId: best?.id, unitPaise: l.unitPaise ?? best?.pricePaise };
  });
  const customerHeard = ai?.customerName ?? rule.customerName;
  const customers = customerHeard ? (await findCustomers(merchantId, customerHeard)).map((c) => ({ id: c.id, name: c.name, phone: c.phone ?? null })) : [];
  const spokenTotal = keep(ai?.totalRupees);
  const draft: SaleDraft = {
    kind: "SALE",
    lines,
    payment: ai?.payment ?? rule.payment ?? paymentOf(text),
    customerHeard,
    customers,
    spokenTotalPaise: spokenTotal !== undefined ? Math.round(spokenTotal * 100) : rule.totalPaise,
  };
  if (lines.length === 0) return { draft, answer: say.empty };
  const total = billTotals(lines.map((l) => ({ quantity: l.quantity, unitPaise: l.unitPaise ?? 0, costPaise: 0 }))).netPaise;
  return { draft, answer: say.sale(lines.length, formatPaise(total), lines.filter((l) => !l.productId).length) };
}
