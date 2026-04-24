"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { createWorkspaceApiClient, type WorkspaceApiClient } from "../api/workspace";
import type { BrainView, ChallengeView, LearnView, ShellView, WorkspaceMode, WorkspaceViewByMode } from "../types/workspace";

export type WorkspaceViewState<T> = {
  data: T | null;
  error: Error | null;
  isLoading: boolean;
  refetch: () => void;
};

export type WorkspaceViewHookOptions = {
  enabled?: boolean;
  userId?: string;
  client?: WorkspaceApiClient;
};

function useWorkspaceRequest<T>(
  load: (client: WorkspaceApiClient, signal: AbortSignal) => Promise<T>,
  options: WorkspaceViewHookOptions = {},
): WorkspaceViewState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [version, setVersion] = useState(0);
  const enabled = options.enabled ?? true;
  const client = useMemo(
    () => options.client ?? createWorkspaceApiClient({ userId: options.userId }),
    [options.client, options.userId],
  );
  const refetch = useCallback(() => {
    setVersion((current) => current + 1);
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    load(client, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
        }
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setError(requestError instanceof Error ? requestError : new Error("Workspace request failed."));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [client, enabled, load, version]);

  return {
    data,
    error,
    isLoading,
    refetch,
  };
}

export function useShellView(options?: WorkspaceViewHookOptions): WorkspaceViewState<ShellView> {
  const load = useCallback((client: WorkspaceApiClient, signal: AbortSignal) => client.getShellView({ signal }), []);
  return useWorkspaceRequest(load, options);
}

export function useBrainView(options?: WorkspaceViewHookOptions): WorkspaceViewState<BrainView> {
  const load = useCallback((client: WorkspaceApiClient, signal: AbortSignal) => client.getBrainView({ signal }), []);
  return useWorkspaceRequest(load, options);
}

export function useChallengeView(options?: WorkspaceViewHookOptions): WorkspaceViewState<ChallengeView> {
  const load = useCallback((client: WorkspaceApiClient, signal: AbortSignal) => client.getChallengeView({ signal }), []);
  return useWorkspaceRequest(load, options);
}

export function useLearnView(options?: WorkspaceViewHookOptions): WorkspaceViewState<LearnView> {
  const load = useCallback((client: WorkspaceApiClient, signal: AbortSignal) => client.getLearnView({ signal }), []);
  return useWorkspaceRequest(load, options);
}

export function useWorkspaceView<M extends WorkspaceMode>(
  mode: M,
  options?: WorkspaceViewHookOptions,
): WorkspaceViewState<WorkspaceViewByMode[M]> {
  const load = useCallback(
    (client: WorkspaceApiClient, signal: AbortSignal) => client.getWorkspaceView(mode, { signal }),
    [mode],
  );
  return useWorkspaceRequest(load, options);
}
