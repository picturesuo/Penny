import type {
  BrainProjectionClaim,
  BrainProjectionView,
  BrainInspectorItem,
  BrainRelatedClaimPreview,
  BrainSelectedClaimPanel,
  BrainSessionAffordance,
  BrainSphereAffordance,
  BrainThoughtViewModel,
  BrainViewModel,
} from "./types";

function formatConfidence(confidenceBps: number | null | undefined) {
  if (typeof confidenceBps !== "number") {
    return "No confidence recorded";
  }

  return `${Math.round(confidenceBps / 100)}% confidence`;
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) {
    return "Not recorded";
  }

  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    return "Not recorded";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp);
}

function createThoughtTitle(body: string, index: number) {
  const compact = body.trim().replace(/\s+/g, " ");

  if (!compact) {
    return `Thought ${index + 1}`;
  }

  if (compact.length <= 72) {
    return compact;
  }

  return `${compact.slice(0, 69).trim()}...`;
}

function createBodyPreview(body: string) {
  const compact = body.trim().replace(/\s+/g, " ");

  if (compact.length <= 132) {
    return compact;
  }

  return `${compact.slice(0, 129).trim()}...`;
}

function toThought(claim: BrainProjectionClaim, index: number, selectedClaimId: string | null): BrainThoughtViewModel {
  const body = claim.body.trim() || "Untitled thought";

  return {
    id: claim.id,
    title: createThoughtTitle(body, index),
    body,
    bodyPreview: createBodyPreview(body),
    confidenceLabel: formatConfidence(claim.confidenceBps),
    confidenceBps: typeof claim.confidenceBps === "number" ? claim.confidenceBps : null,
    mapId: claim.mapId ?? null,
    createdAtLabel: formatTimestamp(claim.createdAt),
    updatedAtLabel: formatTimestamp(claim.updatedAt),
    isSelected: claim.id === selectedClaimId,
  };
}

function getSortTime(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? 0 : timestamp.getTime();
}

function createBrainMapHref(thoughtId: string) {
  return `/brain?claimId=${encodeURIComponent(thoughtId)}#brain-map`;
}

function toRelatedClaim(thought: BrainThoughtViewModel): BrainRelatedClaimPreview {
  return {
    id: thought.id,
    title: thought.title,
    confidenceLabel: thought.confidenceLabel,
    confidenceBps: thought.confidenceBps,
    brainMapHref: createBrainMapHref(thought.id),
  };
}

function createKeyConnections(selectedThought: BrainThoughtViewModel | null, stream: BrainThoughtViewModel[]): BrainInspectorItem[] {
  if (!selectedThought) {
    return [];
  }

  return stream
    .filter((thought) => thought.id !== selectedThought.id)
    .slice(0, 3)
    .map((thought) => ({
      id: thought.id,
      title: thought.title,
      detail: `${thought.confidenceLabel}; updated ${thought.updatedAtLabel}`,
    }));
}

function createDependencies(mapId: string | null, mapTitle: string, selectedThought: BrainThoughtViewModel | null): BrainInspectorItem[] {
  if (!selectedThought) {
    return [];
  }

  return [
    {
      id: mapId ? `map:${mapId}` : `claim:${selectedThought.id}:map`,
      title: "Parent map",
      detail: mapId ? `${mapTitle} contains this claim.` : "No parent map is projected for this claim.",
    },
  ];
}

function createContradictionMarkers(selectedThought: BrainThoughtViewModel | null, stream: BrainThoughtViewModel[]): BrainInspectorItem[] {
  if (!selectedThought) {
    return [];
  }

  const markers = stream
    .filter((thought) => thought.id !== selectedThought.id && typeof thought.confidenceBps === "number" && thought.confidenceBps < 6000)
    .slice(0, 2)
    .map((thought) => ({
      id: thought.id,
      title: thought.title,
      detail: `${thought.confidenceLabel}; review against the selected claim.`,
    }));

  if (typeof selectedThought.confidenceBps === "number" && selectedThought.confidenceBps < 6000) {
    return [
      {
        id: selectedThought.id,
        title: "Selected claim needs challenge",
        detail: `${selectedThought.confidenceLabel}; confidence is below the contradiction review threshold.`,
      },
      ...markers,
    ];
  }

  return markers;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function eventLabel(event: unknown, index: number): BrainInspectorItem | null {
  if (!isRecord(event)) {
    return null;
  }

  const id = typeof event.id === "string" ? event.id : `event-${index + 1}`;
  const type =
    typeof event.type === "string"
      ? event.type
      : typeof event.eventType === "string"
        ? event.eventType
        : typeof event.name === "string"
          ? event.name
          : "Workspace event";
  const createdAt =
    typeof event.createdAt === "string"
      ? event.createdAt
      : typeof event.created_at === "string"
        ? event.created_at
        : typeof event.updatedAt === "string"
          ? event.updatedAt
          : typeof event.updated_at === "string"
            ? event.updated_at
            : typeof event.timestamp === "string"
              ? event.timestamp
              : null;

  return {
    id,
    title: type,
    detail: createdAt ? formatTimestamp(createdAt) : "Time not recorded",
  };
}

function createRecentActivity(projection: BrainProjectionView, recentThoughts: BrainThoughtViewModel[]): BrainInspectorItem[] {
  const eventItems = (projection.recentEvents ?? [])
    .map(eventLabel)
    .filter((event): event is BrainInspectorItem => Boolean(event))
    .slice(0, 3);

  if (eventItems.length > 0) {
    return eventItems;
  }

  return recentThoughts.slice(0, 3).map((thought) => ({
    id: thought.id,
    title: thought.title,
    detail: `Updated ${thought.updatedAtLabel}`,
  }));
}

function createSelectedPanel(selectedThought: BrainThoughtViewModel | null, stream: BrainThoughtViewModel[]): BrainSelectedClaimPanel | null {
  if (!selectedThought) {
    return null;
  }

  const relatedClaims = stream.filter((thought) => thought.id !== selectedThought.id).slice(0, 3).map(toRelatedClaim);

  return {
    title: selectedThought.title,
    body: selectedThought.body,
    confidenceLabel: selectedThought.confidenceLabel,
    confidenceBps: selectedThought.confidenceBps,
    dependenciesLabel:
      relatedClaims.length > 0
        ? `${relatedClaims.length} related claims from this map`
        : "No explicit dependencies projected yet",
    relatedClaims,
    brainMapHref: createBrainMapHref(selectedThought.id),
  };
}

function createWorkSphere(mapId: string | null, mapTitle: string): BrainSphereAffordance {
  return {
    id: mapId ? `work-sphere-${mapId}` : "work-sphere-empty",
    label: "Work sphere",
    description: mapId ? `${mapTitle} workspace` : "No map selected",
    isSelected: true,
  };
}

type BrainViewModelOptions = {
  activeSessionId?: string | null;
};

function createRecentSessions(
  stream: BrainThoughtViewModel[],
  mapTitle: string,
  selectedThoughtId: string | null,
  activeSessionId: string | null | undefined,
): BrainSessionAffordance[] {
  if (stream.length === 0) {
    return [];
  }

  return stream.slice(0, 4).map((thought, index) => ({
    id: `session-${thought.id}`,
    title: index === 0 ? "Current Brain session" : `Recent session ${index + 1}`,
    summary: `${thought.title} in ${mapTitle}`,
    updatedAtLabel: thought.updatedAtLabel,
    isSelected: activeSessionId === undefined ? thought.id === selectedThoughtId || (!selectedThoughtId && index === 0) : activeSessionId === `session-${thought.id}`,
  }));
}

export function createBrainViewModel(projection: BrainProjectionView, options: BrainViewModelOptions = {}): BrainViewModel {
  const context = projection.currentContext ?? projection.workspaceContext ?? {
    mode: "brain",
    mapId: null,
    claimId: null,
  };
  const selectedClaimId = projection.selectedClaim?.id ?? context.claimId;
  const recentClaims = projection.claims
    .map((claim, index) => ({ claim, index }))
    .sort((left, right) => {
      const updatedDifference = getSortTime(right.claim.updatedAt) - getSortTime(left.claim.updatedAt);

      if (updatedDifference !== 0) {
        return updatedDifference;
      }

      const createdDifference = getSortTime(right.claim.createdAt) - getSortTime(left.claim.createdAt);
      return createdDifference === 0 ? left.index - right.index : createdDifference;
    });
  const stream = recentClaims.map(({ claim }, index) => toThought(claim, index, selectedClaimId));
  const selectedThought =
    stream.find((thought) => thought.id === selectedClaimId) ??
    (projection.selectedClaim ? toThought(projection.selectedClaim, stream.length, selectedClaimId) : null);
  const selectedPanel = createSelectedPanel(selectedThought, stream);
  const recentThoughtIds = [...projection.claims]
    .sort((left, right) => getSortTime(right.updatedAt) - getSortTime(left.updatedAt))
    .slice(0, 4)
    .map((claim) => claim.id);
  const recentThoughts = recentThoughtIds
    .map((id) => stream.find((thought) => thought.id === id))
    .filter((thought): thought is BrainThoughtViewModel => Boolean(thought));
  const mapTitle = projection.mapSummary?.title?.trim() || "No map selected";
  const mapId = projection.mapSummary?.id ?? context.mapId;
  const recentSessions = createRecentSessions(stream, mapTitle, selectedThought?.id ?? context.claimId, options.activeSessionId);
  const keyConnections = createKeyConnections(selectedThought, stream);
  const dependencies = createDependencies(mapId, mapTitle, selectedThought);
  const contradictionMarkers = createContradictionMarkers(selectedThought, stream);
  const recentActivity = createRecentActivity(projection, recentThoughts);

  return {
    context: {
      mode: context.mode,
      mapId,
      claimId: selectedThought?.id ?? context.claimId,
      mapTitle,
      sphereLabel: "No sphere projected",
      claimCountLabel: `${projection.mapSummary?.claimCount ?? stream.length} thoughts`,
    },
    stream,
    selectedThought,
    selectedPanel,
    sphere: {
      workSphere: createWorkSphere(mapId, mapTitle),
      recentSessions,
      selectedSessionId: recentSessions.find((session) => session.isSelected)?.id ?? null,
    },
    recentThoughts,
    inspector: {
      status: selectedThought ? "Selected thought" : "No thought selected",
      selectedId: selectedThought?.id ?? null,
      mapId: selectedThought?.mapId ?? projection.mapSummary?.id ?? context.mapId,
      confidenceLabel: selectedThought?.confidenceLabel ?? "No confidence recorded",
      confidenceBps: selectedThought?.confidenceBps ?? null,
      updatedAtLabel: selectedThought?.updatedAtLabel ?? "Not recorded",
      keyConnections,
      dependencies,
      contradictionMarkers,
      recentActivity,
    },
  };
}
