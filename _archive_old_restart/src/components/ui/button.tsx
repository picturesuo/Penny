import { cloneElement, isValidElement, type ButtonHTMLAttributes, type ReactElement, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  asChild?: boolean;
  children?: ReactNode;
};

export function Button({
  className,
  variant = "primary",
  type = "button",
  asChild = false,
  children,
  ...props
}: ButtonProps) {
  const resolvedClassName = cn(
    "inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60",
    variant === "primary" &&
      "bg-[var(--accent-primary)] text-[var(--paper)] shadow-[0_12px_40px_rgba(182,106,60,0.24)] hover:bg-[var(--accent-strong)]",
    variant === "secondary" && "bg-white text-[var(--ink)] ring-1 ring-black/10 hover:bg-[var(--panel)]",
    variant === "ghost" && "text-[var(--muted-ink)] hover:bg-black/5",
    variant === "danger" && "bg-[#6f2c25] text-white hover:bg-[#5d241e]",
    className,
  );

  if (asChild && isValidElement(children)) {
    const child = children as ReactElement<{ className?: string }>;

    return cloneElement(child, {
      ...props,
      className: cn(resolvedClassName, child.props.className),
    });
  }

  return (
    <button
      type={type}
      className={resolvedClassName}
      {...props}
    >
      {children}
    </button>
  );
}
