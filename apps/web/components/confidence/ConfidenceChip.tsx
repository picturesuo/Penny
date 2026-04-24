import type { HTMLAttributes } from "react";
import { cx } from "../../lib/design/classes";

export type ConfidenceScale = "percent" | "basis-points";
export type ConfidenceTone = "unrated" | "low" | "medium" | "high";
export type ConfidenceValue = number | null | undefined;

export type ConfidencePoint = {
  value: number;
  createdAt?: string;
};

export function normalizeConfidenceValue(value: ConfidenceValue, scale: ConfidenceScale = "percent") {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }

  const percentValue = scale === "basis-points" ? value / 100 : value;
  return Math.max(0, Math.min(100, Math.round(percentValue)));
}

export function getConfidenceTone(value: number | null): ConfidenceTone {
  if (value === null) {
    return "unrated";
  }

  if (value >= 70) {
    return "high";
  }

  if (value >= 40) {
    return "medium";
  }

  return "low";
}

export function getConfidenceRatingLabel(value: number | null) {
  const tone = getConfidenceTone(value);

  return {
    high: "High",
    low: "Low",
    medium: "Medium",
    unrated: "Unrated",
  }[tone];
}

export function formatConfidenceValue(value: number | null, label = "confidence", unratedLabel = "Unrated") {
  if (value === null) {
    return unratedLabel;
  }

  return label ? `${value}% ${label}` : `${value}%`;
}

export type ConfidenceChipProps = Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
  label?: string;
  scale?: ConfidenceScale;
  showLabel?: boolean;
  unratedLabel?: string;
  value: ConfidenceValue;
};

export function ConfidenceChip({
  className,
  label = "confidence",
  scale = "percent",
  showLabel = true,
  unratedLabel = "Unrated",
  value,
  ...props
}: ConfidenceChipProps) {
  const normalizedValue = normalizeConfidenceValue(value, scale);
  const tone = getConfidenceTone(normalizedValue);
  const ratingLabel = normalizedValue === null ? unratedLabel : getConfidenceRatingLabel(normalizedValue);
  const displayValue = showLabel && normalizedValue !== null ? `${ratingLabel} ${label}` : ratingLabel;
  const ariaValue =
    normalizedValue === null ? "Confidence unrated" : `${displayValue}, ${formatConfidenceValue(normalizedValue, "")}`;

  return (
    <span
      aria-label={ariaValue}
      className={cx("confidence-chip", `confidence-chip--${tone}`, className)}
      data-state={normalizedValue === null ? "unrated" : "rated"}
      {...props}
    >
      <span className="confidence-chip__dot" aria-hidden="true" />
      <span>{displayValue}</span>
    </span>
  );
}
