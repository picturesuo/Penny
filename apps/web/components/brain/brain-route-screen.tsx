"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createBrainViewModel,
  createEmptyBrainProjection,
  createBrainInteractionUrl,
  createMockBrainProjection,
  fetchBrainWorkspace,
  shouldUseMockBrainData,
  type BrainWorkspaceMode,
  type BrainShellProjectionView,
  type BrainProjectionView,
} from "../../lib/viewmodels/brain";
import { BrainScreen } from "./brain-screen";

type BrainRouteState =
  | {
      status: "loading";
      projection: null;
      error: null;
    }
  | {
      status: "ready";
      shell: BrainShellProjectionView | null;
      projection: BrainProjectionView;
      source: "api" | "mock";
      error: null;
    }
  | {
      status: "error";
      projection: null;
      error: string;
    };

const localUserId = "00000000-0000-4000-8000-000000000001";

function readClaimIdFromLocation() {
  return new URLSearchParams(window.location.search).get("claimId");
}

function writeBrainUrl(mode: BrainWorkspaceMode, claimId: string | null) {
  window.history.replaceState(
    null,
    "",
    createBrainInteractionUrl({
      currentHref: window.location.href,
      mode,
      selectedClaimId: claimId,
    }),
  );
}

export function BrainRouteScreen() {
  const [state, setState] = useState<BrainRouteState>({
    status: "loading",
    projection: null,
    error: null,
  });
  const [activeMode, setActiveMode] = useState<BrainWorkspaceMode>("brain");
  const [interactionMessage, setInteractionMessage] = useState<string | null>(null);
  const [selectedThoughtId, setSelectedThoughtId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const requestedClaimId = readClaimIdFromLocation();
    const requestedMode = new URLSearchParams(window.location.search).get("mode");

    if (requestedMode === "brain" || requestedMode === "challenge" || requestedMode === "learn") {
      setActiveMode(requestedMode);
    }

    async function loadBrain() {
      try {
        if (shouldUseMockBrainData(window.location.search)) {
          const projection = createMockBrainProjection();
          setState({
            status: "ready",
            shell: null,
            projection,
            source: "mock",
            error: null,
          });
          setSelectedThoughtId(requestedClaimId ?? projection.selectedClaim?.id ?? projection.currentContext?.claimId ?? null);
          return;
        }

        const workspace = await fetchBrainWorkspace({
          userId: localUserId,
          signal: controller.signal,
        });
        setState({
          status: "ready",
          shell: workspace.shell,
          projection: workspace.brain,
          source: "api",
          error: null,
        });
        setSelectedThoughtId(
          requestedClaimId ?? workspace.brain.selectedClaim?.id ?? workspace.brain.currentContext?.claimId ?? workspace.shell.claimId ?? null,
        );
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

  function handleSelectThought(thoughtId: string) {
    setSelectedThoughtId(thoughtId);
    setInteractionMessage("Selected claim preserved in Brain.");
    writeBrainUrl(activeMode, thoughtId);
  }

  function handleChangeMode(mode: BrainWorkspaceMode) {
    const claimId = selectedThoughtId ?? (state.status === "ready" ? state.projection.currentContext?.claimId ?? null : null);
    setActiveMode(mode);
    setInteractionMessage(`${mode[0]?.toUpperCase() ?? ""}${mode.slice(1)} mode selected with current claim preserved.`);
    writeBrainUrl(mode, claimId);
  }

  function handleNewThought() {
    setInteractionMessage("New Thought placeholder: creation flow is not wired yet.");
  }

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
    return <BrainScreen model={createBrainViewModel(createEmptyBrainProjection())} state="loading" statusMessage="Loading Brain projection." />;
  }

  if (state.status === "error") {
    return (
      <BrainScreen
        activeMode={activeMode}
        interactionMessage={interactionMessage}
        model={createBrainViewModel(createEmptyBrainProjection())}
        onChangeMode={handleChangeMode}
        onNewThought={handleNewThought}
        state="error"
        statusMessage={state.error}
      />
    );
  }

  const model = createBrainViewModel(projection ?? state.projection);

  return (
    <BrainScreen
      activeMode={activeMode}
      interactionMessage={interactionMessage}
      model={model}
      onChangeMode={handleChangeMode}
      onNewThought={handleNewThought}
      onSelectThought={handleSelectThought}
      state={model.stream.length > 0 ? "populated" : "empty"}
      statusMessage={
        state.source === "mock" ? "Mock Brain data loaded." : "Workspace shell and Brain projection loaded."
      }
    />
  );
}
