import { buildFeatureUnlockStatuses, buildUnlockSummary } from "@/lib/time-locked-features";
import { listThoughtMaps } from "@/server/thought-map";

export async function getFeatureUnlockStatuses(userId: string) {
  const maps = await listThoughtMaps();
  const statuses = buildFeatureUnlockStatuses({ userId, maps });

  return {
    statuses,
    summary: buildUnlockSummary(statuses),
  };
}
