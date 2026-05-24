import type { BrainScope } from "./scope.ts";
import { scopeValues } from "./scope.ts";
import type { PersistedBrainSeed } from "./seed-persistence.ts";

const devPersistedSeeds: PersistedBrainSeed[] = [];

export function rememberDevPersistedBrainSeed(seed: PersistedBrainSeed): void {
  const existingIndex = devPersistedSeeds.findIndex((candidate) => candidate.session.id === seed.session.id);

  if (existingIndex >= 0) {
    devPersistedSeeds.splice(existingIndex, 1, seed);
    return;
  }

  devPersistedSeeds.unshift(seed);
}

export function listDevPersistedBrainSeeds(scope: BrainScope): PersistedBrainSeed[] {
  return devPersistedSeeds.filter((seed) => sameScope(scopeValues(seed.session), scope));
}

export function shouldUseLocalInMemoryPennyData(databaseUrl: string | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!databaseUrl?.trim() || env.NODE_ENV === "production") {
    return false;
  }

  const authMode = env.PENNY_AUTH_MODE?.trim().toLowerCase();
  return readEnvFlag(env.PENNY_SKIP_DATABASE_PREP, false) && (!authMode || authMode === "dev");
}

function sameScope(left: BrainScope, right: BrainScope): boolean {
  return (
    left.userId === right.userId &&
    left.workspaceId === right.workspaceId &&
    left.projectId === right.projectId &&
    left.sphereId === right.sphereId
  );
}

function readEnvFlag(value: string | undefined, fallback: boolean): boolean {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) {
    return fallback;
  }

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}
