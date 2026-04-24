import { Badge } from "./Badge";

type ConfidenceBadgeProps = {
  value: number | null;
};

export function ConfidenceBadge({ value }: ConfidenceBadgeProps) {
  if (value === null) {
    return <Badge>Confidence unset</Badge>;
  }

  const boundedValue = Math.max(0, Math.min(100, value));
  const tone = boundedValue >= 70 ? "success" : "neutral";

  return <Badge tone={tone}>{boundedValue}% confidence</Badge>;
}
