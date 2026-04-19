import { buildPersonalBaseRateLibrary } from "@/lib/personal-base-rates";
import { listThoughtMaps } from "@/server/thought-map";
import type { PersonalBaseRateLibrary } from "@/types/personal-base-rates";

export async function getPersonalBaseRateLibrary(userId: string): Promise<PersonalBaseRateLibrary> {
  const maps = (await listThoughtMaps()).filter((map) => map.userId === userId);
  return buildPersonalBaseRateLibrary(userId, maps);
}

