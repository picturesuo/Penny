import type { CSSProperties } from "react";

import { cx } from "../../lib/design/classes";

type SkeletonProps = {
  className?: string;
  height?: number | string;
  label?: string;
  width?: number | string;
};

const skeletonStyle: CSSProperties = {
  display: "block",
  minHeight: 14,
  borderRadius: 8,
  background: "linear-gradient(90deg, transparent, rgba(255, 253, 247, 0.16), transparent), rgba(255, 253, 247, 0.08)",
  backgroundSize: "220% 100%",
};

function toCssSize(value: number | string | undefined) {
  return typeof value === "number" ? `${value}px` : value;
}

export function Skeleton({ className, height, label = "Loading", width }: SkeletonProps) {
  return (
    <span
      aria-label={label}
      className={cx("penny-skeleton", className)}
      role="status"
      style={{
        ...skeletonStyle,
        height: toCssSize(height),
        width: toCssSize(width),
      }}
    />
  );
}
