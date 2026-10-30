import type { HTMLAttributes, ReactNode } from "react";

type BadgeVariant = "default" | "neutral" | "brand" | "success" | "warning" | "danger" | "outline";
type BadgeSize = "sm" | "md";

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-slate-100 text-slate-800 border-slate-200/80",
  neutral: "bg-slate-100 text-slate-700 border-slate-200",
  brand: "bg-indigo-50 text-indigo-700 border-indigo-200/70",
  success: "bg-emerald-50 text-emerald-800 border-emerald-200/80",
  warning: "bg-amber-50 text-amber-900 border-amber-200/80",
  danger: "bg-rose-50 text-rose-800 border-rose-200/80",
  outline: "bg-white text-slate-700 border-slate-300",
};

const dotColors: Record<BadgeVariant, string> = {
  default: "bg-slate-400",
  neutral: "bg-slate-400",
  brand: "bg-indigo-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-rose-500",
  outline: "bg-slate-400",
};

export function Badge({
  children,
  variant = "default",
  size = "md",
  withDot = false,
  className = "",
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
  withDot?: boolean;
}) {
  const sizeClasses = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-0.5 text-xs";
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium border rounded-full transition-colors ${variantStyles[variant]} ${sizeClasses} ${className}`}
      {...props}
    >
      {withDot ? <span className={`h-1.5 w-1.5 rounded-full ${dotColors[variant]}`} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

