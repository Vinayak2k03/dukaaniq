import type { SalePayment } from "@/lib/validation/records";

/**
 * Free, rule-based reading of "add product / add customer / record sale" commands in Hindi, Hinglish and English.
 * Used when the AI is not configured or fails. It is best effort on purpose: whatever it reads only pre-fills the
 * review card, which the owner checks and edits before anything is saved.
 */

const DEV = "०१२३४५६७८९";
const norm = (t: string) => t.toLowerCase().replace(/[०-९]/g, (d) => String(DEV.indexOf(d))).replace(/[?!।|]/g, " ").replace(/\s+/g, " ").trim();
const words = (s: string) => s.split(/\s+/).filter(Boolean);
const rupeesToPaise = (n: string) => Math.round(Number(n.replace(/,/g, "")) * 100);

const RUPEE = String.raw`(?:₹|rs\.?|rupaye|rupaiye|rupees|rupee|rupay|रुपये|रुपए|रुपया)`;
const NUM = String.raw`(\d[\d,]*(?:\.\d+)?)`;

/** Spoken quantities ("do Maggi", "आधा किलो"). Only read at the start of an item. */
const NUMBER_WORDS: Record<string, number> = {
  ek: 1, do: 2, teen: 3, tin: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, chhah: 6, saat: 7, aath: 8, nau: 9, das: 10, barah: 12, darjan: 12,
  aadha: 0.5, adha: 0.5, dedh: 1.5, dhai: 2.5, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, half: 0.5, dozen: 12,
  एक: 1, दो: 2, तीन: 3, चार: 4, पांच: 5, पाँच: 5, छह: 6, सात: 7, आठ: 8, नौ: 9, दस: 10, आधा: 0.5, डेढ़: 1.5, ढाई: 2.5, दर्जन: 12,
};
const UNITS = /^(kg|kgs|kilo|kilos|kilogram|किलो|किलोग्राम|किग्रा|केजी|g|gm|gms|gram|grams|ग्राम|ml|ltr|एमएल|लीटर|सेर|पाव|packet|packets|pkt|pack|पैकेट|pcs|pc|piece|pieces|पीस|bottle|bottles|बोतल|dabba|dabbe|डब्बा|litre|liter|l|लीटर|box|unit|units|x)$/;

/** Words that are never part of a product or customer name. */
const FILLER = new Set(
  (
    "becha beche bechi bech bech diya diye diya bika bike bik gaya gaye sold sell sale kiya ki hui hua karo kar likho darj add " +
    "kharida kharidi kharide kharid liya liye li le gaya gayi ne ko ka ke se me mein hai tha thi the aaj abhi ab total kul bill " +
    "naya nayi new product item saman maal customer grahak naam name jodo banao daalo dalo save please ji wala wali wale " +
    "li liya liye liyi di de dee par pe pr dedo dena chahiye chahie lena lo bhi hi bas kharidna and aur or plus cash nakad upi online gpay phonepe paytm card udhaar udhar credit khate khata account " +
    "ली लिया लिए लिये पर दिया दिए दिये दी दीं दे देना चाहिए लेना लो भी ही बस खरीदना ये वो बेचा बेचे बेची बिका बिके खरीदा खरीदी खरीदे ने को का की के से में है था आज अभी कुल बिल नया नई प्रोडक्ट सामान ग्राहक नाम जोड़ो बनाओ डालो और नकद उधार खाते जी"
  ).split(" "),
);
/** Keeps brand spellings like "Parle-G" or "Tata Tea 500g"; drops bare numbers, rupee words and filler. */
const cleanName = (s: string) =>
  words(s.replace(new RegExp(`${RUPEE}`, "gi"), " "))
    .map((w) => w.replace(/^[.,]+|[.,]+$/g, ""))
    .filter((w) => w && !/^[\d.,₹%-]+$/.test(w) && !FILLER.has(w) && !(w in NUMBER_WORDS))
    .join(" ")
    .trim();

/**
 * How the customer paid, with the little words that travel with it ("udhaar par", "khate mein", "cash se", "UPI se").
 * Removed from a sale before the item names are read, so they can never leak into a product name.
 */
const NOT_LETTER = String.raw`(?![\p{L}\p{M}])`;
const WITH = String.raw`(?:\s+(?:par|pe|pr|me|mein|se|में|पर|पे|से))?`;
export const PAYMENT_PHRASE = new RegExp(
  String.raw`(?<![\p{L}\p{M}])(?:(?:udhaar|udhar|उधार|उधर|उदार)${WITH}|(?:credit|क्रेडिट)\s+(?:par|pe|पर|पे)|(?:khate|khaate|khata|खाते|खाता)${WITH}|baad (?:me|mein) (?:dega|degi|denge)|बाद में (?:देगा|देगी|देंगे)|(?:cash|nakad|naqad|नकद|कैश)${WITH}|(?:upi|gpay|g pay|google pay|phonepe|phone pe|paytm|पेटीएम|यूपीआई|online|ऑनलाइन|qr)${WITH}|(?:card|कार्ड)${WITH})${NOT_LETTER}`,
  "giu",
);
/** Drops an earlier payment mention, so a later "cash" replaces a spoken "udhaar". */
export const withoutPayment = (t: string) => t.replace(PAYMENT_PHRASE, " ").replace(/\s+/g, " ").trim();

export function paymentOf(raw: string): SalePayment | undefined {
  const t = norm(raw);
  if (/(udhaar|udhar|उधार|credit pe|credit par|khate (me|mein)|khaate|खाते में|baad me dega|baad mein dega)/.test(t)) return "UDHAAR";
  if (/paytm|पेटीएम/.test(t)) return "PAYTM";
  if (/(\bupi\b|gpay|g pay|google pay|phonepe|phone pe|online|qr|यूपीआई)/.test(t)) return "UPI";
  if (/(\bcard\b|कार्ड)/.test(t)) return "CARD";
  if (/(cash|nakad|naqad|नकद|कैश)/.test(t)) return "CASH";
  return undefined;
}

/** "Rahul ne ...", "Rahul ko ... becha", "राहुल ने ...". Up to two words before ne/ko. */
const buyerOf = (t: string) => {
  const m = t.match(/^([\p{L}\p{M}]+(?: [\p{L}\p{M}]+)?)\s+(?:ji\s+|जी\s+)?(?:ne|ko|ने|को)\s/u);
  if (!m) return undefined;
  const n = cleanName(m[1]);
  return n && !(n in NUMBER_WORDS) ? n : undefined;
};

export type ParsedSale = { lines: { heard: string; quantity: number; unitPaise?: number }[]; payment?: SalePayment; customerName?: string; totalPaise?: number };

export function parseSaleText(raw: string): ParsedSale {
  let t = norm(raw);
  const customerName = buyerOf(t);
  if (customerName) t = t.replace(/^([\p{L}\p{M}]+(?: [\p{L}\p{M}]+)?)\s+(?:ji\s+|जी\s+)?(?:ne|ko|ने|को)\s/u, "");
  // "₹120 ka", "total 120", "120 rupaye" is the bill total, not a quantity.
  let totalPaise: number | undefined;
  t = t.replace(new RegExp(String.raw`(?:total|kul|कुल|bill)\s*(?:${RUPEE}\s*)?${NUM}|${RUPEE}\s*${NUM}|${NUM}\s*${RUPEE}`, "gi"), (_m, a?: string, b?: string, c?: string) => {
    totalPaise = rupeesToPaise(a ?? b ?? c ?? "0");
    return " , ";
  });
  t = t.replace(PAYMENT_PHRASE, " , ");
  const lines = t
    .split(/\s*(?:,|\+|\band\b|\baur\b|और|तथा)\s*/)
    .map((seg) => {
      const w = words(seg);
      let quantity = 1;
      let i = 0;
      const spoken = w[0] && /^\d+(\.\d+)?$/.test(w[0]) ? Number(w[0]) : w[0] && w[0] in NUMBER_WORDS && w.length > 1 ? NUMBER_WORDS[w[0]] : null;
      if (spoken !== null) {
        quantity = spoken;
        i = 1;
      }
      if (w[i] && UNITS.test(w[i])) i++;
      return { heard: cleanName(w.slice(i).join(" ")), quantity };
    })
    .filter((l) => l.heard.length >= 2 && l.quantity > 0);
  return { lines, payment: paymentOf(raw), customerName, totalPaise };
}

export type ParsedProduct = { name?: string; sellingPaise?: number; costPaise?: number };

/** "Maggi add karo, 14 ka bechte hain, 11 ka aata hai" / "add product Maggi selling 14 cost 11". */
export function parseProductText(raw: string): ParsedProduct {
  const t = norm(raw);
  const sell =
    t.match(new RegExp(String.raw`${NUM}\s*(?:${RUPEE}\s*)?(?:ka|ki|ke|me|mein|में|का|की)?\s*(?:bechte|bechta|bechti|bechenge|bechna|bechne|bikta|bikti|बेचते|बेचना|बिकता)`)) ??
    t.match(new RegExp(String.raw`(?:selling|sell|mrp|price|daam|dam|rate|bechne ka|बेचने का|दाम)\s*(?:price|ka|का)?\s*(?:${RUPEE}\s*)?${NUM}`));
  const cost =
    t.match(new RegExp(String.raw`${NUM}\s*(?:${RUPEE}\s*)?(?:ka|ki|ke|me|mein|में|का|की)?\s*(?:kharid|kharida|kharidte|aata|aati|aate|padta|padti|lagta|खरीद|आता|आती|पड़ता)`)) ??
    t.match(new RegExp(String.raw`(?:cost|lagat|kharid|purchase|लागत|खरीद)\s*(?:price|ka|का)?\s*(?:${RUPEE}\s*)?${NUM}`));
  const head = t.split(/[,]| \d/)[0];
  const name = cleanName(head) || undefined;
  return { name, sellingPaise: sell ? rupeesToPaise(sell[1]) : undefined, costPaise: cost ? rupeesToPaise(cost[1]) : undefined };
}

export type ParsedCustomer = { name?: string; phone?: string };

/** "Rahul Sharma naam ka customer add karo, number 98765 43210" / "add customer Rahul 9876543210". */
export function parseCustomerText(raw: string): ParsedCustomer {
  const t = norm(raw);
  const phone = t.match(/(\+?\d[\d -]{8,14}\d)/)?.[1].replace(/[\s-]/g, "");
  const named = t.match(/([\p{L}\p{M}]+(?: [\p{L}\p{M}]+)?)\s+(?:naam ka|naam ke|naam se|नाम का|नाम के|नाम से)/u) ?? t.match(/(?:customer|grahak|ग्राहक)\s+(?:add\s+(?:karo|kar do)?\s*)?([\p{L}\p{M}]+(?: [\p{L}\p{M}]+)?)/u) ?? t.match(/(?:name|naam|नाम)\s+(?:is\s+|hai\s+|है\s+)?([\p{L}\p{M}]+(?: [\p{L}\p{M}]+)?)/u);
  const name = named ? cleanName(named[1]) || undefined : cleanName(t.replace(/(\+?\d[\d -]{8,14}\d)/, " ")) || undefined;
  return { name, phone };
}

const ADDITIVE = /\b(?:aur|bhi|also|add|more)\b|और|भी/iu;

/**
 * A short follow-up to a sale draft that is still open: "aur ek dal bhi" adds an item, "cash me" / "UPI se" changes how
 * it was paid. Returns the full sale text to read again, or null when this is not a sale amendment.
 */
export function amendSale(openSale: string | undefined, text: string, matchedIntent?: string): string | null {
  if (!openSale || text.trim().split(/\s+/).length > 8) return null;
  if (matchedIntent && matchedIntent !== "RECORD_SALE") return null;
  const added = parseSaleText(text);
  if (added.lines.length === 0 && added.payment && !added.customerName) return `${withoutPayment(openSale)}, ${text}`;
  if (added.lines.length > 0 && !added.customerName && ADDITIVE.test(text)) return `${openSale}, ${text}`;
  return null;
}
