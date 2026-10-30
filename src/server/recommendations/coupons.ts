import { randomInt } from "node:crypto";

/**
 * Coupon codes are a backend concern: created with a cryptographic RNG only when the merchant approves a version.
 * No LLM ever sees or writes a real code; messages carry the {code} placeholder until execution fills it in.
 *
 * UNIQUE_PER_CUSTOMER (loyalty, win-back): every customer gets their own code, e.g. LOYAL10-7KQ2MX.
 * SHARED (festive weeks, low hours): one code for the whole audience, e.g. FEST10-QW4ZP.
 */
export type CodeMode = "UNIQUE_PER_CUSTOMER" | "SHARED";

/** No 0/O, 1/I/L: easy to read out at the counter. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const LENGTH: Record<CodeMode, number> = { UNIQUE_PER_CUSTOMER: 6, SHARED: 5 };

export function randomCode(prefix: string, mode: CodeMode): string {
  let s = "";
  for (let i = 0; i < LENGTH[mode]; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `${prefix}-${s}`;
}

/** `count` distinct codes not in `taken` (existing codes of this merchant). */
export function freshCodes(prefix: string, mode: CodeMode, count: number, taken: Set<string>): string[] {
  const out = new Set<string>();
  while (out.size < count) {
    const c = randomCode(prefix, mode);
    if (!taken.has(c)) out.add(c);
  }
  return [...out];
}

/** Shown in previews before approval, when no code exists yet. */
export const codePreview = (prefix: string, mode: CodeMode) => `${prefix}-${"X".repeat(LENGTH[mode])}`;
