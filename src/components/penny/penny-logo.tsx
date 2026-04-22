import { cn } from "@/lib/utils";

interface PennyLogoProps {
  className?: string;
  markClassName?: string;
  labelClassName?: string;
  showLabel?: boolean;
}

export function PennyLogo({
  className,
  markClassName,
  labelClassName,
  showLabel = true,
}: PennyLogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex size-10 items-center justify-center rounded-[12px] bg-[var(--ink)] text-[var(--accent-primary)] shadow-[0_14px_40px_rgba(18,16,14,0.18)]",
          markClassName,
        )}
      >
        <svg viewBox="0 0 32 32" className="size-7" fill="none">
          <path
            d="M10.5 26V11.7C10.5 7.05 13.77 4 18.08 4C22.12 4 25 6.75 25 10.55C25 14.62 21.9 17.55 17.55 17.55H13.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M17.38 17.4C14.78 17.4 12.82 15.55 12.82 12.92C12.82 10.18 14.94 8.4 17.42 8.4C20.08 8.4 21.98 10.34 21.98 12.86C21.98 15.54 19.95 17.4 17.38 17.4Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {showLabel ? <span className={cn("text-lg font-semibold text-[var(--ink)]", labelClassName)}>Penny</span> : null}
    </span>
  );
}
