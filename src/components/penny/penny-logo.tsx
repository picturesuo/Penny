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
          "inline-flex size-10 items-center justify-center text-[var(--accent-primary)] drop-shadow-[0_12px_24px_rgba(18,16,14,0.22)]",
          markClassName,
        )}
      >
        <svg viewBox="0 0 96 96" className="size-full" fill="none">
          <defs>
            <radialGradient id="pennyGlow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(48 48) rotate(90) scale(44)">
              <stop offset="0" stopColor="#F0A35F" stopOpacity="0.45" />
              <stop offset="1" stopColor="#F0A35F" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="pennyMedallion" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(36 28) rotate(53) scale(58)">
              <stop offset="0" stopColor="#F39A4C" />
              <stop offset="0.62" stopColor="#D97A28" />
              <stop offset="1" stopColor="#A95216" />
            </radialGradient>
            <linearGradient id="pennySymbol" x1="48" y1="18" x2="48" y2="78" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#F39A4C" />
              <stop offset="1" stopColor="#C96520" />
            </linearGradient>
          </defs>

          <circle cx="48" cy="48" r="46" fill="url(#pennyGlow)" />
          <circle cx="48" cy="48" r="40" fill="url(#pennyMedallion)" stroke="#8F4312" strokeWidth="1.2" />

          <g fill="url(#pennySymbol)" stroke="#A14E18" strokeWidth="0.9" strokeLinejoin="round">
            <path d="M44.5 48V24H39L48 11L57 24H51.5V48H44.5Z" />
            <path d="M44.5 48V24H39L48 11L57 24H51.5V48H44.5Z" transform="rotate(45 48 48)" />
            <path d="M44.5 48V24H39L48 11L57 24H51.5V48H44.5Z" transform="rotate(90 48 48)" />
            <path d="M44.5 48V24H39L48 11L57 24H51.5V48H44.5Z" transform="rotate(135 48 48)" />
            <path d="M44.5 48V24H39L48 11L57 24H51.5V48H44.5Z" transform="rotate(180 48 48)" />
            <path d="M44.5 48V24H39L48 11L57 24H51.5V48H44.5Z" transform="rotate(225 48 48)" />
            <path d="M44.5 48V24H39L48 11L57 24H51.5V48H44.5Z" transform="rotate(270 48 48)" />
            <path d="M44.5 48V24H39L48 11L57 24H51.5V48H44.5Z" transform="rotate(315 48 48)" />
            <circle cx="48" cy="48" r="6" fill="#CF6A24" stroke="none" />
          </g>
        </svg>
      </span>
      {showLabel ? <span className={cn("text-lg font-semibold text-[var(--ink)]", labelClassName)}>Penny</span> : null}
    </span>
  );
}
