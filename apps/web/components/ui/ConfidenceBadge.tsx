import { ConfidenceChip } from "../confidence/ConfidenceChip";

type ConfidenceBadgeProps = {
  value: number | null;
};

export function ConfidenceBadge({ value }: ConfidenceBadgeProps) {
  return <ConfidenceChip unratedLabel="Confidence unset" value={value} />;
}
