import type {
  AutopilotSuggestion,
  AutopilotTickData,
  BrainClaim,
  AutopilotTickResponse,
  ChallengeBriefResponse,
  ChallengeResponseKind,
  BrainMove,
  IssueChallengeResponse,
  ManualNodeSelectionResponse,
  RespondToChallengeResponse,
  SeedBrainResponse,
  SessionCockpitData,
  SessionCockpitResponse,
  SessionMovesResponse,
  StartNextMoveResponse,
  ThinkingModeCandidate,
  ThinkingModeStateData,
} from "../types/brain";

const headers = {
  "content-type": "application/json",
  "x-user-id": "dev-user",
  "x-project-id": "dev-project",
};

export async function seedBrain(rawIdea: string): Promise<SeedBrainResponse> {
  const response = await fetch("/brain/seed", {
    method: "POST",
    headers,
    body: JSON.stringify({ rawIdea }),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `POST /brain/seed failed with ${response.status}.`));
  }

  return payload as SeedBrainResponse;
}

export async function fetchSessionMoves(sessionId: string): Promise<SessionMovesResponse> {
  const response = await fetch(`/brain/session/${encodeURIComponent(sessionId)}/moves`, {
    method: "GET",
    headers,
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `GET /brain/session/${sessionId}/moves failed with ${response.status}.`));
  }

  return payload as SessionMovesResponse;
}

export async function tickAutopilot(sessionId: string, resume = false): Promise<AutopilotTickResponse> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/autopilot/tick`, {
    method: "POST",
    headers,
    body: JSON.stringify({ resume }),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `POST /api/sessions/${sessionId}/autopilot/tick failed with ${response.status}.`));
  }

  return {
    data: normalizeAutopilotState((payload as { data: ThinkingModeStateData }).data),
  };
}

export async function startAutopilotCandidate(sessionId: string, candidateId: string): Promise<StartNextMoveResponse> {
  const response = await fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}/next-move-candidates/${encodeURIComponent(candidateId)}/start`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({}),
    },
  );

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(
      errorMessage(
        payload,
        `POST /api/sessions/${sessionId}/next-move-candidates/${candidateId}/start failed with ${response.status}.`,
      ),
    );
  }

  return payload as StartNextMoveResponse;
}

export async function issueChallengeFromCandidate(
  sessionId: string,
  candidateId: string,
): Promise<IssueChallengeResponse> {
  const response = await fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}/next-move-candidates/${encodeURIComponent(candidateId)}/challenge`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({}),
    },
  );

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(
      errorMessage(
        payload,
        `POST /api/sessions/${sessionId}/next-move-candidates/${candidateId}/challenge failed with ${response.status}.`,
      ),
    );
  }

  return payload as IssueChallengeResponse;
}

export async function respondToChallenge(input: {
  challengeId: string;
  response: ChallengeResponseKind;
  reasoning?: string;
  revisedText?: string;
}): Promise<RespondToChallengeResponse> {
  const body =
    input.response === "revise"
      ? {
          response: input.response,
          revisedText: input.revisedText,
          ...(input.reasoning ? { reasoning: input.reasoning } : {}),
        }
      : {
          response: input.response,
          ...(input.reasoning ? { reasoning: input.reasoning } : {}),
        };
  const response = await fetch(`/api/challenges/${encodeURIComponent(input.challengeId)}/respond`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(
      errorMessage(payload, `POST /api/challenges/${input.challengeId}/respond failed with ${response.status}.`),
    );
  }

  return payload as RespondToChallengeResponse;
}

export async function createChallengeBrief(sessionId: string): Promise<ChallengeBriefResponse> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/challenge-brief`, {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(
      errorMessage(payload, `POST /api/sessions/${sessionId}/challenge-brief failed with ${response.status}.`),
    );
  }

  return payload as ChallengeBriefResponse;
}

export async function selectAutopilotNode(input: {
  sessionId: string;
  claimId: string;
  previousSuggestionMoveId?: string | null;
}): Promise<ManualNodeSelectionResponse> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(input.sessionId)}/focus/manual`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      claimId: input.claimId,
      ...(input.previousSuggestionMoveId ? { previousSuggestionMoveId: input.previousSuggestionMoveId } : {}),
    }),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `POST /api/sessions/${input.sessionId}/focus/manual failed with ${response.status}.`));
  }

  return payload as ManualNodeSelectionResponse;
}

export async function fetchSessionCockpit(sessionId: string): Promise<SessionCockpitResponse> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/cockpit`, {
    method: "GET",
    headers,
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `GET /api/sessions/${sessionId}/cockpit failed with ${response.status}.`));
  }

  return {
    data: normalizeCockpitData((payload as { data: RawSessionCockpitData }).data),
  };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function errorMessage(payload: unknown, fallback: string): string {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    payload.error &&
    typeof payload.error === "object" &&
    "message" in payload.error &&
    typeof payload.error.message === "string"
  ) {
    return payload.error.message;
  }

  return fallback;
}

interface RawSessionCockpitData {
  session: SessionCockpitData["session"];
  ideaMap: {
    claims?: SessionCockpitData["ideaMap"]["claims"];
    edges?: SessionCockpitData["ideaMap"]["edges"];
    keyInsight?: string | null;
  };
  moves?: BrainMove[];
  autopilot: ThinkingModeStateData;
  activeChallenge?: {
    id: string;
    status?: string;
    response?: ChallengeResponseKind | null;
    targetClaimId?: string;
    critique?: string;
    failureType?: string;
    strength?: string;
    whatWouldResolveIt?: string;
    targetClaim?: BrainClaim | null;
    critiqueClaim?: BrainClaim | null;
  } | null;
  latestArtifact?: SessionCockpitData["latestArtifact"];
}

function normalizeCockpitData(data: RawSessionCockpitData): SessionCockpitData {
  const activeChallenge = data.activeChallenge ? normalizeActiveChallenge(data.activeChallenge) : null;

  return {
    session: data.session,
    ideaMap: {
      claims: data.ideaMap.claims ?? [],
      edges: data.ideaMap.edges ?? [],
      ...(data.ideaMap.keyInsight !== undefined ? { keyInsight: data.ideaMap.keyInsight } : {}),
    },
    moves: (data.moves ?? []).map(normalizeMove),
    autopilot: normalizeAutopilotState(data.autopilot),
    activeChallenge,
    latestArtifact: data.latestArtifact ?? null,
  };
}

function normalizeAutopilotState(data: ThinkingModeStateData): AutopilotTickData {
  const candidates = (data.candidates ?? []).map(candidateToSuggestion);
  const selectedCandidate = data.selectedCandidate ? candidateToSuggestion(data.selectedCandidate) : null;

  return {
    status: data.status,
    sessionId: data.sessionId,
    suggestion: selectedCandidate,
    candidates,
    selectedCandidate,
    focusState: data.focusState,
    move: data.move
      ? {
          id: data.move.id,
          kind: data.move.kind,
          summary: data.move.summary,
        }
      : null,
    ...(data.focusState.paused
      ? {
          pause: {
            paused: true,
            manualMoveId: data.focusState.manualMoveId,
            focusedClaimId: data.focusState.focusedClaimId,
            pausedAt: data.focusState.updatedAt,
          },
        }
      : {}),
  };
}

function candidateToSuggestion(candidate: ThinkingModeCandidate): AutopilotSuggestion {
  const exitCriteria = candidate.exitCriteria ?? {
    label: "Complete the selected thinking action.",
    acceptedMoveKinds: [],
  };

  return {
    id: candidate.id,
    candidateId: candidate.candidateId,
    action: candidate.action,
    mode: candidate.mode,
    label: titleize(candidate.action),
    primaryActionLabel: primaryActionLabel(candidate.action),
    targetClaimId: candidate.targetClaimId,
    targetEdgeId: candidate.targetEdgeId,
    score: candidate.score,
    why: candidate.reason,
    ...(candidate.reasonCodes ? { reasonCodes: candidate.reasonCodes } : {}),
    exitCriteria,
  };
}

function normalizeActiveChallenge(
  challenge: NonNullable<RawSessionCockpitData["activeChallenge"]>,
): NonNullable<SessionCockpitData["activeChallenge"]> {
  return {
    id: challenge.id,
    responseOptions: ["Defend", "Revise", "Absorb"],
    targetClaim: challenge.targetClaim ?? null,
    critiqueClaim: challenge.critiqueClaim ?? null,
    ...(challenge.targetClaimId !== undefined ? { targetClaimId: challenge.targetClaimId } : {}),
    ...(challenge.targetClaim?.text !== undefined ? { weakestPart: challenge.targetClaim.text } : {}),
    ...(challenge.failureType !== undefined ? { failureType: challenge.failureType } : {}),
    ...(challenge.strength !== undefined ? { strength: challenge.strength } : {}),
    ...(challenge.status !== undefined ? { status: challenge.status } : {}),
    ...(challenge.response !== undefined ? { response: challenge.response } : {}),
    ...(challenge.whatWouldResolveIt !== undefined ? { whatWouldResolveIt: challenge.whatWouldResolveIt } : {}),
    ...(challenge.critique !== undefined ? { challenge: challenge.critique, critique: challenge.critique } : {}),
  };
}

function normalizeMove(move: BrainMove): BrainMove {
  return {
    ...move,
    type: move.type ?? move.kind ?? "move",
  };
}

function titleize(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function primaryActionLabel(action: string): string {
  switch (action) {
    case "challenge":
      return "Start challenge";
    case "verify":
      return "Start verification";
    case "learn":
      return "Start learn";
    case "clarify":
      return "Clarify claim";
    case "resume_open_challenge":
      return "Resume challenge";
    default:
      return `Start ${titleize(action).toLowerCase()}`;
  }
}
