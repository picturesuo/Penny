import type { BrainProjectionView } from "./types";

export type BrainShellProjectionView = {
  mode: string;
  mapId: string | null;
  claimId: string | null;
  breadcrumb?: Array<{
    kind: "map" | "claim";
    id: string;
    label: string;
  }>;
  breadcrumbItems?: Array<{
    kind: "map" | "claim";
    id: string;
    label: string;
  }>;
};

export type BrainWorkspaceFetchResult = {
  shell: BrainShellProjectionView;
  brain: BrainProjectionView;
};

export type BrainWorkspaceFetchInput = {
  userId: string;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
  shellPath?: string;
  brainPath?: string;
};

async function readProjection<T>(
  fetcher: typeof fetch,
  path: string,
  input: Pick<BrainWorkspaceFetchInput, "signal" | "userId">,
): Promise<T> {
  const response = await fetcher(path, {
    headers: {
      "x-user-id": input.userId,
    },
    signal: input.signal,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `${path} failed with ${response.status}.`);
  }

  return (await response.json()) as T;
}

export async function fetchBrainWorkspace(input: BrainWorkspaceFetchInput): Promise<BrainWorkspaceFetchResult> {
  const fetcher = input.fetcher ?? fetch;
  const shellPath = input.shellPath ?? "/api/workspace/shell";
  const brainPath = input.brainPath ?? "/api/workspace/brain";
  const [shell, brain] = await Promise.all([
    readProjection<BrainShellProjectionView>(fetcher, shellPath, input),
    readProjection<BrainProjectionView>(fetcher, brainPath, input),
  ]);

  return {
    shell,
    brain,
  };
}
