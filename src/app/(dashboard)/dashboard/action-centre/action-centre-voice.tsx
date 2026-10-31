"use client";

import { ShopAssistant } from "@/components/voice/shop-assistant";

/** Voice on the Action Centre list: the shop assistant, with examples suited to this page. */
export function ActionCentreVoice({ sarvam, referenceDate }: { sarvam: boolean; referenceDate: string }) {
  return <ShopAssistant sarvam={sarvam} referenceDate={referenceDate} placeholder='Try "koi tips do" or "Rahul ka kitna udhaar baaki hai"' />;
}
