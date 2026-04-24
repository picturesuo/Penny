import Image from "next/image";
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
        className={cn(
          "relative inline-flex size-10 items-center justify-center overflow-hidden rounded-full drop-shadow-[0_12px_24px_rgba(18,16,14,0.22)]",
          markClassName,
        )}
      >
        <Image
          src="/penny-logo-1.png"
          alt="Penny logo"
          width={1254}
          height={1254}
          priority
          className="size-full object-contain"
        />
      </span>
      {showLabel ? <span className={cn("text-lg font-semibold text-[var(--ink)]", labelClassName)}>Penny</span> : null}
    </span>
  );
}
