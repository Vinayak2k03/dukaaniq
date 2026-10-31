"use client";

import { useEffect, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "@/components/ui/icons";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m: m - 1, d };
};
const label = (s: string) => {
  const { y, m, d } = parse(s);
  return `${pad(d)} ${MONTHS[m].slice(0, 3)} ${y}`;
};

/**
 * Calendar popover on plain YYYY-MM-DD strings (no Date objects, so no timezone drift).
 * Days after `max` (or before `min`) are shown greyed and cannot be selected.
 */
export function DatePicker({
  label: ariaLabel,
  value,
  onChange,
  max,
  min,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  max?: string;
  min?: string;
}) {
  const [open, setOpen] = useState(false);
  const start = parse(value || max || "2026-01-01");
  const [view, setView] = useState({ y: start.y, m: start.m });
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const maxP = max ? parse(max) : null;
  const minP = min ? parse(min) : null;
  const canNext = !maxP || view.y < maxP.y || (view.y === maxP.y && view.m < maxP.m);
  const canPrev = !minP || view.y > minP.y || (view.y === minP.y && view.m > minP.m);

  const step = (delta: number) => {
    const t = view.y * 12 + view.m + delta;
    setView({ y: Math.floor(t / 12), m: t % 12 });
  };

  const firstWeekday = new Date(Date.UTC(view.y, view.m, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const cells = [...Array<null>(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (!open) setView({ y: parse(value || max || "2026-01-01").y, m: parse(value || max || "2026-01-01").m });
          setOpen((o) => !o);
        }}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[#D0D5DD] bg-white px-2.5 py-1.5 text-xs font-medium text-[#171A23] shadow-[0_1px_2px_rgba(16,24,40,0.03)] hover:border-[#4338CA]/50 focus:border-[#4338CA] focus:outline-none focus:ring-2 focus:ring-[#4338CA]/20 cursor-pointer"
      >
        <Calendar size={13} className="text-[#4338CA]" />
        <span className="tabular-nums">{value ? label(value) : "Select date"}</span>
      </button>

      {open && (
        <div role="dialog" aria-label={ariaLabel} className="absolute left-0 z-30 mt-1.5 w-64 rounded-xl border border-[#E2E4E9] bg-white p-3 shadow-[0_8px_24px_rgba(16,24,40,0.12)]">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" aria-label="Previous month" disabled={!canPrev} onClick={() => step(-1)} className="rounded-md p-1 text-[#525866] hover:bg-[#EEF2FF] hover:text-[#4338CA] disabled:cursor-not-allowed disabled:text-[#CBD5E1] disabled:hover:bg-transparent">
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-semibold text-[#171A23]">
              {MONTHS[view.m]} {view.y}
            </span>
            <button type="button" aria-label="Next month" disabled={!canNext} onClick={() => step(1)} className="rounded-md p-1 text-[#525866] hover:bg-[#EEF2FF] hover:text-[#4338CA] disabled:cursor-not-allowed disabled:text-[#CBD5E1] disabled:hover:bg-transparent">
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-y-0.5 text-center">
            {WEEKDAYS.map((w) => (
              <span key={w} className="pb-1 text-[10px] font-semibold uppercase text-[#94A3B8]">
                {w}
              </span>
            ))}
            {cells.map((d, i) => {
              if (d === null) return <span key={`b${i}`} />;
              const s = ymd(view.y, view.m, d);
              const disabled = (max !== undefined && s > max) || (min !== undefined && s < min);
              const selected = s === value;
              return (
                <button
                  key={s}
                  type="button"
                  disabled={disabled}
                  aria-label={label(s)}
                  aria-pressed={selected}
                  onClick={() => {
                    onChange(s);
                    setOpen(false);
                  }}
                  className={`mx-auto h-8 w-8 rounded-full text-xs tabular-nums transition-colors ${
                    selected
                      ? "bg-[#4338CA] font-semibold text-white"
                      : disabled
                        ? "cursor-not-allowed text-[#CBD5E1]"
                        : "text-[#171A23] hover:bg-[#EEF2FF] hover:text-[#4338CA] cursor-pointer"
                  }`}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
