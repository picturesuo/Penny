import { revalidatePath, revalidateTag } from "next/cache";

export type WorkspaceProjectionInvalidationInput = {
  userId: string;
  mapId?: string | null;
  claimId?: string | null;
  conceptId?: string | null;
  workspaceContextId?: string | null;
};

export type WorkspaceProjectionInvalidationResult = {
  paths: string[];
  tags: string[];
};

export function getWorkspaceProjectionTags({
  userId,
  mapId,
  claimId,
  conceptId,
  workspaceContextId,
}: WorkspaceProjectionInvalidationInput): string[] {
  const tags = new Set<string>([
    `workspace:shell:${userId}`,
  ]);

  if (mapId) {
    tags.add(`workspace:brain:${userId}:${mapId}`);
    tags.add(`workspace:challenge:${userId}:${mapId}`);
    tags.add(`workspace:learn:${userId}:${mapId}`);
    tags.add(`map:${mapId}`);
  }

  if (claimId) {
    tags.add(`claim:${claimId}`);
  }

  if (conceptId) {
    tags.add(`concept:${conceptId}`);
  }

  if (workspaceContextId) {
    tags.add(`workspace:context:${workspaceContextId}`);
  }

  return Array.from(tags);
}

export function getWorkspaceProjectionPaths({ mapId }: WorkspaceProjectionInvalidationInput): string[] {
  const paths = new Set<string>(["/app", "/dashboard"]);

  if (mapId) {
    paths.add(`/maps/${mapId}`);
    paths.add(`/app/maps/${mapId}`);
  }

  return Array.from(paths);
}

export function invalidateWorkspaceProjections(
  input: WorkspaceProjectionInvalidationInput,
): WorkspaceProjectionInvalidationResult {
  const tags = getWorkspaceProjectionTags(input);
  const paths = getWorkspaceProjectionPaths(input);

  for (const tag of tags) {
    try {
      revalidateTag(tag, "max");
    } catch (error) {
      if (!isMissingRevalidationContext(error)) {
        throw error;
      }
    }
  }

  for (const path of paths) {
    try {
      revalidatePath(path);
    } catch (error) {
      if (!isMissingRevalidationContext(error)) {
        throw error;
      }
    }
  }

  return { paths, tags };
}

function isMissingRevalidationContext(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /static generation store missing/i.test(message);
}
