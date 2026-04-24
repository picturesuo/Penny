import type { BrainProjectionClaim, BrainProjectionView, BrainThoughtViewModel, BrainViewModel } from "./types";

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
