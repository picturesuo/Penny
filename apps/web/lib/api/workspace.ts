import { createPennyApiClient, type ApiRequestOptions, type PennyApiClientOptions } from "./client";
import type { BrainView, ChallengeView, LearnView, ShellView, WorkspaceMode, WorkspaceViewByMode } from "../types/workspace";

export const workspaceProjectionPaths = {
  shell: "/api/workspace/shell",
  brain: "/api/workspace/brain",
  challenge: "/api/workspace/challenge",
  learn: "/api/workspace/learn",
} as const;

export type WorkspaceApiClient = ReturnType<typeof createWorkspaceApiClient>;

export function createWorkspaceApiClient(options: PennyApiClientOptions = {}) {
  const client = createPennyApiClient(options);

  return {
    getShellView(requestOptions?: ApiRequestOptions) {
      return client.get<ShellView>(workspaceProjectionPaths.shell, requestOptions);
    },
    getBrainView(requestOptions?: ApiRequestOptions) {
      return client.get<BrainView>(workspaceProjectionPaths.brain, requestOptions);
    },
    getChallengeView(requestOptions?: ApiRequestOptions) {
      return client.get<ChallengeView>(workspaceProjectionPaths.challenge, requestOptions);
    },
    getLearnView(requestOptions?: ApiRequestOptions) {
      return client.get<LearnView>(workspaceProjectionPaths.learn, requestOptions);
    },
    getWorkspaceView<M extends WorkspaceMode>(mode: M, requestOptions?: ApiRequestOptions): Promise<WorkspaceViewByMode[M]> {
      return client.get<WorkspaceViewByMode[M]>(workspaceProjectionPaths[mode], requestOptions);
    },
  };
}

export const workspaceApiClient = createWorkspaceApiClient();
