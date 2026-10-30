import "server-only";
import { env } from "@/lib/env";
import { sarvamProvider } from "./sarvam";
import { composeWith, templateProvider, type MessageFacts } from "./text";

/** Sarvam first when a key is configured; fixed templates otherwise and as the fallback. */
export const composeMessage = (facts: MessageFacts) => composeWith(env.SARVAM_API_KEY ? [sarvamProvider, templateProvider] : [templateProvider], facts);
