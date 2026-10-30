"use client";

import { useState, type FormEvent } from "react";
import { Mic, Volume } from "@/components/ui/icons";
import { useVoice, type VoiceLanguage } from "./use-voice";

export type IntentResponse = {
  intent: string;
  params: { focus?: string[]; reason?: string; note?: string; customerName?: string; amountPaise?: number; range?: "today" | "7d" | "30d" };
  confidence: number;
  needsConfirmation: boolean;
  source: "keywords" | "sarvam" | "none";
  customers?: { id: string; name: string; phone?: string | null; customerRef?: string | null }[];
};

export type VoiceAction = {
  label: string;
  kind: "ADD_CREDIT";
  customerId: string;
  customerName: string;
  phone?: string | null;
  amountPaise: number;
};

export type VoiceBarResult = string | { text: string; actions?: VoiceAction[] };

type Props = {
  sarvam: boolean;
  placeholder?: string;
  /** Handles an interpreted command and returns the reply to show (and speak, when the command was spoken). */
  onCommand: (r: IntentResponse, text: string) => Promise<VoiceBarResult>;
};

const LANGS: [VoiceLanguage, string][] = [["HINGLISH", "Hinglish"], ["HINDI", "हिंदी"], ["ENGLISH", "English"]];

/**
 * Voice or typed command bar. The transcript is always shown and editable before it is sent; the reply is shown
 * as text and read back only for spoken commands. Voice never approves or saves anything by itself.
 */
export function VoiceBar({ sarvam, placeholder, onCommand }: Props) {
  const voice = useVoice(sarvam);
  const [language, setLanguage] = useState<VoiceLanguage>("HINGLISH");
  const [text, setText] = useState("");
  const [spoken, setSpoken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<string | null>(null);
  const [actions, setActions] = useState<VoiceAction[]>([]);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  async function record() {
    if (voice.listening) return voice.stop();
    const heard = await voice.listen(language);
    if (heard) {
      setText(heard);
      setSpoken(true);
    }
  }

  async function executeAction(act: VoiceAction) {
    if (act.kind === "ADD_CREDIT") {
      if (!act.amountPaise || act.amountPaise <= 0) {
        window.location.href = `/dashboard/udhaar/${act.customerId}`;
        return;
      }
      setBusy(true);
      setActionSuccess(null);
      try {
        const res = await fetch("/api/credit/entries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customerId: act.customerId,
            type: "CREDIT_GIVEN",
            amount: act.amountPaise / 100,
            idempotencyKey: `voice:${Date.now()}:${Math.random().toString(36).slice(2, 9)}`,
          }),
        });
        const data = (await res.json()) as { error?: string; entryId?: string };
        if (res.ok) {
          const successMsg = `Added ₹${(act.amountPaise / 100).toLocaleString("en-IN")} credit to ${act.customerName}'s account successfully.`;
          setActionSuccess(successMsg);
          setActions([]);
          if (spoken) void voice.speak(successMsg, language);
        } else {
          setActionSuccess(`Failed: ${data.error ?? "Could not add credit"}`);
        }
      } catch {
        setActionSuccess("Network error. Please try again.");
      } finally {
        setBusy(false);
      }
    }
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setReply(null);
    setActions([]);
    setActionSuccess(null);
    try {
      const res = await fetch("/api/voice/intent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: t, language }) });
      const data = (await res.json()) as IntentResponse & { error?: string };
      const rawAnswer = res.ok ? await onCommand(data, t) : (data.error ?? "Could not understand that. Please try again.");
      const answerText = typeof rawAnswer === "string" ? rawAnswer : rawAnswer.text;
      const newActions = typeof rawAnswer === "object" && rawAnswer.actions ? rawAnswer.actions : [];
      setReply(answerText);
      setActions(newActions);
      if (spoken) void voice.speak(answerText, language);
    } catch {
      setReply("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
      setSpoken(false);
    }
  }

  return (
    <div className="rounded-xl border border-[#E2E4E9] bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <form onSubmit={send} className="flex flex-wrap items-center gap-2">
        <select aria-label="Voice language" value={language} onChange={(e) => setLanguage(e.target.value as VoiceLanguage)} className="rounded-lg border border-[#D0D5DD] bg-white px-2 py-2 text-xs text-[#171A23]">
          {LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button
          type="button"
          onClick={record}
          aria-pressed={voice.listening}
          aria-label={voice.listening ? "Stop listening" : "Speak a command"}
          title={voice.listening ? "Stop" : "Speak"}
          className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors disabled:opacity-40 ${voice.listening ? "animate-pulse border-rose-300 bg-rose-50 text-rose-700" : "border-[#D0D5DD] bg-white text-[#4338CA] hover:bg-indigo-50"}`}
        >
          <Mic size={16} />
        </button>
        <input
          value={text}
          onChange={(e) => { setText(e.target.value); setSpoken(false); }}
          placeholder={voice.listening ? "Listening..." : (placeholder ?? 'Try "koi tips do" or "aur tips batao"')}
          aria-label="Command"
          maxLength={300}
          className="min-w-0 flex-1 rounded-lg border border-[#D0D5DD] px-3 py-2 text-sm text-[#171A23] focus:border-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-600/30"
        />
        <button type="submit" disabled={busy || !text.trim()} className="rounded-lg bg-[#4338CA] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#3730A3] disabled:opacity-50">
          {busy ? "Working..." : "Send"}
        </button>
      </form>
      {voice.error ? <p role="alert" className="mt-2 text-xs text-rose-700">{voice.error}</p> : null}
      {reply ? (
        <div role="status" className="mt-2 space-y-2 rounded-lg bg-[#F8F9FB] p-3 text-xs text-[#171A23]">
          <div className="flex items-start justify-between gap-2">
            <p className="whitespace-pre-wrap leading-relaxed">{reply}</p>
            <button type="button" onClick={() => void voice.speak(reply, language)} aria-label="Read aloud" className="shrink-0 text-[#4338CA] hover:text-[#3730A3]">
              <Volume size={14} />
            </button>
          </div>

          {actions.length > 0 && (
            <div className="mt-2 flex flex-col gap-1.5 border-t border-[#E2E4E9] pt-2">
              <p className="font-semibold text-[#525866]">Select customer to add credit:</p>
              <div className="flex flex-wrap gap-2">
                {actions.map((act) => (
                  <button
                    key={act.customerId}
                    type="button"
                    disabled={busy}
                    onClick={() => void executeAction(act)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#4338CA] shadow-sm hover:border-indigo-400 hover:bg-indigo-50/50 disabled:opacity-50"
                  >
                    <span>➕ {act.customerName}</span>
                    <span className="font-normal text-[#525866]">({act.phone ? act.phone : "No phone"})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {actionSuccess && (
            <div className="mt-1 rounded-md bg-emerald-50 p-2 text-xs font-medium text-emerald-800">
              {actionSuccess}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
