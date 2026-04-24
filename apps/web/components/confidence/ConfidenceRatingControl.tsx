"use client";

import { useEffect, useId, useState, type FieldsetHTMLAttributes } from "react";
import { cx } from "../../lib/design/classes";
import { formatConfidenceValue, normalizeConfidenceValue, type ConfidenceScale } from "./ConfidenceChip";

export type ConfidenceRatingControlProps = Omit<FieldsetHTMLAttributes<HTMLFieldSetElement>, "children" | "onChange"> & {
  label?: string;
  name?: string;
  onChange?: (value: number | null) => void;
  onValueChange?: (value: number) => void | Promise<void>;
  options?: ReadonlyArray<number>;
  scale?: ConfidenceScale;
  value: number | null | undefined;
};

const defaultPercentOptions = [0, 25, 50, 75, 100] as const;
const defaultBasisPointOptions = [0, 2500, 5000, 7500, 10000] as const;

export function ConfidenceRatingControl({
  className,
  disabled,
  label = "Confidence",
  onChange,
  onValueChange,
  options,
  scale = "percent",
  value,
  ...props
}: ConfidenceRatingControlProps) {
  const generatedName = useId();
  const normalizedValue = normalizeConfidenceValue(value, scale);
  const [optimisticValue, setOptimisticValue] = useState(normalizedValue);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const isReadOnly = !onValueChange && !onChange;
  const isSaving = status === "saving";
  const resolvedOptions = options ?? (scale === "basis-points" ? defaultBasisPointOptions : defaultPercentOptions);
  const optionItems = resolvedOptions
    .map((option) => ({ normalizedValue: normalizeConfidenceValue(option, scale), option }))
    .filter((option): option is { normalizedValue: number; option: number } => option.normalizedValue !== null);

  useEffect(() => {
    setOptimisticValue(normalizedValue);
  }, [normalizedValue]);

  async function setConfidence(item: { normalizedValue: number; option: number }) {
    if (disabled || isReadOnly || isSaving) {
      return;
    }

    const previousValue = optimisticValue;
    setOptimisticValue(item.normalizedValue);
    setStatus("saving");

    try {
      onChange?.(item.option);
      await onValueChange?.(item.option);
      setStatus("idle");
    } catch {
      setOptimisticValue(previousValue);
      setStatus("error");
    }
  }

  return (
    <fieldset
      className={cx("confidence-rating-control", className)}
      aria-busy={isSaving}
      aria-describedby={`${generatedName}-status`}
      data-state={optimisticValue === null ? "unrated" : "rated"}
      data-status={status}
      disabled={disabled}
      {...props}
    >
      <legend className="confidence-rating-control__legend">{label}</legend>
      <div className="confidence-rating-control__options">
        {optionItems.map((item) => (
          <button
            aria-pressed={optimisticValue === item.normalizedValue}
            className="confidence-rating-control__option"
            data-selected={optimisticValue === item.normalizedValue}
            disabled={disabled || isReadOnly || isSaving}
            key={item.normalizedValue}
            onClick={() => {
              void setConfidence(item);
            }}
            type="button"
          >
            <span>{formatConfidenceValue(item.normalizedValue, "")}</span>
          </button>
        ))}
      </div>
      <span className="ui-sr-only" id={`${generatedName}-status`} role="status">
        {status === "saving" ? "Saving confidence." : status === "error" ? "Confidence update failed." : ""}
      </span>
    </fieldset>
  );
}
