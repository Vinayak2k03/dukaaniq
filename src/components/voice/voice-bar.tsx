"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Mic, Volume } from "@/components/ui/icons";
import { useVoice, type VoiceLanguage } from "./use-voice";
import { VoiceWave } from "./voice-wave";

export type IntentResponse = {
  intent: string;
  params: { focus?: string[]; reason?: string; note?: string; customerName?: string; amountPaise?: number; range?: "today" | "7d" | "30d" };
  confidence: number;
  needsConfirmation: boolean;
  source: "keywords" | "sarvam" | "none";
  /** Server-written answer for read-only data questions, already in the chosen language. */
  answer?: string;
  customers?: { id: string; name: string; phone?: string | null; customerRef?: string | null }[];
};

export type VoiceAction = {
  label: string;
  kind: "ADD_CREDIT" | "RECORD_REPAYMENT" | "REQUEST_REMINDER";
  customerId: string;
  customerName: string;
  phone?: string | null;
  amountPaise: number;
};

export type VoiceBarResult = string | { text: string; actions?: VoiceAction[] };

type Props = {
  sarvam: boolean;
  placeholder?: string;
  /** Sent once on mount, e.g. a question carried over from another page (?ask=...). */
  initialText?: string;
  /** Handles an interpreted command and returns the reply to show (and speak, when the command was spoken). */
  onCommand: (r: IntentResponse, text: string) => Promise<VoiceBarResult>;
};

const newKey = () => `voice:${Date.now()}:${Math.random().toString(36).slice(2, 9)}`;

/** The conversation keeps the last 3 exchanges; older ones drop off so follow-ups stay focused. */
const MAX_TURNS = 3;
type Turn = { user: string; assistant: string };

const LANGS: [VoiceLanguage, string][] = [["HINGLISH", "Hinglish"], ["HINDI", "हिंदी"], ["ENGLISH", "English"]];

/**
 * Voice or typed command bar. The transcript is always shown and editable before it is sent; the reply is shown
 * as text and read back only for spoken commands. Voice never approves or saves anything by itself.
 */
export function VoiceBar({ sarvam, placeholder, initialText, onCommand }: Props) {
  const voice = useVoice(sarvam);
  const [language, setLanguage] = useState<VoiceLanguage>("HINGLISH");
  const [text, setText] = useState("");
  const [spoken, setSpoken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const reply = turns.at(-1)?.assistant ?? null;
  const [actions, setActions] = useState<VoiceAction[]>([]);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionLink, setActionLink] = useState<{ href: string; label: string } | null>(null);

  async function record() {
    if (voice.listening) return voice.stop();
    const heard = await voice.listen(language);
    if (heard) {
      setText(heard);
      setSpoken(true);
    }
  }

  const finish = (ok: boolean, msg: string) => {
    setActionSuccess(ok ? msg : `Failed: ${msg}`);
    if (ok) {
      setActions([]);
      if (spoken) void voice.speak(msg, language);
    }
  };

  /** Runs only after the owner taps a button: voice never writes anything by itself. */
  async function executeAction(act: VoiceAction) {
    const ledger = act.kind === "ADD_CREDIT" || act.kind === "RECORD_REPAYMENT";
    if (ledger && (!act.amountPaise || act.amountPaise <= 0)) {
      window.location.assign(`/dashboard/udhaar/${act.customerId}`);
      return;
    }
    setBusy(true);
    setActionSuccess(null);
    setActionLink(null);
    const amount = `₹${(act.amountPaise / 100).toLocaleString("en-IN")}`;
    try {
      if (ledger) {
        const res = await fetch("/api/credit/entries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customerId: act.customerId, type: act.kind === "ADD_CREDIT" ? "CREDIT_GIVEN" : "REPAYMENT_RECEIVED", amount: act.amountPaise / 100, idempotencyKey: newKey() }),
        });
        const data = (await res.json()) as { error?: string };
        if (res.ok) {
          finish(true, act.kind === "ADD_CREDIT" ? `Added ${amount} credit to ${act.customerName}'s account.` : `Recorded ${amount} repayment from ${act.customerName}.`);
          setActionLink({ href: `/dashboard/udhaar/${act.customerId}`, label: "Open ledger" });
        } else finish(false, data.error ?? "Could not save this entry.");
      } else {
        const res = await fetch(`/api/credit/customers/${encodeURIComponent(act.customerId)}/reminder`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        const data = (await res.json()) as { error?: string; recommendationId?: string; duplicate?: boolean };
        if (res.ok && data.recommendationId) {
          finish(true, data.duplicate ? `A reminder for ${act.customerName} is already waiting for approval.` : `Reminder for ${act.customerName} prepared. Approve it before it is sent.`);
          setActionLink({ href: `/dashboard/action-centre/${data.recommendationId}`, label: "Review reminder" });
        } else finish(false, data.error ?? "Could not prepare the reminder.");
      }
    } catch {
      setActionSuccess("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function ask(t: string, wasSpoken: boolean) {
    setBusy(true);
    setActions([]);
    setActionSuccess(null);
    setActionLink(null);
    let answerText: string;
    try {
      const res = await fetch("/api/voice/intent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: t, language, history: turns.slice(-MAX_TURNS) }) });
      const data = (await res.json()) as IntentResponse & { error?: string };
      const rawAnswer = !res.ok ? (data.error ?? "Could not understand that. Please try again.") : data.answer ?? (await onCommand(data, t));
      answerText = typeof rawAnswer === "string" ? rawAnswer : rawAnswer.text;
      setActions(typeof rawAnswer === "object" && rawAnswer.actions ? rawAnswer.actions : []);
      if (wasSpoken) void voice.speak(answerText, language);
    } catch {
      answerText = "Something went wrong. Please try again.";
    } finally {
      setBusy(false);
      setSpoken(false);
    }
    setTurns((all) => [...all, { user: t, assistant: answerText }].slice(-MAX_TURNS));
    setText("");
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || busy) return;
    await ask(t, spoken);
  }

  const asked = useRef(false);
  useEffect(() => {
    if (asked.current || !initialText?.trim()) return;
    asked.current = true;
    void ask(initialText.trim(), false);
    // Runs once for the carried-over question only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialText]);

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
          className={`relative inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors disabled:opacity-40 ${voice.listening ? "border-indigo-300 bg-indigo-600 text-white shadow-[0_0_14px_rgba(99,102,241,0.6)]" : "border-[#D0D5DD] bg-white text-[#4338CA] hover:bg-indigo-50"}`}
        >
          {voice.listening ? <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-indigo-400/50 motion-reduce:hidden" /> : null}
          <Mic size={16} className="relative" />
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
      {voice.listening || voice.transcribing ? (
        <div role="status" aria-live="polite" className="mt-3 overflow-hidden rounded-xl bg-[#0B1020] px-4 pb-3 pt-2 shadow-inner">
          <VoiceWave levelRef={voice.levelRef} mode={voice.listening ? "listening" : "thinking"} />
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="font-medium text-indigo-100">
              {voice.listening ? "Listening... speak now" : "Understanding what you said..."}
            </span>
            {voice.listening ? (
              <button type="button" onClick={voice.stop} className="rounded-full border border-white/20 px-3 py-1 font-semibold text-white hover:bg-white/10">
                Done
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {voice.error ? <p role="alert" className="mt-2 text-xs text-rose-700">{voice.error}</p> : null}
      {turns.length > 1 && (
        <div className="mt-2 space-y-2">
          {turns.slice(0, -1).map((t, i) => (
            <div key={i} className="space-y-1 text-xs">
              <p className="ml-auto w-fit max-w-[85%] rounded-lg bg-indigo-50 px-3 py-1.5 text-[#312E81]">{t.user}</p>
              <p className="w-fit max-w-[85%] whitespace-pre-wrap rounded-lg bg-[#F8F9FB] px-3 py-1.5 leading-relaxed text-[#525866]">{t.assistant}</p>
            </div>
          ))}
        </div>
      )}
      {reply ? (
        <div role="status" className="mt-2 space-y-2 rounded-lg bg-[#F8F9FB] p-3 text-xs text-[#171A23]">
          <p className="ml-auto w-fit max-w-[85%] rounded-lg bg-indigo-50 px-3 py-1.5 text-[#312E81]">{turns.at(-1)?.user}</p>
          <div className="flex items-start justify-between gap-2">
            <p className="whitespace-pre-wrap leading-relaxed">{reply}</p>
            <div className="flex shrink-0 items-center gap-2">
              <button type="button" onClick={() => void voice.speak(reply, language)} aria-label="Read aloud" className="text-[#4338CA] hover:text-[#3730A3]">
                <Volume size={14} />
              </button>
              <button type="button" onClick={() => { setTurns([]); setActions([]); setActionSuccess(null); setActionLink(null); }} className="text-[11px] font-medium text-[#737B8C] hover:text-[#171A23]">
                New chat
              </button>
            </div>
          </div>

          {actions.length > 0 && (
            <div className="mt-2 flex flex-col gap-1.5 border-t border-[#E2E4E9] pt-2">
              <p className="font-semibold text-[#525866]">
                {actions[0].kind === "ADD_CREDIT" ? "Select customer to add credit:" : actions[0].kind === "RECORD_REPAYMENT" ? "Select customer to record repayment:" : "Select customer to prepare a reminder:"}
              </p>
              <div className="flex flex-wrap gap-2">
                {actions.map((act) => (
                  <button
                    key={act.customerId}
                    type="button"
                    disabled={busy}
                    onClick={() => void executeAction(act)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#4338CA] shadow-sm hover:border-indigo-400 hover:bg-indigo-50/50 disabled:opacity-50"
                  >
                    <span>{act.label}</span>
                    <span className="font-normal text-[#525866]">({act.phone ? act.phone : "No phone"})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {actionSuccess && (
            <div className={`mt-1 rounded-md p-2 text-xs font-medium ${/^(Failed|Network)/.test(actionSuccess) ? "bg-rose-50 text-rose-800" : "bg-emerald-50 text-emerald-800"}`}>
              {actionSuccess}
              {actionLink && (
                <a href={actionLink.href} className="ml-2 font-semibold text-[#4338CA] hover:underline">{actionLink.label}</a>
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
