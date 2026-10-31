"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Mic, X } from "@/components/ui/icons";
import { ShopAssistant } from "./shop-assistant";

/** Any page can open the assistant, optionally with a sentence to run: `openAssistant("2 Maggi becha")`. */
export const ASSISTANT_EVENT = "dukaaniq:assistant";
export const openAssistant = (text?: string) => window.dispatchEvent(new CustomEvent(ASSISTANT_EVENT, { detail: { text } }));

const EXAMPLES = ["2 Maggi aur 1 Parle-G becha, cash", "Rahul ka kitna udhaar baaki hai?", "Aaj ki sales kitni hui?", "Naya product add karo", "Koi tips do"];

/** Pages with their own voice bar for that page's job (approving one suggestion, growth tips); no second mic there. */
const OWN_VOICE = [/^\/dashboard\/grow-profit/, /^\/dashboard\/action-centre\/[^/]+$/];

/** The same mic button in the same corner of every page; opens the full assistant as a panel (a bottom sheet on phones). */
export function AssistantDock({ sarvam, referenceDate }: { sarvam: boolean; referenceDate: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [run, setRun] = useState<{ id: number; text?: string }>({ id: 0 });

  useEffect(() => {
    const onOpen = (e: Event) => {
      const text = (e as CustomEvent<{ text?: string }>).detail?.text;
      setOpen(true);
      if (text) setRun((r) => ({ id: r.id + 1, text }));
    };
    window.addEventListener(ASSISTANT_EVENT, onOpen);
    return () => window.removeEventListener(ASSISTANT_EVENT, onOpen);
  }, []);

  if (OWN_VOICE.some((re) => re.test(pathname))) return null;

  return (
    <>
      {open ? (
        <div role="dialog" aria-label="Shop assistant" className="fixed inset-x-0 bottom-0 z-40 max-h-[85vh] overflow-y-auto rounded-t-2xl border border-[#E2E4E9] bg-white p-3 shadow-2xl sm:inset-x-auto sm:bottom-24 sm:right-6 sm:w-[440px] sm:rounded-2xl">
          <div className="mb-2 flex items-center justify-between px-1">
            <div>
              <p className="text-sm font-bold text-[#171A23]">Bolkar batayein</p>
              <p className="text-[11px] text-[#737B8C]">Speak or type. Nothing is saved until you tap Save.</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close assistant" className="rounded-full p-1.5 text-[#525866] hover:bg-[#F4F5F7]">
              <X size={18} />
            </button>
          </div>
          <ShopAssistant key={run.id} sarvam={sarvam} referenceDate={referenceDate} initialText={run.text} examples={EXAMPLES} placeholder='Try "2 Maggi becha, cash"' />
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close assistant" : "Open voice assistant"}
        aria-expanded={open}
        className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#4338CA] text-white shadow-[0_8px_24px_rgba(67,56,202,0.45)] transition-transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-indigo-300 sm:bottom-6 sm:right-6"
      >
        {open ? <X size={22} /> : <Mic size={24} />}
      </button>
    </>
  );
}
