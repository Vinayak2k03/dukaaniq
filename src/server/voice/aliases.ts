import { nameSimilarity } from "./intent";

/**
 * Everyday goods have several names: sugar, chini, cheeni, शुगर, चीनी, शक्कर. Each group lists them all (Hindi script
 * and Roman spellings), so a spoken name finds the catalog product whatever language either side was written in.
 */
const GROUPS: string[][] = [
  ["sugar", "shugar", "chini", "cheeni", "chinee", "shakkar", "shakar", "cheeny", "शुगर", "चीनी", "चिनी", "शक्कर", "शकर"],
  ["salt", "namak", "नमक", "सॉल्ट", "साल्ट"],
  ["rice", "chawal", "chaawal", "चावल", "राइस"],
  ["wheat flour", "atta", "aata", "आटा", "आटे"],
  ["milk", "doodh", "dudh", "दूध", "मिल्क"],
  ["oil", "tel", "तेल", "ऑयल"],
  ["lentils", "dal", "daal", "दाल"],
  ["tea", "chai", "chaay", "चाय", "टी"],
  ["bread", "pav", "paav", "ब्रेड", "पाव", "डबल रोटी"],
  ["butter", "makhan", "मक्खन", "बटर"],
  ["soap", "sabun", "साबुन", "सोप"],
  ["biscuit", "biscuits", "biskut", "बिस्कुट", "बिस्किट"],
  ["onion", "pyaz", "pyaaz", "प्याज", "प्याज़", "ओनियन"],
  ["potato", "aloo", "alu", "आलू", "पोटैटो"],
  ["tomato", "tamatar", "टमाटर", "टोमेटो"],
  ["turmeric", "haldi", "हल्दी"],
  ["jaggery", "gur", "gud", "गुड़", "गुड"],
];

const SPACES = /\s+/g;
const clean = (s: string) => s.toLowerCase().replace(SPACES, " ").trim();
const INDEX = new Map<string, string[]>();
for (const g of GROUPS) for (const w of g) INDEX.set(clean(w), g);

/** The spoken name plus every alias of the goods named in it ("शुगर" gives sugar, chini, चीनी, ...). */
export function nameVariants(heard: string): string[] {
  const h = clean(heard);
  const out = new Set([h]);
  const whole = INDEX.get(h);
  if (whole) whole.forEach((w) => out.add(w));
  const words = h.split(" ");
  words.forEach((w, i) => {
    const group = INDEX.get(w);
    if (group) for (const alt of group) out.add([...words.slice(0, i), alt, ...words.slice(i + 1)].join(" "));
  });
  return [...out].filter(Boolean);
}

/** Best similarity of any alias of the heard name against a stored product name. */
export function productSimilarity(heard: string, stored: string): number {
  return Math.max(...nameVariants(heard).map((v) => nameSimilarity(v, stored)));
}
