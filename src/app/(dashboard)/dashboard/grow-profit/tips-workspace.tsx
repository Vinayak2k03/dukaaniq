"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, RefreshCw, TrendingUp, Users } from "@/components/ui/icons";
import { answerInfoIntent } from "@/components/voice/info-intents";
import { VoiceBar, type IntentResponse, type VoiceBarResult } from "@/components/voice/voice-bar";
import { formatPaise } from "@/lib/money";
import { DECLINE_REASONS } from "@/lib/validation/recommendation";
import type { TipCard } from "@/server/tips/service";

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
  if (e.kind === "note") {
    return (
      <div className="rounded-lg border border-[#E2E4E9] bg-[#F8F9FA] p-2.5">
        <p className="text-xs text-[#525866]">{e.note}</p>
      </div>
    );
  }
  if (e.kind === "exposure") {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-800">Udhaar Exposure</p>
        <p className="mt-0.5 text-sm font-bold text-rose-900">{formatPaise(e.maxExposurePaise)}</p>
        <p className="mt-0.5 text-[11px] text-[#525866]">{e.label}</p>
      </div>
    );
  }
  return (
    <div className="space-y-2 rounded-lg border border-emerald-100 bg-emerald-50/40 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-800">
            <TrendingUp size={12} className="text-emerald-600" /> Estimated Sales Uplift
          </span>
          <p className="mt-0.5 text-sm font-bold text-emerald-950">
            {formatPaise(e.salesLowPaise)} – {formatPaise(e.salesHighPaise)}
          </p>
        </div>
        <div className="text-right">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#525866]">Est. Gross Profit</span>
          <p className="mt-0.5 text-xs font-semibold text-[#171A23]">
            +{formatPaise(e.grossProfitLowPaise)} to +{formatPaise(e.grossProfitHighPaise)}
          </p>
        </div>
      </div>

      <div className="border-t border-emerald-100/80 pt-1.5 text-[11px] text-[#525866]">
        <span>Max discount exposure: <span className="font-medium text-[#171A23]">{formatPaise(e.maxDiscountExposurePaise)}</span></span>
      </div>

      <details className="text-[10px] text-[#737B8C]">
        <summary className="cursor-pointer font-medium hover:text-[#171A23]">{e.label}: assumptions</summary>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">{e.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
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

type Props = { sarvam: boolean; isOwner: boolean; referenceDate: string; isDemo: boolean; initialAsk?: string };

/** Ask in the chat ("koi tips do") → one batch; "Show more tips" (+ optional feedback) → next batch. Every tip waits in the Action Centre for approval. */
export function TipsWorkspace({ sarvam, isOwner, referenceDate, isDemo, initialAsk }: Props) {
  const [sessionId, setSessionId] = useState<string | null>(() => (typeof window === "undefined" ? null : readSession()));
  const [batches, setBatches] = useState<TipCard[][]>([]);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [focus, setFocus] = useState<string[]>([]);
  /** The last request came back empty: nothing new to suggest. */
  const [exhausted, setExhausted] = useState(false);
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
        setExhausted(data.batch.length === 0);
        if (opts.focus) setFocus(opts.focus);
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

  const describe = (r: TipsReply | null) =>
    !r ? "Sorry, I could not prepare tips right now." : r.batch.length === 0 ? "No new tips right now. Everything useful is already in your Action Centre." : `Here ${r.batch.length === 1 ? "is 1 tip" : `are ${r.batch.length} tips`}: ${r.batch.map((t, i) => `${i + 1}. ${t.title}`).join(". ")}. ${r.remaining} more available. Each one waits for your approval.`;

  async function onCommand(r: IntentResponse): Promise<VoiceBarResult> {
    const voiceFocus = (r.params.focus ?? []).filter((f) => FAMILY[f]);
    switch (r.intent) {
      case "GET_TIPS":
        return describe(await request({ fresh: true, focus: [] }));
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
      <VoiceBar sarvam={sarvam} onCommand={onCommand} initialText={initialAsk} placeholder='Try "koi tips do", "loyal customers ke liye offer", "aur tips batao"' />

      <p className="text-[11px] leading-relaxed text-[#525866]">
        Every number is calculated from your own sales and ledger. AI only writes the wording. Estimates are scenarios, not promises. Nothing is sent to a customer until you approve the exact version{isDemo ? ", and this demo store never sends real messages" : ""}.
      </p>

      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</p>}

      {loading && all.length === 0 && (
        <div className="grid gap-4 md:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((i) => <div key={i} className="h-72 animate-pulse rounded-xl border border-[#E2E4E9] bg-[#F8F9FB]" />)}
        </div>
      )}

      {!loading && all.length === 0 && !error && (
        <div className="rounded-lg border border-dashed border-[#D0D5DD] bg-[#FAFAFC] px-6 py-10 text-center text-xs text-[#737B8C]">
          {exhausted ? (
            <>No new tips right now. Everything useful is already in your <Link href="/dashboard/action-centre" className="font-semibold text-[#4338CA] hover:underline">Action Centre</Link>.</>
          ) : (
            <>Ask in the chat above, for example <em>&quot;koi tips do&quot;</em> or <em>&quot;festival ke liye offer&quot;</em>. You will get 3 different ideas at a time.</>
          )}
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
              <button type="button" disabled={loading || remaining === 0} onClick={() => void request({ focus, feedback: fb })} className="inline-flex items-center gap-1.5 rounded-lg bg-[#4338CA] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#3730A3] disabled:opacity-50">
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
