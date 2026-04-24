import type {
  BrainProjectionClaim,
  BrainProjectionView,
  BrainRelatedClaimPreview,
  BrainSelectedClaimPanel,
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
    brainMapHref: createBrainMapHref(thought.id),
  };
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
    dependenciesLabel:
      relatedClaims.length > 0
        ? `${relatedClaims.length} related claims from this map`
        : "No explicit dependencies projected yet",
    relatedClaims,
    brainMapHref: createBrainMapHref(selectedThought.id),
  };
}

export function createBrainViewModel(projection: BrainProjectionView): BrainViewModel {
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

  return {
    context: {
      mode: context.mode,
      mapId: projection.mapSummary?.id ?? context.mapId,
      claimId: selectedThought?.id ?? context.claimId,
      mapTitle,
      sphereLabel: "No sphere projected",
      claimCountLabel: `${projection.mapSummary?.claimCount ?? stream.length} thoughts`,
    },
    stream,
    selectedThought,
    selectedPanel,
    recentThoughts,
    inspector: {
      status: selectedThought ? "Selected thought" : "No thought selected",
      selectedId: selectedThought?.id ?? null,
      mapId: selectedThought?.mapId ?? projection.mapSummary?.id ?? context.mapId,
      confidenceLabel: selectedThought?.confidenceLabel ?? "No confidence recorded",
      updatedAtLabel: selectedThought?.updatedAtLabel ?? "Not recorded",
    },
  };
}
