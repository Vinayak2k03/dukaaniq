"use client";

import { useEffect, useRef, type RefObject } from "react";

const LAYERS = [
  { rgb: "99,102,241", alpha: 1, freq: 1.3, speed: 1.7 },
  { rgb: "168,85,247", alpha: 0.85, freq: 1.8, speed: -1.3 },
  { rgb: "236,72,153", alpha: 0.7, freq: 2.3, speed: 2.1 },
  { rgb: "34,211,238", alpha: 0.6, freq: 2.9, speed: -1.8 },
];

/**
 * Siri-style flowing waves. "listening" follows the live mic level; "thinking" breathes on its own while the
 * words are being understood. Honours reduced-motion by drawing one calm static wave.
 */
export function VoiceWave({ levelRef, mode }: { levelRef: RefObject<number>; mode: "listening" | "thinking" }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let shown = 0;

    const draw = (ms: number) => {
      const dpr = window.devicePixelRatio || 1;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) {
        el.width = Math.round(w * dpr);
        el.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const t = ms / 1000;
      const target = mode === "thinking" ? 0.35 + 0.15 * Math.sin(t * 3) : Math.max(levelRef.current ?? 0, 0.06);
      shown += (target - shown) * 0.2;
      const amp = (h / 2) * 0.85 * (reduce ? 0.2 : shown);

      ctx.globalCompositeOperation = "lighter";
      ctx.lineWidth = 2.2;
      for (const [i, l] of LAYERS.entries()) {
        ctx.beginPath();
        for (let x = 0; x <= w; x += 3) {
          const nx = x / w;
          const envelope = Math.sin(Math.PI * nx) ** 2;
          const y = h / 2 + Math.sin(nx * Math.PI * 2 * l.freq + t * l.speed * (mode === "thinking" ? 1.6 : 1) + i) * amp * envelope * (1 - i * 0.12);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(${l.rgb},${l.alpha})`;
        ctx.shadowColor = `rgba(${l.rgb},0.9)`;
        ctx.shadowBlur = 10;
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
      if (!reduce) raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [levelRef, mode]);

  return <canvas ref={canvas} aria-hidden className="h-20 w-full" />;
}
