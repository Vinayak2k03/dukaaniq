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
  customers?: { id: string; name: string }[];
};

type Props = {
  sarvam: boolean;
  placeholder?: string;
  /** Handles an interpreted command and returns the reply to show (and speak, when the command was spoken). */
  onCommand: (r: IntentResponse, text: string) => Promise<string>;
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

  async function record() {
    if (voice.listening) return voice.stop();
    const heard = await voice.listen(language);
    if (heard) {
      setText(heard);
      setSpoken(true);
    }
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setReply(null);
    try {
      const res = await fetch("/api/voice/intent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: t, language }) });
      const data = (await res.json()) as IntentResponse & { error?: string };
      const answer = res.ok ? await onCommand(data, t) : (data.error ?? "Could not understand that. Please try again.");
      setReply(answer);
      if (spoken) void voice.speak(answer, language);
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
        <div role="status" className="mt-2 flex items-start justify-between gap-2 rounded-lg bg-[#F8F9FB] px-3 py-2 text-xs text-[#171A23]">
          <p className="whitespace-pre-wrap leading-relaxed">{reply}</p>
          <button type="button" onClick={() => void voice.speak(reply, language)} aria-label="Read aloud" className="shrink-0 text-[#4338CA] hover:text-[#3730A3]">
            <Volume size={14} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
