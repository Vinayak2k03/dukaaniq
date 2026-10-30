"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

export function SubmitButton({
  children,
  pendingText,
  variant = "primary",
  className = "",
}: {
  children: ReactNode;
  pendingText?: string;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
}) {
  const { pending } = useFormStatus();

  const variantClass =
    variant === "danger"
      ? "bg-rose-600 hover:bg-rose-700 text-white shadow-[0_1px_2px_rgba(225,29,72,0.2)]"
      : variant === "secondary"
      ? "bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
      : "bg-[#4338CA] hover:bg-[#3730A3] text-white shadow-[0_1px_2px_rgba(67,56,202,0.2)]";

  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338CA] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer ${variantClass} ${className}`}
    >
      {pending && (
        <svg className="h-4 w-4 animate-spin text-current" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      )}
      {pending ? (pendingText ?? "Processing...") : children}
    </button>
  );
}
