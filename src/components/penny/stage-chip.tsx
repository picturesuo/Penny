import { Badge } from "@/components/ui/badge";
import { slugToTitle } from "@/lib/format";
import type { SessionStage } from "@/types/penny";

export function StageChip({ stage }: { stage: SessionStage }) {
  return <Badge>{slugToTitle(stage)}</Badge>;
}
