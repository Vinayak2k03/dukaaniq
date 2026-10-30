import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const variantStyles: Record<ButtonVariant, string> = {
  primary: "bg-[#4338CA] text-white hover:bg-[#3730A3] active:bg-[#312E81] border-transparent shadow-[0_1px_2px_rgba(67,56,202,0.2)]",
  secondary: "bg-[#F4F5F7] text-[#171A23] hover:bg-[#EAECEF] active:bg-[#E2E4E9] border-transparent",
  outline: "bg-white text-[#171A23] hover:bg-[#F8F9FA] active:bg-[#F0F2F5] border-[#D0D5DD] shadow-[0_1px_2px_rgba(16,24,40,0.03)]",
  ghost: "bg-transparent text-[#525866] hover:bg-[#F4F5F7] hover:text-[#171A23] active:bg-[#EAECEF] border-transparent",
  danger: "bg-[#DC2626] text-white hover:bg-[#B91C1C] active:bg-[#991B1B] border-transparent shadow-[0_1px_2px_rgba(220,38,38,0.2)]",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-2.5 py-1.5 text-xs font-medium rounded-lg gap-1.5",
  md: "px-3.5 py-2 text-sm font-medium rounded-lg gap-2",
  lg: "px-4.5 py-2.5 text-sm font-semibold rounded-lg gap-2.5",
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  icon,
  className = "",
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
}) {
  return (
    <button
      disabled={disabled}
      className={`inline-flex items-center justify-center border font-sans transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338CA] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {icon ? <span className="shrink-0">{icon}</span> : null}
      {children}
    </button>
  );
}

