"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, RefreshCw, Sparkles, Users } from "@/components/ui/icons";
import { answerInfoIntent } from "@/components/voice/info-intents";
import { VoiceBar, type IntentResponse } from "@/components/voice/voice-bar";
import { formatPaise } from "@/lib/money";
import { DECLINE_REASONS } from "@/lib/validation/recommendation";
import type { TipCard } from "@/server/tips/service";

type Focus = "ALL" | "LOYALTY" | "FESTIVE" | "OFF_PEAK";
const FOCUS: [Focus, string][] = [["ALL", "All"], ["LOYALTY", "Loyal customers"], ["FESTIVE", "Festive"], ["OFF_PEAK", "Low hours"]];

const FAMILY: Record<string, { label: string; variant: "brand" | "success" | "warning" | "neutral" | "danger" }> = {
  LOYALTY: { label: "Loyalty", variant: "brand" },
  FESTIVE: { label: "Festive", variant: "warning" },
  OFF_PEAK: { label: "Low hours", variant: "success" },
  CREDIT_REMINDER: { label: "Udhaar reminder", variant: "danger" },
  WINBACK: { label: "Win-back", variant: "neutral" },
  BUNDLE: { label: "Combo", variant: "neutral" },
  SLOW_MOVING: { label: "Slow mover", variant: "neutral" },
  PEAK_TIMING: { label: "Peak time", variant: "neutral" },
};
const LANG: Record<string, string> = { HINDI: "Hindi", HINGLISH: "Hinglish", ENGLISH: "English" };

type Feedback = { recommendationId?: string; reason?: string; note?: string };
type TipsReply = { sessionId: string; batch: TipCard[]; remaining: number; feedbackNotes: string[] };

const SESSION_KEY = "dukaaniq:tips-session";
const readSession = () => {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
};
const writeSession = (v: string | null) => {
  try {
    if (v) sessionStorage.setItem(SESSION_KEY, v);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable: the session simply restarts on reload */
  }
};

function Economics({ e }: { e: TipCard["economics"] }) {
  if (e.kind === "note") return <p className="text-[#525866]">{e.note}</p>;
  if (e.kind === "exposure")
    return (
      <p>
        <span className="font-semibold text-rose-800">{formatPaise(e.maxExposurePaise)}</span> <span className="text-[#525866]">{e.label.toLowerCase()}</span>
      </p>
    );
  return (
    <div className="space-y-0.5">
      <p>
        Gross profit impact <span className="font-semibold text-[#171A23]">{formatPaise(e.grossProfitLowPaise)} to {formatPaise(e.grossProfitHighPaise)}</span>
      </p>
      <p className="text-[#525866]">Extra sales {formatPaise(e.salesLowPaise)} to {formatPaise(e.salesHighPaise)} · max discount {formatPaise(e.maxDiscountExposurePaise)}</p>
      <details className="text-[#737B8C]">
        <summary className="cursor-pointer">{e.label}: assumptions</summary>
        <ul className="mt-1 list-disc pl-4">{e.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
      </details>
    </div>
  );
}

function Card({ t }: { t: TipCard }) {
  const fam = FAMILY[t.family] ?? { label: t.family, variant: "neutral" as const };
  return (
    <article className="flex flex-col rounded-xl border border-[#E2E4E9] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="space-y-2 border-b border-[#F0F2F5] p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={fam.variant} size="sm">{fam.label}</Badge>
          <Badge variant="outline" size="sm">{t.messageSource === "sarvam" ? "Sarvam AI" : "Template"}</Badge>
          <Badge variant="warning" size="sm">Pending approval</Badge>
        </div>
        <h3 className="text-sm font-bold leading-snug text-[#171A23]">{t.title}</h3>
        <p className="text-xs leading-relaxed text-[#525866]">{t.why}</p>
      </div>
      <div className="flex-1 space-y-3 p-4 text-xs text-[#171A23]">
        {t.changes.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2.5 text-amber-900">
            <p className="font-semibold">Adjusted for your feedback</p>
            <ul className="mt-1 list-disc pl-4">{t.changes.map((c) => <li key={c}>{c}</li>)}</ul>
          </div>
        )}
        <div>
          <p className="mb-1 font-semibold text-[#737B8C]">Evidence</p>
          <ul className="list-disc space-y-0.5 pl-4 text-[#525866]">{t.highlights.map((h) => <li key={h}>{h}</li>)}</ul>
        </div>
        <div>
          <p className="mb-1 font-semibold text-[#737B8C]">Terms</p>
          <ul className="space-y-0.5">{t.offerLines.map((l) => <li key={l}>{l}</li>)}</ul>
        </div>
        <div>
          <p className="mb-1 font-semibold text-[#737B8C]">Scenario estimate</p>
          <Economics e={t.economics} />
        </div>
        <p className="flex flex-wrap items-center gap-1 text-[#525866]">
          <Users size={12} /> {t.audienceSize === 0 ? "No customer is contacted (in-store tip)" : `${t.audienceSize} customer${t.audienceSize === 1 ? "" : "s"}`}
          {t.notOptedIn > 0 && <span className="text-amber-800">· {t.notOptedIn} not opted in</span>}
          {t.demoCustomers > 0 && <span>· {t.demoCustomers} demo customers (never really messaged)</span>}
        </p>
        {t.message && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-2.5">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">Message preview · {LANG[t.language] ?? t.language}</p>
            <p className="whitespace-pre-wrap leading-relaxed">{t.message.replaceAll("{name}", "[Customer]").replaceAll("{code}", "[code created after approval]")}</p>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2 border-t border-[#F0F2F5] p-3">
        <Link href={`/dashboard/action-centre/${t.recommendationId}`} className="inline-flex items-center gap-1 rounded-lg bg-[#4338CA] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#3730A3]">
          Review &amp; approve <ArrowRight size={12} />
        </Link>
        <Link href={`/dashboard/action-centre/${t.recommendationId}#decision`} className="rounded-lg border border-[#D0D5DD] px-3 py-1.5 text-xs font-medium text-[#171A23] hover:bg-[#F8F9FA]">
          Reject or request alternative
        </Link>
      </div>
    </article>
  );
}

type Props = { sarvam: boolean; isOwner: boolean; referenceDate: string; isDemo: boolean };

/** "Get tips" → one batch; "Show more tips" (+ optional feedback) → next batch. Every tip waits in the Action Centre for approval. */
export function TipsWorkspace({ sarvam, isOwner, referenceDate, isDemo }: Props) {
  const [sessionId, setSessionId] = useState<string | null>(() => (typeof window === "undefined" ? null : readSession()));
  const [batches, setBatches] = useState<TipCard[][]>([]);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [focus, setFocus] = useState<Focus>("ALL");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [fb, setFb] = useState<Feedback>({});
  const [showFeedback, setShowFeedback] = useState(false);

  const request = useCallback(
    async (opts: { fresh?: boolean; focus?: string[]; feedback?: Feedback }): Promise<TipsReply | null> => {
      setLoading(true);
      setError(null);
      const send = (sid: string | null) =>
        fetch("/api/tips", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...(sid ? { sessionId: sid } : {}), count: 3, ...(opts.focus?.length ? { focus: opts.focus } : {}), ...(opts.feedback && (opts.feedback.reason || opts.feedback.note) ? { feedback: opts.feedback } : {}) }),
        });
      try {
        let sid = opts.fresh ? null : sessionId;
        let res = await send(sid);
        if (sid && (res.status === 404 || res.status === 409)) {
          sid = null;
          res = await send(null);
        }
        const data = (await res.json()) as TipsReply & { error?: string };
        if (!res.ok) {
          setError(data.error ?? "Could not prepare tips. Please try again.");
          return null;
        }
        setSessionId(data.sessionId);
        writeSession(data.sessionId);
        setBatches((b) => (data.batch.length ? [data.batch, ...(sid ? b : [])] : sid ? b : []));
        setRemaining(data.remaining);
        setNotes(data.feedbackNotes);
        setFb({});
        setShowFeedback(false);
        return data;
      } catch {
        setError("Could not reach DukaanIQ. Check your connection and try again.");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [sessionId],
  );

  const focusList = (f: Focus) => (f === "ALL" ? [] : [f]);
  const describe = (r: TipsReply | null) =>
    !r ? "Sorry, I could not prepare tips right now." : r.batch.length === 0 ? "No new tips right now. Everything useful is already in your Action Centre." : `Here ${r.batch.length === 1 ? "is 1 tip" : `are ${r.batch.length} tips`}: ${r.batch.map((t, i) => `${i + 1}. ${t.title}`).join(". ")}. ${r.remaining} more available. Each one waits for your approval.`;

  async function onCommand(r: IntentResponse): Promise<string> {
    const voiceFocus = (r.params.focus ?? []).filter((f) => FAMILY[f]);
    switch (r.intent) {
      case "GET_TIPS":
        return describe(await request({ fresh: true }));
      case "GET_TIPS_FOR":
        return describe(await request({ fresh: !sessionId, focus: voiceFocus }));
      case "GET_MORE_TIPS":
        return describe(await request({}));
      case "TIP_FEEDBACK":
        if (!sessionId) return "Ask for tips first, then tell me what to change.";
        return `Noted. ${describe(await request({ feedback: { reason: r.params.reason, note: r.params.note } }))}`;
      case "APPROVE_RECOMMENDATION":
        return "To approve, open the tip with 'Review & approve'. Approval always needs your confirmation on screen.";
      case "CONFIRM":
        return "Nothing is waiting for your confirmation here.";
      default:
        return (await answerInfoIntent(r, referenceDate)) ?? 'Sorry, I did not understand. Try "koi tips do", "festival ke liye offer" or "aur tips batao".';
    }
  }

  const latest = batches[0] ?? [];
  const all = batches.flat();

  if (!isOwner) return <p className="rounded-xl border border-[#E2E4E9] bg-white p-5 text-xs text-[#737B8C]">Only the shop owner can request growth tips.</p>;

  return (
    <div className="space-y-5">
      <VoiceBar sarvam={sarvam} onCommand={onCommand} placeholder='Try "koi tips do", "loyal customers ke liye offer", "aur tips batao"' />

      <div className="rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50/80 via-white to-indigo-50/50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Focus">
            {FOCUS.map(([v, l]) => (
              <button key={v} type="button" aria-pressed={focus === v} onClick={() => setFocus(v)} className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${focus === v ? "border-[#4338CA] bg-[#4338CA] text-white" : "border-[#D0D5DD] bg-white text-[#171A23] hover:bg-[#F8F9FA]"}`}>
                {l}
              </button>
            ))}
          </div>
          <button type="button" disabled={loading} onClick={() => void request({ fresh: true, focus: focusList(focus) })} className="inline-flex items-center gap-1.5 rounded-lg bg-[#4338CA] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#3730A3] disabled:opacity-60">
            <Sparkles size={14} /> {loading ? "Preparing tips..." : all.length ? "Start over with fresh tips" : "Get tips"}
          </button>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-[#525866]">
          Every number is calculated from your own sales and ledger. AI only writes the wording. Estimates are scenarios, not promises. Nothing is sent to a customer until you approve the exact version{isDemo ? ", and this demo store never sends real messages" : ""}.
        </p>
      </div>

      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</p>}

      {loading && all.length === 0 && (
        <div className="grid gap-4 md:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((i) => <div key={i} className="h-72 animate-pulse rounded-xl border border-[#E2E4E9] bg-[#F8F9FB]" />)}
        </div>
      )}

      {!loading && all.length === 0 && !error && (
        <div className="rounded-lg border border-dashed border-[#D0D5DD] bg-[#FAFAFC] px-6 py-10 text-center text-xs text-[#737B8C]">
          Press <strong>Get tips</strong> or say <em>&quot;koi tips do&quot;</em>. You will get 3 different ideas at a time.
        </div>
      )}

      {notes.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-900">
          <p className="font-semibold">Your feedback so far</p>
          <ul className="mt-1 list-disc pl-4">{notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </div>
      )}

      {batches.map((batch, i) => (
        <section key={batch[0]?.recommendationId ?? i} aria-label={i === 0 ? "Latest tips" : "Earlier tips"} className="space-y-2">
          {batches.length > 1 && <h2 className="text-xs font-semibold uppercase tracking-wide text-[#737B8C]">{i === 0 ? "Latest tips" : "Earlier in this session"}</h2>}
          <div className="grid gap-4 md:grid-cols-3">{batch.map((t) => <Card key={t.recommendationId} t={t} />)}</div>
        </section>
      ))}

      {sessionId && all.length > 0 && (
        <div className="space-y-3 rounded-xl border border-[#E2E4E9] bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-[#525866]">
              {remaining === null ? "" : remaining === 0 ? "No more tips available for now." : <><strong className="text-[#171A23]">{remaining}</strong> more tip{remaining === 1 ? "" : "s"} available</>}
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowFeedback((s) => !s)} className="rounded-lg border border-[#D0D5DD] px-3 py-1.5 text-xs font-medium text-[#171A23] hover:bg-[#F8F9FA]">
                {showFeedback ? "Hide feedback" : "Add feedback"}
              </button>
              <button type="button" disabled={loading || remaining === 0} onClick={() => void request({ focus: focusList(focus), feedback: fb })} className="inline-flex items-center gap-1.5 rounded-lg bg-[#4338CA] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#3730A3] disabled:opacity-50">
                <RefreshCw size={12} /> {loading ? "Preparing..." : "Show more tips"}
              </button>
            </div>
          </div>
          {showFeedback && (
            <div className="grid gap-2 md:grid-cols-3">
              <label className="space-y-1 text-xs text-[#525866]">
                <span>About which tip? (optional)</span>
                <select value={fb.recommendationId ?? ""} onChange={(e) => setFb({ ...fb, recommendationId: e.target.value || undefined })} className="block w-full rounded-lg border border-[#D0D5DD] bg-white px-2 py-1.5 text-xs text-[#171A23]">
                  <option value="">All of them</option>
                  {latest.map((t) => <option key={t.recommendationId} value={t.recommendationId}>{t.title}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-xs text-[#525866]">
                <span>What should change?</span>
                <select value={fb.reason ?? ""} onChange={(e) => setFb({ ...fb, reason: e.target.value || undefined })} className="block w-full rounded-lg border border-[#D0D5DD] bg-white px-2 py-1.5 text-xs text-[#171A23]">
                  <option value="">No specific reason</option>
                  {DECLINE_REASONS.filter(([v]) => v !== "OTHER").map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-xs text-[#525866]">
                <span>Note (optional, any language)</span>
                <input value={fb.note ?? ""} maxLength={300} onChange={(e) => setFb({ ...fb, note: e.target.value })} placeholder="e.g. discount kam rakho" className="block w-full rounded-lg border border-[#D0D5DD] px-2 py-1.5 text-xs text-[#171A23]" />
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
