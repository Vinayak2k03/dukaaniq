"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceLanguage = "HINDI" | "HINGLISH" | "ENGLISH";
const BCP47: Record<VoiceLanguage, string> = { HINDI: "hi-IN", HINGLISH: "hi-IN", ENGLISH: "en-IN" };
const MAX_RECORD_MS = 15_000;
/** Mic loudness (RMS, 0..1) that counts as speech, how long a pause ends the recording, and how long we wait for a first word. */
const SPEECH_RMS = 0.025;
const SILENCE_MS = 1_400;
const NO_SPEECH_MS = 7_000;

type AudioCtor = typeof AudioContext;
type Meter = { stop: () => void; heardSpeech: () => boolean };

type RecognitionResult = ArrayLike<{ transcript: string }>;
type Recognition = { lang: string; interimResults: boolean; maxAlternatives: number; start(): void; stop(): void; onresult: ((e: { results: ArrayLike<RecognitionResult> }) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null };
type RecognitionCtor = new () => Recognition;

const browserRecognition = (): RecognitionCtor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export type ListenOptions = {
  /** Called with the words heard so far while the merchant is still speaking (browser recognition only). */
  onInterim?: (text: string) => void;
};

/**
 * Microphone capture and spoken read-back (PRD 10.1).
 * Capture: Sarvam Saaras v3 (server) when configured, else the browser's SpeechRecognition; typed input always works.
 * Read-back: Sarvam Bulbul v3 (server) when configured, else the browser's SpeechSynthesis.
 * Any Sarvam failure switches this page to the browser path, so the merchant is never stuck.
 */
export function useVoice(sarvam: boolean) {
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  /** True while the mic hears speech. Changes only when it flips, so it is cheap to render. */
  const [isSpeaking, setIsSpeaking] = useState(false);
  /** Set when stop() arrives before capture has begun (a very quick push-to-talk release). */
  const stopRequested = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const useSarvam = useRef(sarvam);
  const stopRef = useRef<(() => void) | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  /** Smoothed live mic level 0..1 for the animation. A ref, so 60 updates a second do not re-render the page. */
  const levelRef = useRef(0);
  const meterRef = useRef<Meter | null>(null);

  /** Reads the mic level from `stream`; with `onEnd`, reports a pause after speech or no speech at all. */
  const startMeter = useCallback((stream: MediaStream, onEnd?: (why: "silence" | "no-speech") => void): Meter | null => {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    void ctx.resume();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    const t0 = performance.now();
    let lastVoice = t0;
    let spoke = false;
    let fired = false;
    let smooth = 0;
    let raf = 0;
    let speaking = false;
    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += ((v - 128) / 128) ** 2;
      const rms = Math.sqrt(sum / buf.length);
      const level = Math.min(1, rms * 5);
      smooth += (level - smooth) * (level > smooth ? 0.5 : 0.12);
      levelRef.current = smooth;
      const now = performance.now();
      if (rms > SPEECH_RMS) {
        spoke = true;
        lastVoice = now;
      }
      const hearing = now - lastVoice < 300 && spoke;
      if (hearing !== speaking) {
        speaking = hearing;
        setIsSpeaking(hearing);
      }
      if (onEnd && !fired) {
        const why = spoke && now - lastVoice > SILENCE_MS ? "silence" : !spoke && now - t0 > NO_SPEECH_MS ? "no-speech" : null;
        if (why) {
          fired = true;
          onEnd(why);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return {
      heardSpeech: () => spoke,
      stop: () => {
        cancelAnimationFrame(raf);
        source.disconnect();
        void ctx.close();
        levelRef.current = 0;
        setIsSpeaking(false);
      },
    };
  }, []);

  const stopMeter = useCallback(() => {
    meterRef.current?.stop();
    meterRef.current = null;
  }, []);

  useEffect(() => () => {
    stopRef.current?.();
    stopMeter();
  }, [stopMeter]);

  const viaBrowser = useCallback(
    (language: VoiceLanguage, opts: ListenOptions) =>
      new Promise<string | null>((resolve) => {
        const Ctor = browserRecognition();
        if (!Ctor) {
          setError("Voice input is not supported in this browser. Please type instead.");
          return resolve(null);
        }
        const r = new Ctor();
        r.lang = BCP47[language];
        r.interimResults = true;
        r.maxAlternatives = 1;
        let text: string | null = null;
        // Interim and final results arrive in one list; joining it shows live words that the final text then replaces.
        r.onresult = (e) => {
          text = Array.from(e.results, (res) => res[0]?.transcript ?? "").join(" ").replace(/\s+/g, " ").trim() || null;
          if (text) opts.onInterim?.(text);
        };
        r.onerror = (e) => setError(e.error === "not-allowed" ? "Microphone permission was denied." : "Could not hear clearly. Try again or type instead.");
        let meterStream: MediaStream | null = null;
        r.onend = () => {
          setListening(false);
          stopMeter();
          meterStream?.getTracks().forEach((t) => t.stop());
          resolve(text);
        };
        stopRef.current = () => r.stop();
        setListening(true);
        r.start();
        if (stopRequested.current) r.stop();
        // Speech recognition hides the mic, so open it a second time just to draw the level. Purely cosmetic.
        navigator.mediaDevices?.getUserMedia({ audio: true }).then((st) => {
          meterStream = st;
          meterRef.current = startMeter(st, () => r.stop());
        }, () => {});
      }),
    [startMeter, stopMeter],
  );

  const viaSarvam = useCallback(async (language: VoiceLanguage): Promise<string | null> => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") setError("Microphone permission was denied. Allow it in your browser's address bar and try again.");
      else if (name === "NotFoundError") setError("No microphone found. Plug one in or type instead.");
      else throw e;
      return null;
    }
    const type = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
    const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise<void>((r) => (rec.onstop = () => r()));
    const stopRec = () => rec.state !== "inactive" && rec.stop();
    const timer = setTimeout(stopRec, MAX_RECORD_MS);
    stopRef.current = stopRec;
    // Stops by itself after a pause, so the merchant does not have to tap again.
    const meter = startMeter(stream, stopRec);
    meterRef.current = meter;
    setListening(true);
    rec.start();
    if (stopRequested.current) stopRec();
    await done;
    clearTimeout(timer);
    const heard = meter ? meter.heardSpeech() : true;
    stopMeter();
    stream.getTracks().forEach((t) => t.stop());
    setListening(false);
    if (!heard) {
      setError("I did not hear anything. Check your microphone and try again.");
      return null;
    }
    setTranscribing(true);
    try {
      const form = new FormData();
      form.append("audio", new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
      form.append("language", language === "ENGLISH" ? "en-IN" : "unknown");
      const res = await fetch("/api/voice/transcribe", { method: "POST", body: form });
      // 502: the service ran but could not make out the words. Worth another try, not a reason to give up on it.
      if (res.status === 502) {
        setError("Could not make that out. Try again, or type instead.");
        return null;
      }
      if (!res.ok) throw new Error(String(res.status));
      return ((await res.json()) as { transcript?: string }).transcript ?? null;
    } finally {
      setTranscribing(false);
    }
  }, [startMeter, stopMeter]);

  /** Records one utterance and returns the transcript (null when nothing usable was heard). */
  const listen = useCallback(
    async (language: VoiceLanguage, opts: ListenOptions = {}): Promise<string | null> => {
      setError(null);
      stopRequested.current = false;
      const canRecord = "MediaRecorder" in window && Boolean(navigator.mediaDevices?.getUserMedia);
      if (!canRecord) useSarvam.current = false;
      if (useSarvam.current) {
        try {
          return await viaSarvam(language);
        } catch {
          setListening(false);
          stopMeter();
          useSarvam.current = false;
          if (!browserRecognition()) {
            setError("Could not transcribe. Please type instead.");
            return null;
          }
        }
      }
      return viaBrowser(language, opts);
    },
    [viaBrowser, viaSarvam, stopMeter],
  );

  const stop = useCallback(() => {
    stopRequested.current = true;
    stopRef.current?.();
  }, []);

  const speakBrowser = useCallback((text: string, language: VoiceLanguage) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = BCP47[language];
    window.speechSynthesis.speak(u);
  }, []);

  /** Speaks `text` aloud; the same text is always shown on screen by the caller. */
  const speak = useCallback(
    async (text: string, language: VoiceLanguage) => {
      if (useSarvam.current) {
        try {
          const res = await fetch("/api/voice/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: text.slice(0, 500), language }) });
          if (!res.ok) throw new Error(String(res.status));
          const url = URL.createObjectURL(await res.blob());
          audioRef.current?.pause();
          audioRef.current = new Audio(url);
          audioRef.current.onended = () => URL.revokeObjectURL(url);
          await audioRef.current.play();
          return;
        } catch {
          useSarvam.current = false;
        }
      }
      speakBrowser(text, language);
    },
    [speakBrowser],
  );

  return { listening, transcribing, isSpeaking, levelRef, error, listen, stop, speak, setError };
}
