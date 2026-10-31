"use client";

import { useState } from "react";
import Link from "next/link";
import { Mic, X } from "@/components/ui/icons";
import { ShopAssistant } from "@/components/voice/shop-assistant";
import { formatPaise } from "@/lib/money";

export type HomeFacts = {
  overduePaise: number;
  overdueCustomers: number;
  inactiveCustomers: number;
  waitingForYou: number;
  todaySalesPaise: number;
  todayBills: number;
};

const SAY = ["2 Maggi becha, cash", "Rahul ne 500 de diye", "Rahul ka kitna udhaar hai?"];

type Card = { tone: "red" | "amber" | "indigo" | "green"; big: string; text: string; href: string; cta: string };
const TONE = {
  red: "border-rose-200 bg-rose-50/60 text-rose-950",
  amber: "border-amber-200 bg-amber-50/60 text-amber-950",
  indigo: "border-indigo-200 bg-indigo-50/60 text-indigo-950",
  green: "border-emerald-200 bg-emerald-50/60 text-emerald-950",
} as const;

/** "What needs your attention today": a few cards with one button each, built from the shop's own numbers. */
export function HomeActions({ facts, sarvam, referenceDate }: { facts: HomeFacts; sarvam: boolean; referenceDate: string }) {
  const [panel, setPanel] = useState<{ open: boolean; id: number; text?: string }>({ open: false, id: 0 });
  const openPanel = (text?: string) => setPanel((p) => ({ open: true, id: p.id + 1, text }));
  const cards: Card[] = [
    facts.overduePaise > 0
      ? { tone: "red", big: formatPaise(facts.overduePaise), text: `udhaar is overdue from ${facts.overdueCustomers} customer${facts.overdueCustomers === 1 ? "" : "s"}`, href: "/dashboard/action-centre", cta: "Prepare reminders" }
      : { tone: "green", big: "No overdue udhaar", text: "Everyone is within their due date", href: "/dashboard/udhaar", cta: "Open Udhaar" },
    facts.waitingForYou > 0
      ? { tone: "indigo", big: String(facts.waitingForYou), text: `suggestion${facts.waitingForYou === 1 ? " is" : "s are"} waiting for your OK`, href: "/dashboard/action-centre", cta: "Review" }
      : { tone: "green", big: "All reviewed", text: "Nothing is waiting for your approval", href: "/dashboard/grow-profit", cta: "Get new ideas" },
    { tone: "amber", big: String(facts.inactiveCustomers), text: `customer${facts.inactiveCustomers === 1 ? " has" : "s have"} not come in over 30 days`, href: "/dashboard/recover-customers", cta: "See who" },
    { tone: "green", big: formatPaise(facts.todaySalesPaise), text: `sales today from ${facts.todayBills} bill${facts.todayBills === 1 ? "" : "s"}`, href: "/dashboard/transactions", cta: "See bills" },
  ];

  return (
    <section aria-label="What needs your attention today" className="space-y-3">
      <div className="flex flex-col gap-3 rounded-2xl bg-gradient-to-r from-[#312E81] to-[#4338CA] p-4 text-white sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => (panel.open ? setPanel((p) => ({ ...p, open: false })) : openPanel())} aria-label="Open voice assistant" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-[#4338CA] shadow-lg transition-transform hover:scale-105">
            <Mic size={22} />
          </button>
          <div>
            <p className="text-sm font-bold">Bolkar batayein: sale, udhaar ya sawaal</p>
            <p className="text-xs text-indigo-100">Speak or type in Hindi, Hinglish or English. You check everything before it is saved.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SAY.map((s) => (
            <button key={s} type="button" onClick={() => openPanel(s)} className="rounded-full border border-white/30 bg-white/10 px-3 py-1 text-[11px] font-medium hover:bg-white/20">
              {s}
            </button>
          ))}
        </div>
      </div>

      {panel.open ? (
        <div role="region" aria-label="Shop assistant" className="rounded-2xl border border-[#E2E4E9] bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between px-1">
            <div>
              <p className="text-sm font-bold text-[#171A23]">Bolkar batayein</p>
              <p className="text-[11px] text-[#737B8C]">Speak or type. Nothing is saved until you tap Save.</p>
            </div>
            <button type="button" onClick={() => setPanel((p) => ({ ...p, open: false }))} aria-label="Close assistant" className="rounded-full p-1.5 text-[#525866] hover:bg-[#F4F5F7]">
              <X size={18} />
            </button>
          </div>
          <ShopAssistant key={panel.id} sarvam={sarvam} referenceDate={referenceDate} initialText={panel.text} examples={SAY} placeholder='Try "2 Maggi becha, cash"' />
        </div>
      ) : null}

      <h2 className="pt-1 text-sm font-bold text-[#171A23]">What needs your attention today</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <div key={c.cta + c.big} className={`flex flex-col justify-between gap-3 rounded-xl border p-4 ${TONE[c.tone]}`}>
            <div>
              <p className="text-xl font-bold tabular-nums">{c.big}</p>
              <p className="mt-0.5 text-xs opacity-80">{c.text}</p>
            </div>
            <Link href={c.href} className="w-fit rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-[#171A23] shadow-xs ring-1 ring-black/5 hover:bg-[#F8F9FB]">
              {c.cta} &rarr;
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
