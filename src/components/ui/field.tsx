import type { InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  name: string;
  errors?: string[];
  hint?: string;
};

export function Field({ label, name, errors, hint, className = "", ...rest }: Props) {
  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={name} className="block text-xs font-semibold uppercase tracking-wider text-[#525866]">
          {label}
        </label>
        {hint ? <span id={hintId} className="text-xs text-[#737B8C]">{hint}</span> : null}
      </div>
      <input
        id={name}
        name={name}
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={[errors?.length ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined}
        className={`block w-full rounded-lg border border-[#D0D5DD] bg-white px-3.5 py-2 text-sm text-[#171A23] placeholder:text-[#94A3B8] shadow-[0_1px_2px_rgba(16,24,40,0.03)] transition-colors focus:border-[#4338CA] focus:outline-none focus:ring-2 focus:ring-[#4338CA]/20 aria-invalid:border-rose-500 aria-invalid:focus:ring-rose-500/20 ${className}`}
        {...rest}
      />
      {errors?.length ? (
        <p id={errorId} className="text-xs font-medium text-rose-600">
          {errors[0]}
        </p>
      ) : null}
    </div>
  );
}
