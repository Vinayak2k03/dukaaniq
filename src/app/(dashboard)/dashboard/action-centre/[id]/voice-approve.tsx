"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { answerInfoIntent } from "@/components/voice/info-intents";
import { VoiceBar, type IntentResponse } from "@/components/voice/voice-bar";

type Props = { sarvam: boolean; referenceDate: string; recommendationId: string; version: number; title: string; terms: string[]; pending: boolean; isOwner: boolean };

/**
 * Approve-by-voice (PRD 10.2 / 10.3): the command only opens a read-back of the exact title, version and terms;
 * approval happens only when the owner presses the on-screen confirm button. "Haan" alone never approves.
 */
export function VoiceApprove({ sarvam, referenceDate, recommendationId, version, title, terms, pending, isOwner }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const readBack = `${title}. Version ${version}. Terms: ${terms.join("; ")}. Press "Confirm approval" on screen to approve this exact version.`;

  async function onCommand(r: IntentResponse): Promise<string> {
    switch (r.intent) {
      case "APPROVE_RECOMMENDATION":
        if (!isOwner) return "Only the shop owner can approve.";
        if (!pending) return "This recommendation is not waiting for approval.";
        setConfirming(true);
        return readBack;
      case "CONFIRM":
        return confirming ? 'Please press "Confirm approval" on screen. Voice alone cannot approve.' : "Nothing is waiting for your confirmation.";
      case "TIP_FEEDBACK":
        return "To reject with a reason, use the Decline form below. You can then request a revised alternative.";
      case "GET_TIPS":
      case "GET_TIPS_FOR":
      case "GET_MORE_TIPS":
        router.push("/dashboard/grow-profit");
        return "Opening Growth Tips.";
      default:
        return (await answerInfoIntent(r, referenceDate)) ?? 'Sorry, I did not understand. Try "is offer ko approve karo".';
    }
  }

  async function confirm() {
    setBusy(true);
    try {
      const res = await fetch(`/api/recommendations/${recommendationId}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version, confirmed: true }) });
      const data = (await res.json()) as { error?: string };
      setResult(res.ok ? "Approved. You can now record the action." : (data.error ?? "Could not approve."));
      if (res.ok) {
        setConfirming(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <VoiceBar sarvam={sarvam} onCommand={onCommand} placeholder='Try "is offer ko approve karo"' />
      {confirming && (
        <div role="dialog" aria-label="Confirm approval" className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-xs text-emerald-950">
          <p className="font-semibold">Approve this exact version?</p>
          <p className="mt-1">{title} · Version {version}</p>
          <ul className="mt-2 list-disc pl-4">{terms.map((t) => <li key={t}>{t}</li>)}</ul>
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={busy} onClick={() => void confirm()} className="rounded-lg bg-emerald-700 px-3.5 py-1.5 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">
              {busy ? "Approving..." : "Confirm approval"}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="rounded-lg border border-emerald-300 bg-white px-3.5 py-1.5 font-medium">Cancel</button>
          </div>
        </div>
      )}
      {result && <p role="status" className="text-xs text-[#171A23]">{result}</p>}
    </div>
  );
}
