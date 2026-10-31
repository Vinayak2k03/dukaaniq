"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type KeyboardEvent } from "react";
import { ledgerHref } from "@/lib/links";
import { Mic, Volume } from "@/components/ui/icons";
import { useVoice, type VoiceLanguage } from "./use-voice";
import { VoiceWave } from "./voice-wave";
import { RecordDraftCard, type Saved } from "./record-draft-card";
import type { RecordDraft } from "@/lib/validation/records";

export type IntentResponse = {
  intent: string;
  params: { focus?: string[]; reason?: string; note?: string; customerName?: string; amountPaise?: number; range?: "today" | "7d" | "30d"; discountPct?: number; audience?: OfferAudience };
  confidence: number;
  needsConfirmation: boolean;
  source: "keywords" | "sarvam" | "none";
  /** Server-written answer for read-only data questions, already in the chosen language. */
  answer?: string;
  /** Set when the answer is a follow-up question; sent back with the next turn so the reply completes it. */
  pending?: Pending;
  /** The customer being discussed and any open sale draft; sent back with the next command. */
  context?: SessionContext;
  customers?: { id: string; name: string; phone?: string | null; customerRef?: string | null }[];
  /** A new product, customer or sale read from the command; shown as an editable card and saved only on tap. */
  draft?: RecordDraft;
};

export type OfferAudience = "LOYAL" | "INACTIVE" | "COOLING" | "ACTIVE" | "ALL";
export type Pending = { intent: "ADD_CREDIT" | "RECORD_REPAYMENT" | "REQUEST_REMINDER" | "GET_CUSTOMER_BALANCE" | "CREATE_OFFER"; customerName?: string; amountPaise?: number; discountPct?: number; audience?: OfferAudience };

export type VoiceAction = {
  label: string;
  kind: "ADD_CREDIT" | "RECORD_REPAYMENT" | "REQUEST_REMINDER" | "CREATE_OFFER";
  customerId: string;
  customerName: string;
  phone?: string | null;
  amountPaise: number;
  /** CREATE_OFFER only: the discount and customer group to prepare an offer proposal for. */
  discountPct?: number;
  audience?: OfferAudience;
};

export type VoiceBarResult = string | { text: string; actions?: VoiceAction[] };

type Props = {
  sarvam: boolean;
  placeholder?: string;
  /** Sent once on mount, e.g. a question carried over from another page (?ask=...). */
  initialText?: string;
  /** Tappable example sentences, shown until the first command. */
  examples?: string[];
  /** Handles an interpreted command and returns the reply to show (and speak, when the command was spoken). */
  onCommand: (r: IntentResponse, text: string) => Promise<VoiceBarResult>;
};

const newKey = () => `voice:${Date.now()}:${Math.random().toString(36).slice(2, 9)}`;

/** The chat shows the last 3 exchanges, but the whole session (up to 12) is sent with each command, so "uska kitna?" still works after more than 3 messages. */
const SHOWN_TURNS = 3;
const SESSION_TURNS = 12;
type SessionContext = { customerName?: string; saleText?: string };
type Turn = { user: string; assistant: string; pending?: Pending; ctx?: SessionContext };
const HOLD_MS = 250;
const AUTO_SEND_KEY = "dukaaniq:voice-auto-send";
const subscribeStorage = (cb: () => void) => {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
};
const readAutoSend = () => {
  try {
    return localStorage.getItem(AUTO_SEND_KEY) !== "0";
  } catch {
    return true;
  }
};

const LANGS: [VoiceLanguage, string][] = [["HINGLISH", "Hinglish"], ["HINDI", "हिंदी"], ["ENGLISH", "English"]];

/**
 * Voice or typed command bar. The transcript is always shown and editable before it is sent; the reply is shown
 * as text and read back only for spoken commands. Voice never approves or saves anything by itself.
 */
export function VoiceBar({ sarvam, placeholder, initialText, examples, onCommand }: Props) {
  const voice = useVoice(sarvam);
  const [language, setLanguage] = useState<VoiceLanguage>("HINGLISH");
  const [text, setText] = useState("");
  const [spoken, setSpoken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  // Saved preference; the server snapshot keeps the first render identical on server and client.
  const storedAutoSend = useSyncExternalStore(subscribeStorage, readAutoSend, () => true);
  const [autoSendChoice, setAutoSend] = useState<boolean | null>(null);
  const autoSend = autoSendChoice ?? storedAutoSend;
  /** Push-to-talk: send as soon as the recording ends, whatever the auto-send setting. */
  const sendAfter = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holding = useRef(false);
  const suppressClick = useRef(false);
  const reply = turns.at(-1)?.assistant ?? null;
  const [actions, setActions] = useState<VoiceAction[]>([]);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionLink, setActionLink] = useState<{ href: string; label: string } | null>(null);
  const [draft, setDraft] = useState<RecordDraft | null>(null);
  /** Remounts the review card for every new command, so a second "2 Maggi becha" starts from fresh fields. */
  const [draftId, setDraftId] = useState(0);

  /** One recording. Words appear in the box while speaking; the text is sent when auto-send is on or for push-to-talk. */
  async function startListening(pushToTalk: boolean) {
    if (voice.listening || busy) return;
    sendAfter.current = pushToTalk;
    setText("");
    const heard = await voice.listen(language, { onInterim: (t) => setText(t) });
    if (!heard?.trim()) return;
    setText(heard);
    setSpoken(true);
    if (sendAfter.current || autoSend) await ask(heard.trim(), true);
  }

  function onMicPointerDown() {
    if (voice.listening) return;
    holdTimer.current = setTimeout(() => {
      holding.current = true;
      suppressClick.current = true;
      void startListening(true);
    }, HOLD_MS);
  }

  function onMicPointerUp() {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    if (!holding.current) return;
    holding.current = false;
    sendAfter.current = true;
    voice.stop();
  }

  function onMicClick() {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (voice.listening) voice.stop();
    else void startListening(false);
  }

  /** Spacebar on the focused mic button works as push-to-talk. */
  function onMicKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== " ") return;
    e.preventDefault();
    if (e.repeat || voice.listening) return;
    holding.current = true;
    void startListening(true);
  }

  function onMicKeyUp(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== " ") return;
    e.preventDefault();
    onMicPointerUp();
  }

  function toggleAutoSend(on: boolean) {
    setAutoSend(on);
    try {
      localStorage.setItem(AUTO_SEND_KEY, on ? "1" : "0");
    } catch {
      /* storage unavailable: the choice lasts for this page only */
    }
  }

  const finish = (ok: boolean, msg: string) => {
    setActionSuccess(ok ? msg : `Failed: ${msg}`);
    if (ok) {
      setActions([]);
      if (spoken) void voice.speak(msg, language);
    }
  };

  /** Prepares one discount offer as a proposal. It still waits for approval in the Action Centre before anything is sent. */
  async function prepareOffer(act: VoiceAction) {
    setBusy(true);
    setActionSuccess(null);
    setActionLink(null);
    try {
      const res = await fetch("/api/tips/custom-offer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ discountPct: act.discountPct, audience: act.audience }) });
      const data = (await res.json()) as { error?: string; recommendationId?: string; title?: string; audienceSize?: number; duplicate?: boolean };
      if (res.ok && data.recommendationId) {
        finish(true, data.duplicate ? `"${data.title}" is already waiting for your approval.` : `Offer prepared: ${data.title}. Review the exact message and approve it before anything is sent.`);
        setActionLink({ href: `/dashboard/action-centre/${data.recommendationId}`, label: "Review offer" });
      } else finish(false, data.error ?? "Could not prepare the offer.");
    } catch {
      setActionSuccess("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  /** Runs only after the owner taps a button: voice never writes anything by itself. */
  async function executeAction(act: VoiceAction) {
    if (act.kind === "CREATE_OFFER") return prepareOffer(act);
    const ledger = act.kind === "ADD_CREDIT" || act.kind === "RECORD_REPAYMENT";
    if (ledger && (!act.amountPaise || act.amountPaise <= 0)) {
      window.location.assign(ledgerHref(act.customerId, { intent: act.kind === "ADD_CREDIT" ? "add" : "repay" }));
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
          body: JSON.stringify({ customerId: act.customerId, type: act.kind === "ADD_CREDIT" ? "CREDIT_GIVEN" : "REPAYMENT_RECEIVED", amount: act.amountPaise / 100, ...(act.kind === "RECORD_REPAYMENT" ? { paymentMethod: "CASH" } : {}), idempotencyKey: newKey() }),
        });
        const data = (await res.json()) as { error?: string };
        if (res.ok) {
          finish(true, act.kind === "ADD_CREDIT" ? `Added ${amount} udhaar to ${act.customerName}'s account.` : `Recorded ${amount} repayment from ${act.customerName}.`);
          setActionLink({ href: ledgerHref(act.customerId), label: "Open ledger" });
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

  /** The sale is no longer open, so a later "aur ek dal" starts a new command instead of amending it. */
  function closeSale() {
    setTurns((all) => all.map((t, i) => (i === all.length - 1 && t.ctx?.saleText ? { ...t, ctx: { ...t.ctx, saleText: undefined } } : t)));
  }

  function onDraftSaved(s: Saved) {
    setDraft(null);
    closeSale();
    finish(true, s.text);
    setActionLink(s.link ?? null);
  }

  async function ask(t: string, wasSpoken: boolean) {
    setBusy(true);
    setActions([]);
    setDraft(null);
    setActionSuccess(null);
    setActionLink(null);
    let answerText: string;
    let pending: Pending | undefined;
    let ctx: SessionContext | undefined;
    try {
      const res = await fetch("/api/voice/intent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: t, language, history: turns.slice(-SESSION_TURNS) }) });
      const data = (await res.json()) as IntentResponse & { error?: string };
      pending = res.ok ? data.pending : undefined;
      ctx = res.ok ? data.context : undefined;
      if (res.ok && data.draft) {
        setDraft(data.draft);
        setDraftId((n) => n + 1);
      }
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
    setTurns((all) => [...all, { user: t, assistant: answerText, pending, ctx: ctx ?? { customerName: all.findLast((x) => x.ctx?.customerName)?.ctx?.customerName } }].slice(-SESSION_TURNS));
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
          onClick={onMicClick}
          onPointerDown={onMicPointerDown}
          onPointerUp={onMicPointerUp}
          onPointerLeave={onMicPointerUp}
          onKeyDown={onMicKeyDown}
          onKeyUp={onMicKeyUp}
          aria-pressed={voice.listening}
          aria-label={voice.listening ? "Stop listening" : "Speak a command (tap, or hold to talk)"}
          title={voice.listening ? "Stop" : "Tap to speak, or hold (or hold Space) to talk"}
          className={`relative inline-flex h-9 w-9 touch-none select-none items-center justify-center rounded-full border transition-colors disabled:opacity-40 ${voice.listening ? "border-indigo-300 bg-indigo-600 text-white shadow-[0_0_14px_rgba(99,102,241,0.6)]" : "border-[#D0D5DD] bg-white text-[#4338CA] hover:bg-indigo-50"}`}
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
        <label className="flex items-center gap-1.5 text-[11px] text-[#525866]" title="Send automatically when you stop speaking">
          <input type="checkbox" checked={autoSend} onChange={(e) => toggleAutoSend(e.target.checked)} className="h-3.5 w-3.5 accent-[#4338CA]" />
          Auto-send
        </label>
      </form>
      {examples?.length && turns.length === 0 && !busy && !voice.listening ? (
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Examples">
          {examples.map((ex) => (
            <button key={ex} type="button" onClick={() => void ask(ex, false)} className="rounded-full border border-indigo-200 bg-indigo-50/60 px-3 py-1 text-[11px] font-medium text-[#3730A3] hover:bg-indigo-100">
              {ex}
            </button>
          ))}
        </div>
      ) : null}
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
          {turns.slice(-SHOWN_TURNS, -1).map((t, i) => (
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
              <button type="button" onClick={() => { setTurns([]); setActions([]); setDraft(null); setActionSuccess(null); setActionLink(null); }} className="text-[11px] font-medium text-[#737B8C] hover:text-[#171A23]">
                New chat
              </button>
            </div>
          </div>

          {actions.length > 0 && (
            <div className="mt-2 flex flex-col gap-1.5 border-t border-[#E2E4E9] pt-2">
              <p className="font-semibold text-[#525866]">
                {actions[0].kind === "CREATE_OFFER" ? "Confirm to prepare this offer:" : actions[0].kind === "ADD_CREDIT" ? "Select customer to add credit:" : actions[0].kind === "RECORD_REPAYMENT" ? "Select customer to record repayment:" : "Select customer to prepare a reminder:"}
              </p>
              <div className="flex flex-wrap gap-2">
                {actions.map((act) => (
                  <button
                    key={act.customerId || act.label}
                    type="button"
                    disabled={busy}
                    onClick={() => void executeAction(act)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#4338CA] shadow-sm hover:border-indigo-400 hover:bg-indigo-50/50 disabled:opacity-50"
                  >
                    <span>{act.label}</span>
                    {act.kind === "CREATE_OFFER" ? null : <span className="font-normal text-[#525866]">({act.phone ? act.phone : "No phone"})</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {draft ? <RecordDraftCard key={draftId} draft={draft} onSaved={onDraftSaved} onCancel={() => { setDraft(null); closeSale(); }} /> : null}

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
