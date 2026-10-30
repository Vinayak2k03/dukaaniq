import "server-only";
import { createHash } from "node:crypto";
import { env } from "@/lib/env";
import { Lru } from "@/server/sarvam/client";
import { sarvamBatch, sarvamProvider, type BatchItem } from "./sarvam";
import { composeWith, templateMessage, templateProvider, type ComposedMessage, type MessageFacts } from "./text";

/** Wording cache keyed by a hash of the exact facts, so the same facts are never sent to the LLM twice. */
const cache = new Lru<{ message: string | null; why: string | null }>(500);
const keyOf = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");

/** Sarvam first when a key is configured; fixed templates otherwise and as the fallback. */
export async function composeMessage(facts: MessageFacts): Promise<ComposedMessage> {
  const k = keyOf(["one", facts]);
  const hit = cache.get(k);
  if (hit?.message) return { message: hit.message, source: "sarvam" };
  const r = await composeWith(env.SARVAM_API_KEY ? [sarvamProvider, templateProvider] : [templateProvider], facts);
  if (r.source === "sarvam") cache.set(k, { message: r.message, why: null });
  return r;
}

export type BatchInput = BatchItem & { fallbackWhy: string };
export type BatchWording = { message: string; why: string; source: "sarvam" | "template" };

/**
 * Wording for a batch of tips with at most ONE LLM call. Cached items are not re-sent; when `allowLlm` is false
 * (no key, or the session's call cap is reached) everything uses templates silently. Each item falls back on its own.
 */
export async function composeBatch(items: BatchInput[], allowLlm: boolean): Promise<{ results: BatchWording[]; llmCalls: number }> {
  const keys = items.map((it) => keyOf(["batch", it.facts, it.evidence]));
  const cached = keys.map((k) => cache.get(k));
  const missing = items.map((_, i) => i).filter((i) => !cached[i]);
  let llmCalls = 0;
  if (allowLlm && env.SARVAM_API_KEY && missing.length > 0) {
    llmCalls = 1;
    const replies = await sarvamBatch(missing.map((i) => items[i]));
    for (const [j, r] of (replies ?? []).entries()) {
      if (!r.message && !r.why) continue;
      cache.set(keys[missing[j]], r);
      cached[missing[j]] = r;
    }
  }
  const results = items.map((it, i): BatchWording => {
    const c = cached[i];
    const message = it.facts ? (c?.message ?? templateMessage(it.facts)) : "";
    const why = c?.why ?? it.fallbackWhy;
    return { message, why, source: c?.message || (!it.facts && c?.why) ? "sarvam" : "template" };
  });
  return { results, llmCalls };
}
