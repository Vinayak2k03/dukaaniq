"use client";

import { useRouter } from "next/navigation";
import { answerInfoIntent } from "./info-intents";
import { VoiceBar, type IntentResponse, type VoiceBarResult } from "./voice-bar";

/**
 * The general shop assistant: data questions, udhaar commands, and adding products, customers and sales (the server
 * answers those with a review card). Tip requests open Growth Tips; approvals happen on a recommendation's own page.
 */
export function ShopAssistant({ sarvam, referenceDate, placeholder }: { sarvam: boolean; referenceDate: string; placeholder?: string }) {
  const router = useRouter();
  async function onCommand(r: IntentResponse, text: string): Promise<VoiceBarResult> {
    switch (r.intent) {
      case "GET_TIPS":
      case "GET_TIPS_FOR":
      case "GET_MORE_TIPS":
      case "TIP_FEEDBACK":
        router.push(`/dashboard/grow-profit?ask=${encodeURIComponent(text)}`);
        return "Opening Growth Tips and preparing your tips...";
      case "APPROVE_RECOMMENDATION":
        return "Open the recommendation you want to approve, then say it again there. Approval always needs your confirmation on screen.";
      case "CONFIRM":
        return "Nothing is waiting for your confirmation here.";
      default:
        return (await answerInfoIntent(r, referenceDate)) ?? 'Sorry, I did not understand. Try "2 Maggi becha, cash" or "aaj ki sales kitni hui".';
    }
  }
  return <VoiceBar sarvam={sarvam} onCommand={onCommand} placeholder={placeholder} />;
}
