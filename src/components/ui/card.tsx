import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[28px] border border-black/8 bg-white shadow-[0_20px_70px_rgba(15,23,42,0.08)]",
        className,
      )}
      {...props}
    />
  );
}
