"use client";

import { useState, useTransition } from "react";
import { whatsappOpenedAction } from "./actions";

export type WhatsAppTarget = { customerId: string; name: string; href: string | null; blocked: string | null; opened: boolean };

export function WhatsAppSendList({ recommendationId, targets }: { recommendationId: string; targets: WhatsAppTarget[] }) {
  const [error, setError] = useState<string>();
  const [, start] = useTransition();

  const record = (customerId: string) =>
    start(async () => {
      const r = await whatsappOpenedAction(recommendationId, customerId);
      setError(r.error);
    });

  return (
    <div className="space-y-3">
      <p className="text-xs text-[#171A23]">
        Each button opens WhatsApp with the approved message ready. Tap <strong>Send</strong> there. The message goes from your own WhatsApp number, and DukaanIQ cannot see whether it was delivered.
      </p>
      {error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}
      <ul className="divide-y divide-[#F0F2F5] text-xs">
        {targets.map((t) => (
          <li key={t.customerId} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <span className="font-semibold text-[#171A23]">{t.name}</span>
            {t.blocked ? (
              <span className="text-[#737B8C]">{t.blocked}</span>
            ) : t.href ? (
              <a
                href={t.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => record(t.customerId)}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white hover:bg-emerald-700"
              >
                {t.opened ? "Open again in WhatsApp" : "Send on WhatsApp"}
              </a>
            ) : null}
            {t.opened ? <span className="w-full text-[11px] text-emerald-700">Opened in WhatsApp</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
