'use client';

interface ConfidenceSliderProps {
  id?: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  showAnchors?: boolean;
  showLabel?: boolean;
  calibrationHint?: string | null;
}

export function ConfidenceSlider({
  id,
  value,
  onChange,
  disabled = false,
  showAnchors = true,
  showLabel = true,
  calibrationHint = null,
}: ConfidenceSliderProps) {
  const label = getConfidenceLabel(value);
  const color = getConfidenceColor(value);

  return (
    <div className="space-y-3">
      {showLabel ? (
        <div className="flex flex-wrap items-center gap-2" style={{ color }}>
          <span className="text-sm font-semibold">{value}%</span>
          <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-medium">{label}</span>
        </div>
      ) : null}

      <input
        id={id}
        type="range"
        min={5}
        max={95}
        step={5}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        disabled={disabled}
        className="h-2 w-full appearance-none rounded-full outline-none"
        style={{
          background: `linear-gradient(to right, ${color} 0%, ${color} ${value}%, var(--color-track) ${value}%, var(--color-track) 100%)`,
        }}
        aria-label={`Confidence: ${value}%`}
        aria-valuemin={5}
        aria-valuemax={95}
        aria-valuenow={value}
      />

      {showAnchors ? (
        <div className="flex justify-between text-xs uppercase tracking-[0.14em] text-[var(--muted-ink)]">
          <span>5%</span>
          <span>50% coin flip</span>
          <span>95%</span>
        </div>
      ) : null}

      {calibrationHint ? (
        <div className="flex items-start gap-2 rounded-[16px] border border-[#d7c06c] bg-[#fff8df] px-3 py-2 text-sm leading-6 text-[#5a460d]">
          <span aria-hidden="true">⚠</span>
          <span>{calibrationHint}</span>
        </div>
      ) : null}
    </div>
  );
}

function getConfidenceLabel(value: number): string {
  if (value <= 10) return "Almost impossible";
  if (value <= 25) return "Very unlikely";
  if (value <= 40) return "Probably not";
  if (value <= 55) return "Uncertain";
  if (value <= 65) return "More likely than not";
  if (value <= 75) return "Probably";
  if (value <= 85) return "Likely";
  if (value <= 92) return "Very likely";
  return "Almost certain";
}

function getConfidenceColor(value: number): string {
  if (value < 40) return "var(--color-low-confidence)";
  if (value < 60) return "var(--color-mid-confidence)";
  return "var(--color-high-confidence)";
}
