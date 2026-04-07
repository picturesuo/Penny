import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
};

export function Button({
  className,
  variant = "primary",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60",
        variant === "primary" &&
          "bg-[var(--ink)] text-[var(--paper)] shadow-[0_12px_40px_rgba(34,39,46,0.16)] hover:bg-[var(--ink-soft)]",
        variant === "secondary" &&
          "bg-white text-[var(--ink)] ring-1 ring-black/10 hover:bg-[var(--panel)]",
        variant === "ghost" && "text-[var(--muted-ink)] hover:bg-black/5",
        variant === "danger" && "bg-[#6f2c25] text-white hover:bg-[#5d241e]",
        className,
      )}
      {...props}
    />
  );
}
