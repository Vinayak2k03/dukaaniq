"use client";

import { useRouter } from "next/navigation";
import { answerInfoIntent } from "@/components/voice/info-intents";
import { VoiceBar, type IntentResponse, type VoiceBarResult } from "@/components/voice/voice-bar";

/** Voice on the Action Centre list: tip requests open Growth Tips; approvals happen on a recommendation's own page. */
export function ActionCentreVoice({ sarvam, referenceDate }: { sarvam: boolean; referenceDate: string }) {
  const router = useRouter();
  async function onCommand(r: IntentResponse): Promise<VoiceBarResult> {
    switch (r.intent) {
      case "GET_TIPS":
      case "GET_TIPS_FOR":
      case "GET_MORE_TIPS":
      case "TIP_FEEDBACK":
        router.push("/dashboard/grow-profit");
        return "Opening Growth Tips. Ask again there and I will prepare them.";
      case "APPROVE_RECOMMENDATION":
        return "Open the recommendation you want to approve, then say it again there. Approval always needs your confirmation on screen.";
      case "CONFIRM":
        return "Nothing is waiting for your confirmation here.";
      default:
        return (await answerInfoIntent(r, referenceDate)) ?? 'Sorry, I did not understand. Try "koi tips do" or "aaj ki sales kitni hui".';
    }
  }
  return <VoiceBar sarvam={sarvam} onCommand={onCommand} placeholder='Try "koi tips do" or "Rahul ka kitna udhaar baaki hai"' />;
}
