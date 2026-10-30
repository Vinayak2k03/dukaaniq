"use client";

import { useCallback, useRef, useState } from "react";

export type VoiceLanguage = "HINDI" | "HINGLISH" | "ENGLISH";
const BCP47: Record<VoiceLanguage, string> = { HINDI: "hi-IN", HINGLISH: "hi-IN", ENGLISH: "en-IN" };
const MAX_RECORD_MS = 15_000;

type Recognition = { lang: string; interimResults: boolean; maxAlternatives: number; start(): void; stop(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null };
type RecognitionCtor = new () => Recognition;

const browserRecognition = (): RecognitionCtor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

/**
 * Microphone capture and spoken read-back (PRD 10.1).
 * Capture: Sarvam Saaras v3 (server) when configured, else the browser's SpeechRecognition; typed input always works.
 * Read-back: Sarvam Bulbul v3 (server) when configured, else the browser's SpeechSynthesis.
 * Any Sarvam failure switches this page to the browser path, so the merchant is never stuck.
 */
export function useVoice(sarvam: boolean) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const useSarvam = useRef(sarvam);
  const stopRef = useRef<(() => void) | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const viaBrowser = useCallback(
    (language: VoiceLanguage) =>
      new Promise<string | null>((resolve) => {
        const Ctor = browserRecognition();
        if (!Ctor) {
          setError("Voice input is not supported in this browser. Please type instead.");
          return resolve(null);
        }
        const r = new Ctor();
        r.lang = BCP47[language];
        r.interimResults = false;
        r.maxAlternatives = 1;
        let text: string | null = null;
        r.onresult = (e) => (text = e.results[0]?.[0]?.transcript ?? null);
        r.onerror = (e) => setError(e.error === "not-allowed" ? "Microphone permission was denied." : "Could not hear clearly. Try again or type instead.");
        r.onend = () => {
          setListening(false);
          resolve(text);
        };
        stopRef.current = () => r.stop();
        setListening(true);
        r.start();
      }),
    [],
  );

  const viaSarvam = useCallback(async (language: VoiceLanguage): Promise<string | null> => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const type = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
    const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise<void>((r) => (rec.onstop = () => r()));
    const timer = setTimeout(() => rec.state !== "inactive" && rec.stop(), MAX_RECORD_MS);
    stopRef.current = () => rec.state !== "inactive" && rec.stop();
    setListening(true);
    rec.start();
    await done;
    clearTimeout(timer);
    stream.getTracks().forEach((t) => t.stop());
    setListening(false);
    const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
    const form = new FormData();
    form.append("audio", blob);
    form.append("language", language === "ENGLISH" ? "en-IN" : "unknown");
    const res = await fetch("/api/voice/transcribe", { method: "POST", body: form });
    if (!res.ok) throw new Error(String(res.status));
    return ((await res.json()) as { transcript?: string }).transcript ?? null;
  }, []);

  /** Records one utterance and returns the transcript (null when nothing usable was heard). */
  const listen = useCallback(
    async (language: VoiceLanguage): Promise<string | null> => {
      setError(null);
      const canRecord = "MediaRecorder" in window && Boolean(navigator.mediaDevices?.getUserMedia);
      if (!canRecord) useSarvam.current = false;
      if (useSarvam.current) {
        try {
          return await viaSarvam(language);
        } catch {
          setListening(false);
          useSarvam.current = false;
          if (!browserRecognition()) {
            setError("Could not transcribe. Please type instead.");
            return null;
          }
        }
      }
      return viaBrowser(language);
    },
    [viaBrowser, viaSarvam],
  );

  const stop = useCallback(() => stopRef.current?.(), []);

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

  return { listening, error, listen, stop, speak, setError };
}
