"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Asks the server to rebuild the earlier tip as a fresh pending proposal, then opens it for review. Nothing is approved here. */
export function ReapplyButton({ recommendationId }: { recommendationId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reapply() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tips/reapply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recommendationId }) });
      const data = (await res.json()) as { recommendationId?: string; error?: string };
      if (!res.ok || !data.recommendationId) throw new Error(data.error ?? "Could not reapply this tip.");
      router.push(`/dashboard/action-centre/${data.recommendationId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reapply this tip.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button type="button" disabled={busy} onClick={() => void reapply()} className="rounded-lg bg-[#4338CA] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#3730A3] disabled:opacity-50">
        {busy ? "Preparing..." : "Reapply this tip"}
      </button>
      {error ? <p role="alert" className="text-[11px] text-rose-700">{error}</p> : null}
    </div>
  );
}
