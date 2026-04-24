"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrainViewModel, type BrainProjectionView } from "../../lib/viewmodels/brain";
import { BrainScreen } from "./brain-screen";

type BrainRouteState =
  | {
      status: "loading";
      projection: null;
      error: null;
    }
  | {
      status: "ready";
      projection: BrainProjectionView;
      error: null;
    }
  | {
      status: "error";
      projection: null;
      error: string;
    };

const localUserId = "00000000-0000-4000-8000-000000000001";

export function BrainRouteScreen() {
  const [state, setState] = useState<BrainRouteState>({
    status: "loading",
    projection: null,
    error: null,
  });
  const [selectedThoughtId, setSelectedThoughtId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadBrain() {
      try {
        const response = await fetch("/api/workspace/brain", {
          headers: {
            "x-user-id": localUserId,
          },
          signal: controller.signal,
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? `Brain projection failed with ${response.status}.`);
        }

        const projection = (await response.json()) as BrainProjectionView;
        setState({
          status: "ready",
          projection,
          error: null,
        });
        setSelectedThoughtId(projection.selectedClaim?.id ?? projection.currentContext?.claimId ?? null);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setState({
          status: "error",
          projection: null,
          error: error instanceof Error ? error.message : "Brain projection failed.",
        });
      }
    }

    loadBrain();

    return () => {
      controller.abort();
    };
  }, []);

  const projection = useMemo(() => {
    if (state.status !== "ready") {
      return null;
    }

    if (!selectedThoughtId) {
      return state.projection;
    }

    const selectedClaim = state.projection.claims.find((claim) => claim.id === selectedThoughtId) ?? state.projection.selectedClaim;

    return {
      ...state.projection,
      currentContext: {
        ...(state.projection.currentContext ?? state.projection.workspaceContext ?? { mode: "brain", mapId: null }),
        claimId: selectedThoughtId,
      },
      selectedClaim,
    };
  }, [selectedThoughtId, state]);

  if (state.status === "loading") {
    return <BrainScreen model={createBrainViewModel(emptyBrainProjection())} state="loading" statusMessage="Loading Brain projection." />;
  }

  if (state.status === "error") {
    return <BrainScreen model={createBrainViewModel(emptyBrainProjection())} state="error" statusMessage={state.error} />;
  }

  const model = createBrainViewModel(projection ?? state.projection);

  return (
    <BrainScreen
      model={model}
      onSelectThought={setSelectedThoughtId}
      state={model.stream.length > 0 ? "populated" : "empty"}
      statusMessage="Projection loaded from /api/workspace/brain."
    />
  );
}

function emptyBrainProjection(): BrainProjectionView {
  return {
    currentContext: {
      mode: "brain",
      mapId: null,
      claimId: null,
    },
    workspaceContext: {
      mode: "brain",
      mapId: null,
      claimId: null,
    },
    mapSummary: null,
    claims: [],
    selectedClaim: null,
    recentEvents: [],
  };
}
