import { AlertCircle } from "./icons";

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50/80 p-3 text-xs text-rose-800">
      <AlertCircle size={16} className="mt-0.5 shrink-0 text-rose-600" />
      <span className="leading-relaxed font-medium">{message}</span>
    </div>
  );
}
