import { type WorkspaceProjectionInvalidationInput, type WorkspaceProjectionInvalidationResult } from "@/server/workspace-cache";

export type CommandResult<TRecord, TEvent = unknown> = {
  invalidation: WorkspaceProjectionInvalidationResult;
  events: TEvent[];
  record: TRecord;
};

export function buildInvalidationInput(
  userId: string,
  data: {
    mapId?: string | null;
    claimId?: string | null;
    conceptId?: string | null;
    workspaceContextId?: string | null;
  },
): WorkspaceProjectionInvalidationInput {
  return {
    userId,
    mapId: data.mapId ?? null,
    claimId: data.claimId ?? null,
    conceptId: data.conceptId ?? null,
    workspaceContextId: data.workspaceContextId ?? null,
  };
}
