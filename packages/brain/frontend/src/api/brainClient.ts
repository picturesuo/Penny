import type {
  AutopilotSuggestion,
  AutopilotTickData,
  BrainClaim,
  BrainDocumentsResponse,
  BrainRecentsResponse,
  BrainSessionNoteResponse,
  AutopilotTickResponse,
  ChallengeBriefResponse,
  ChallengeResponseKind,
  ClaimDetailResponse,
  BrainMove,
  InlineLearnOutput,
  InlineLearnResponse,
  InlineLearnSaveResponse,
  IssueChallengeResponse,
  BrainVerifyConfidenceDecisionResponse,
  BrainVerifyResponse,
  KeepBrainRecentIdeaResponse,
  ManualNodeSelectionResponse,
  RespondToChallengeResponse,
  SeedBrainResponse,
  SessionCockpitData,
  SessionCockpitResponse,
  StartNextMoveResponse,
  ThinkingModeCandidate,
  ThinkingModeStateData,
} from "../types/brain";

const jsonHeaders = {
  "content-type": "application/json",
};

function requestHeaders(): HeadersInit {
  const headers: Record<string, string> = { ...jsonHeaders };
  const token = runtimeEnv("VITE_PENNY_API_TOKEN");

  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  addOptionalHeader(headers, "x-user-id", "VITE_PENNY_USER_ID");
  addOptionalHeader(headers, "x-workspace-id", "VITE_PENNY_WORKSPACE_ID");
  addOptionalHeader(headers, "x-project-id", "VITE_PENNY_PROJECT_ID");
  addOptionalHeader(headers, "x-sphere-id", "VITE_PENNY_SPHERE_ID");

  return headers;
}

function addOptionalHeader(headers: Record<string, string>, headerName: string, envName: string): void {
  const value = runtimeEnv(envName);

  if (value) {
    headers[headerName] = value;
  }
}

function runtimeEnv(name: string): string | undefined {
  const env = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env;
  const value = env?.[name];

  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function seedBrain(rawIdea: string): Promise<SeedBrainResponse> {
  const response = await fetch("/brain/seed", {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify({ rawIdea }),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `POST /brain/seed failed with ${response.status}.`));
  }

  return payload as SeedBrainResponse;
}

export async function fetchBrainDocuments(): Promise<BrainDocumentsResponse> {
  const response = await fetch("/api/brain/documents", {
    method: "GET",
    headers: requestHeaders(),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `GET /api/brain/documents failed with ${response.status}.`));
  }

  return payload as BrainDocumentsResponse;
}

export async function fetchBrainRecents(): Promise<BrainRecentsResponse> {
  const response = await fetch("/api/brain/recents", {
    method: "GET",
    headers: requestHeaders(),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `GET /api/brain/recents failed with ${response.status}.`));
  }

  return payload as BrainRecentsResponse;
}

export async function keepBrainRecentIdea(rawIdea: string): Promise<KeepBrainRecentIdeaResponse> {
  const response = await fetch("/api/brain/recents", {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify({ rawIdea }),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `POST /api/brain/recents failed with ${response.status}.`));
  }

  return payload as KeepBrainRecentIdeaResponse;
}

export async function fetchSessionNote(sessionId: string): Promise<BrainSessionNoteResponse> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/notes`, {
    method: "GET",
    headers: requestHeaders(),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `GET /api/sessions/${sessionId}/notes failed with ${response.status}.`));
  }

  return payload as BrainSessionNoteResponse;
}

export async function saveSessionNote(input: { sessionId: string; content: string }): Promise<BrainSessionNoteResponse> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(input.sessionId)}/notes`, {
    method: "PUT",
    headers: requestHeaders(),
    body: JSON.stringify({ content: input.content }),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `PUT /api/sessions/${input.sessionId}/notes failed with ${response.status}.`));
  }

  return payload as BrainSessionNoteResponse;
}

export async function fetchClaimDetail(claimId: string): Promise<ClaimDetailResponse> {
  const response = await fetch(`/brain/claims/${encodeURIComponent(claimId)}/detail`, {
    method: "GET",
    headers: requestHeaders(),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `GET /brain/claims/${claimId}/detail failed with ${response.status}.`));
  }

  return payload as ClaimDetailResponse;
}

export async function tickAutopilot(sessionId: string, resume = false): Promise<AutopilotTickResponse> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/autopilot/tick`, {
    method: "POST",
    headers: requestHeaders(),
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
      headers: requestHeaders(),
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
      headers: requestHeaders(),
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
    headers: requestHeaders(),
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
    headers: requestHeaders(),
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

export async function verifyClaim(input: {
  claimId: string;
  currentClaimText: string;
  sessionId: string;
}): Promise<BrainVerifyResponse> {
  const response = await fetch("/brain/verify", {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify(input),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `POST /brain/verify failed with ${response.status}.`));
  }

  return payload as BrainVerifyResponse;
}

export async function decideVerifyConfidence(input: {
  verifyMoveId: string;
  decision: "accept" | "reject";
  reason?: string;
}): Promise<BrainVerifyConfidenceDecisionResponse> {
  const response = await fetch("/brain/verify/confidence", {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify(input),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `POST /brain/verify/confidence failed with ${response.status}.`));
  }

  return payload as BrainVerifyConfidenceDecisionResponse;
}

export async function createInlineLearn(input: {
  term: string;
  currentClaimId: string;
  sessionId: string;
  localContext: string;
  save?: boolean;
}): Promise<InlineLearnResponse> {
  const response = await fetch("/brain/learn/inline", {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify(input),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `POST /brain/learn/inline failed with ${response.status}.`));
  }

  return payload as InlineLearnResponse;
}

export async function saveInlineLearn(input: InlineLearnOutput & {
  currentClaimId: string;
  sessionId: string;
}): Promise<InlineLearnSaveResponse> {
  const response = await fetch("/brain/learn/inline/save", {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify(input),
  });

  const payload = await readJson(response);

  if (!response.ok) {
    throw new Error(errorMessage(payload, `POST /brain/learn/inline/save failed with ${response.status}.`));
  }

  return payload as InlineLearnSaveResponse;
}

export async function selectAutopilotNode(input: {
  sessionId: string;
  claimId: string;
  previousSuggestionMoveId?: string | null;
}): Promise<ManualNodeSelectionResponse> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(input.sessionId)}/focus/manual`, {
    method: "POST",
    headers: requestHeaders(),
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
    headers: requestHeaders(),
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
  graphPath?: SessionCockpitData["graphPath"];
  workStructure?: SessionCockpitData["workStructure"];
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
    graphPath: data.graphPath ?? emptyGraphPath(),
    workStructure: data.workStructure ?? null,
    moves: (data.moves ?? []).map(normalizeMove),
    autopilot: normalizeAutopilotState(data.autopilot),
    activeChallenge,
    latestArtifact: data.latestArtifact ?? null,
  };
}

function emptyGraphPath(): SessionCockpitData["graphPath"] {
  return {
    layout: "top_down",
    generatedFrom: "claims_edges_moves",
    focusClaimId: null,
    nodes: [],
    edges: [],
    meta: {
      nodeCount: 0,
      edgeCount: 0,
      maxDepth: 0,
    },
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
