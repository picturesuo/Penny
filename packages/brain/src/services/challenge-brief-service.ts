import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { PennyDatabase } from "../db/client.ts";
import {
  artifacts,
  brainRuns,
  challengeRounds,
  claimEdges,
  claims,
  claimVersions,
  focusStates,
  moves,
  nextMoveCandidates,
  sessions,
  sourceSpans,
  sources,
} from "../db/schema.ts";
import { createMove } from "../move-payloads.ts";
import { scopeValues } from "../scope.ts";
import type { EntityId } from "../domain/types.ts";

type ChallengeBriefTransaction = Parameters<Parameters<PennyDatabase["transaction"]>[0]>[0];
type SessionRow = typeof sessions.$inferSelect;
type SourceRow = typeof sources.$inferSelect;
type ClaimRow = typeof claims.$inferSelect;
type ClaimVersionRow = typeof claimVersions.$inferSelect;
type EdgeRow = typeof claimEdges.$inferSelect;
type MoveRow = typeof moves.$inferSelect;
type ChallengeRoundRow = typeof challengeRounds.$inferSelect;
type FocusStateRow = typeof focusStates.$inferSelect;
type CandidateRow = typeof nextMoveCandidates.$inferSelect;
type ArtifactRow = typeof artifacts.$inferSelect;
type SourceSpanRow = typeof sourceSpans.$inferSelect;

export type ChallengeBriefSectionPayload = {
  originalSeedIdea: {
    text: string;
    sourceId: EntityId | null;
  };
  currentPrimaryClaim: {
    claimId: EntityId;
    claimVersionId: EntityId;
    text: string;
    confidence: number;
  };
  keyAssumptions: Array<{
    claimId: EntityId;
    claimVersionId: EntityId;
    text: string;
    confidence: number;
    markers: string[];
  }>;
  selectedPressurePoint: {
    targetClaimId: EntityId;
    targetClaimVersionId: EntityId;
    targetEdgeId: EntityId | null;
    failureType: string | null;
    text: string;
  };
  whyPennyChoseIt: string[];
  challengeIssued: {
    text: string;
    strength: string | null;
    whatWouldResolveIt: string | null;
    challengeMoveId: EntityId | null;
    challengeRoundId: EntityId | null;
  };
  userResponse: {
    text: string;
    response: "Defend" | "Revise" | "Absorb" | null;
    reasoning: string | null;
    moveId: EntityId | null;
  };
  whatChanged: Array<{
    text: string;
    previousClaimVersionId: EntityId | null;
    currentClaimVersionId: EntityId | null;
    moveId: EntityId | null;
  }>;
  openRisks: Array<{
    kind: "challenge" | "assumption" | "unsupported_claim" | "none";
    text: string;
    claimId: EntityId | null;
    edgeId: EntityId | null;
    reason: string;
  }>;
  recommendedNextMove: {
    action: string;
    targetClaimId: EntityId | null;
    targetEdgeId: EntityId | null;
    why: string;
    expectedCompletionMove: string | null;
  };
  moveTimelineSummary: Array<{
    moveId: EntityId;
    kind: string;
    summary: string;
    createdAt: string;
  }>;
};

export type ChallengeBriefPayload = {
  kind: "challenge_brief";
  title: "Challenge Brief";
  sessionId: EntityId;
  sections: ChallengeBriefSectionPayload;
  refs: {
    sourceIds: EntityId[];
    sourceSpanIds: EntityId[];
    claimIds: EntityId[];
    claimVersionIds: EntityId[];
    edgeIds: EntityId[];
    moveIds: EntityId[];
    artifactIds: EntityId[];
  };
  inputs: {
    focusState: BriefFocusState | null;
    latestSelectedCandidate: BriefCandidate | null;
    challengeRoundIds: EntityId[];
  };
  generatedFrom: {
    claimCount: number;
    currentClaimVersionCount: number;
    moveCount: number;
    challengeCount: number;
  };
  generatedBy: {
    brainRunId: EntityId;
    compiler: "challenge-brief-v0";
  };
};

export type ChallengeBriefArtifactDto = {
  id: EntityId;
  kind: "challenge_brief";
  title: string;
  summary: string;
  payload: ChallengeBriefPayload;
  createdAt: string;
};

export type ChallengeBriefMoveDto = {
  id: EntityId;
  kind: "artifact_created";
  summary: string;
  claimIds: EntityId[];
  edgeIds: EntityId[];
  artifactIds: EntityId[];
};

export type ChallengeBriefResponse = {
  status: "created";
  sessionId: EntityId;
  artifact: ChallengeBriefArtifactDto;
  move: ChallengeBriefMoveDto;
  brainRun: {
    id: EntityId;
    status: "succeeded";
  };
  brief: ChallengeBriefPayload;
};

export type ChallengeBriefState = {
  session: BriefSession;
  sources: BriefSource[];
  sourceSpans: BriefSourceSpan[];
  claims: BriefClaim[];
  edges: BriefEdge[];
  moves: BriefMove[];
  challengeRounds: BriefChallengeRound[];
  focusState: BriefFocusState | null;
  latestSelectedCandidate: BriefCandidate | null;
  existingArtifacts: BriefArtifact[];
};

type BriefSession = {
  id: EntityId;
  userId: string | null;
  workspaceId: string | null;
  projectId: string | null;
  sphereId: string | null;
  status: string;
  title: string | null;
  createdAt: string;
};

type BriefSource = {
  id: EntityId;
  kind: string;
  rawText: string;
  createdAt: string;
};

type BriefSourceSpan = {
  id: EntityId;
  sourceId: EntityId;
  claimId: EntityId | null;
  claimVersionId: EntityId | null;
  createdAt: string;
};

type BriefClaim = {
  id: EntityId;
  kind: ClaimRow["kind"];
  sourceId: EntityId | null;
  createdAt: string;
  currentVersion: BriefClaimVersion;
  versions: BriefClaimVersion[];
};

type BriefClaimVersion = {
  id: EntityId;
  claimId: EntityId;
  text: string;
  status: ClaimVersionRow["status"];
  confidence: number;
  isCurrent: boolean;
  validFrom: string;
  validUntil: string | null;
  supersededByVersionId: EntityId | null;
  moveId: EntityId | null;
};

type BriefEdge = {
  id: EntityId;
  fromClaimId: EntityId;
  toClaimId: EntityId;
  kind: EdgeRow["kind"];
  status: EdgeRow["status"];
  label: string | null;
  createdAt: string;
};

type BriefMove = {
  id: EntityId;
  kind: string;
  summary: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

type BriefChallengeRound = {
  id: EntityId;
  status: ChallengeRoundRow["status"];
  response: ChallengeRoundRow["response"];
  targetClaimId: EntityId;
  targetClaimVersionId: EntityId;
  critiqueClaimId: EntityId;
  critiqueClaimVersionId: EntityId;
  challengeEdgeId: EntityId;
  challengeMoveId: EntityId;
  responseMoveId: EntityId | null;
  failureType: string;
  strength: string;
  critique: string;
  whyThis: string;
  whatWouldResolveIt: string;
  createdAt: string;
  respondedAt: string | null;
};

type BriefFocusState = {
  sessionId: EntityId;
  mode: string;
  focusedClaimId: EntityId | null;
  focusedEdgeId: EntityId | null;
  source: string;
  suggestionMoveId: EntityId | null;
  manualMoveId: EntityId | null;
  paused: boolean;
  reason: string | null;
  updatedAt: string;
};

type BriefCandidate = {
  id: EntityId;
  candidateId: string;
  fingerprint: string;
  action: string;
  mode: string;
  targetClaimId: EntityId;
  targetEdgeId: EntityId | null;
  rank: number;
  score: number;
  reason: string;
  reasonCodes: string[];
  exitCriteria: Record<string, unknown>;
  selectedAt: string | null;
  updatedAt: string;
};

type BriefArtifact = {
  id: EntityId;
  kind: string;
  title: string;
  createdAt: string;
};

type ChallengeBriefDraft = {
  title: "Challenge Brief";
  summary: string;
  payload: Omit<ChallengeBriefPayload, "generatedBy">;
  claimIds: EntityId[];
  claimVersionIds: EntityId[];
  edgeIds: EntityId[];
  moveIds: EntityId[];
};

export class ChallengeBriefNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChallengeBriefNotFoundError";
  }
}

export class ChallengeBriefConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChallengeBriefConflictError";
  }
}

export class ChallengeBriefService {
  constructor(private readonly db: PennyDatabase) {}

  async generateChallengeBrief(sessionId: EntityId): Promise<ChallengeBriefResponse> {
    return generateChallengeBrief(this.db, sessionId);
  }
}

export async function generateChallengeBrief(db: PennyDatabase, sessionId: EntityId): Promise<ChallengeBriefResponse> {
  return db.transaction(async (tx) => {
    const state = await loadChallengeBriefState(tx, sessionId);
    const draft = compileChallengeBriefDraft(state);
    const [brainRun] = await tx
      .insert(brainRuns)
      .values({
        ...scopeValues(state.session),
        sessionId,
        sourceId: draft.payload.refs.sourceIds[0] ?? null,
        operation: "brain.artifact.challenge_brief",
        provider: "penny-template",
        model: "challenge-brief-v0",
        status: "running",
        input: {
          sessionId,
          refs: draft.payload.refs,
          generatedFrom: draft.payload.generatedFrom,
          focusState: state.focusState,
          latestSelectedCandidate: state.latestSelectedCandidate,
        },
      })
      .returning();

    if (!brainRun) {
      throw new ChallengeBriefConflictError("Failed to record Challenge Brief BrainRun.");
    }

    const payload: ChallengeBriefPayload = {
      ...draft.payload,
      generatedBy: {
        brainRunId: brainRun.id,
        compiler: "challenge-brief-v0",
      },
    };
    const [artifact] = await tx
      .insert(artifacts)
      .values({
        ...scopeValues(state.session),
        sessionId,
        kind: "challenge_brief",
        title: draft.title,
        summary: draft.summary,
        payload,
      })
      .returning();

    if (!artifact) {
      throw new ChallengeBriefConflictError("Failed to create Challenge Brief artifact.");
    }

    const move = await createMove(tx, "artifact_created", {
      sessionId,
      scope: state.session,
      summary: "Generated a Challenge Brief artifact from persisted Thinking Mode state.",
      payload: {
        artifactId: artifact.id,
        artifactKind: artifact.kind,
        brainRunId: brainRun.id,
        claimIds: draft.claimIds,
        edgeIds: draft.edgeIds,
        claimVersionIds: draft.claimVersionIds,
        artifactIds: [artifact.id],
      },
    });
    const [completedBrainRun] = await tx
      .update(brainRuns)
      .set({
        status: "succeeded",
        output: {
          artifactId: artifact.id,
          payload,
        },
        error: null,
        completedAt: new Date(),
      })
      .where(eq(brainRuns.id, brainRun.id))
      .returning();

    if (!completedBrainRun) {
      throw new ChallengeBriefConflictError("Failed to complete Challenge Brief BrainRun.");
    }

    return {
      status: "created",
      sessionId,
      artifact: artifactDto(artifact, payload),
      move: {
        id: move.id,
        kind: "artifact_created",
        summary: move.summary,
        claimIds: draft.claimIds,
        edgeIds: draft.edgeIds,
        artifactIds: [artifact.id],
      },
      brainRun: {
        id: completedBrainRun.id,
        status: "succeeded",
      },
      brief: payload,
    };
  });
}

export function compileChallengeBriefDraft(state: ChallengeBriefState): ChallengeBriefDraft {
  if (state.claims.length === 0) {
    throw new ChallengeBriefConflictError("Session has no claims to compile into a Challenge Brief.");
  }

  const critiqueClaimIds = new Set(state.challengeRounds.map((round) => round.critiqueClaimId));
  const primaryClaim = choosePrimaryClaim(state.claims, critiqueClaimIds);
  const assumptions = keyAssumptions(state);
  const latestChallenge = latestByCreatedAt(state.challengeRounds);
  const pressureTarget = selectedPressurePoint(state, primaryClaim, latestChallenge);
  const responseMove = latestChallenge?.responseMoveId
    ? state.moves.find((move) => move.id === latestChallenge.responseMoveId)
    : undefined;
  const sections: ChallengeBriefSectionPayload = {
    originalSeedIdea: originalSeedIdea(state),
    currentPrimaryClaim: {
      claimId: primaryClaim.id,
      claimVersionId: primaryClaim.currentVersion.id,
      text: primaryClaim.currentVersion.text,
      confidence: primaryClaim.currentVersion.confidence,
    },
    keyAssumptions: assumptions,
    selectedPressurePoint: pressureTarget,
    whyPennyChoseIt: whyPennyChoseIt(state, latestChallenge),
    challengeIssued: challengeIssued(latestChallenge),
    userResponse: userResponse(latestChallenge, responseMove),
    whatChanged: whatChanged(state, latestChallenge, responseMove),
    openRisks: openRisks(state, critiqueClaimIds),
    recommendedNextMove: recommendedNextMove(state, latestChallenge),
    moveTimelineSummary: moveTimelineSummary(state.moves),
  };
  const refs = refsFor(state);
  const payload: Omit<ChallengeBriefPayload, "generatedBy"> = {
    kind: "challenge_brief",
    title: "Challenge Brief",
    sessionId: state.session.id,
    sections,
    refs,
    inputs: {
      focusState: state.focusState,
      latestSelectedCandidate: state.latestSelectedCandidate,
      challengeRoundIds: state.challengeRounds.map((round) => round.id),
    },
    generatedFrom: {
      claimCount: state.claims.length,
      currentClaimVersionCount: state.claims.length,
      moveCount: state.moves.length,
      challengeCount: state.challengeRounds.length,
    },
  };

  return {
    title: "Challenge Brief",
    summary: summaryFor(sections),
    payload,
    claimIds: refs.claimIds,
    claimVersionIds: refs.claimVersionIds,
    edgeIds: refs.edgeIds,
    moveIds: refs.moveIds,
  };
}

async function loadChallengeBriefState(
  tx: ChallengeBriefTransaction,
  sessionId: EntityId,
): Promise<ChallengeBriefState> {
  const [session] = await tx.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);

  if (!session) {
    throw new ChallengeBriefNotFoundError("Session was not found.");
  }

  const sourceRows = await tx.select().from(sources).where(eq(sources.sessionId, sessionId)).orderBy(asc(sources.createdAt));
  const sourceSpanRows =
    sourceRows.length > 0
      ? await tx
          .select()
          .from(sourceSpans)
          .where(inArray(sourceSpans.sourceId, sourceRows.map((source) => source.id)))
          .orderBy(asc(sourceSpans.createdAt))
      : [];
  const claimRows = await tx.select().from(claims).where(eq(claims.sessionId, sessionId)).orderBy(asc(claims.createdAt));

  if (claimRows.length === 0) {
    throw new ChallengeBriefConflictError("Session has no claims to compile into a Challenge Brief.");
  }

  const versionRows = await tx
    .select()
    .from(claimVersions)
    .where(inArray(claimVersions.claimId, claimRows.map((claim) => claim.id)))
    .orderBy(asc(claimVersions.createdAt));
  const edgeRows = await tx
    .select()
    .from(claimEdges)
    .where(eq(claimEdges.sessionId, sessionId))
    .orderBy(asc(claimEdges.createdAt));
  const moveRows = await tx.select().from(moves).where(eq(moves.sessionId, sessionId)).orderBy(asc(moves.createdAt));
  const challengeRoundRows = await tx
    .select()
    .from(challengeRounds)
    .where(eq(challengeRounds.sessionId, sessionId))
    .orderBy(asc(challengeRounds.createdAt));
  const [focusStateRow] = await tx.select().from(focusStates).where(eq(focusStates.sessionId, sessionId)).limit(1);
  const [selectedCandidate] = await tx
    .select()
    .from(nextMoveCandidates)
    .where(and(eq(nextMoveCandidates.sessionId, sessionId), eq(nextMoveCandidates.selected, true)))
    .orderBy(desc(nextMoveCandidates.selected), desc(nextMoveCandidates.selectedAt), desc(nextMoveCandidates.updatedAt))
    .limit(1);
  const artifactRows = await tx
    .select()
    .from(artifacts)
    .where(eq(artifacts.sessionId, sessionId))
    .orderBy(asc(artifacts.createdAt));

  return {
    session: sessionDto(session),
    sources: sourceRows.map(sourceDto),
    sourceSpans: sourceSpanRows.map(sourceSpanDto),
    claims: claimDtos(claimRows, versionRows),
    edges: edgeRows.map(edgeDto),
    moves: moveRows.map(moveDto),
    challengeRounds: challengeRoundRows.map(challengeRoundDto),
    focusState: focusStateRow ? focusStateDto(focusStateRow) : null,
    latestSelectedCandidate: selectedCandidate ? candidateDto(selectedCandidate) : null,
    existingArtifacts: artifactRows.map(existingArtifactDto),
  };
}

function choosePrimaryClaim(claimsForSession: BriefClaim[], critiqueClaimIds: Set<EntityId>): BriefClaim {
  const primary =
    claimsForSession.find((claim) => claim.kind === "belief" && !critiqueClaimIds.has(claim.id)) ??
    claimsForSession.find((claim) => !critiqueClaimIds.has(claim.id)) ??
    claimsForSession[0];

  if (!primary) {
    throw new ChallengeBriefConflictError("Session has no claims to compile into a Challenge Brief.");
  }

  return primary;
}

function keyAssumptions(state: ChallengeBriefState): ChallengeBriefSectionPayload["keyAssumptions"] {
  const degreeByClaimId = graphDegreeByClaimId(state.edges);

  return state.claims
    .filter((claim) => claim.kind === "assumption")
    .sort((left, right) => {
      const degreeDelta = (degreeByClaimId.get(right.id) ?? 0) - (degreeByClaimId.get(left.id) ?? 0);

      if (degreeDelta !== 0) {
        return degreeDelta;
      }

      return left.currentVersion.confidence - right.currentVersion.confidence;
    })
    .slice(0, 5)
    .map((claim) => {
      const degree = degreeByClaimId.get(claim.id) ?? 0;
      const markers: string[] = [];

      if (claim.currentVersion.confidence < 60) {
        markers.push("low_confidence");
      }

      if (degree >= 2) {
        markers.push("highly_connected");
      }

      return {
        claimId: claim.id,
        claimVersionId: claim.currentVersion.id,
        text: claim.currentVersion.text,
        confidence: claim.currentVersion.confidence,
        markers,
      };
    });
}

function selectedPressurePoint(
  state: ChallengeBriefState,
  primaryClaim: BriefClaim,
  latestChallenge: BriefChallengeRound | undefined,
): ChallengeBriefSectionPayload["selectedPressurePoint"] {
  const targetClaimId = latestChallenge?.targetClaimId ?? state.latestSelectedCandidate?.targetClaimId ?? primaryClaim.id;
  const targetClaim = state.claims.find((claim) => claim.id === targetClaimId) ?? primaryClaim;

  return {
    targetClaimId: targetClaim.id,
    targetClaimVersionId: latestChallenge?.targetClaimVersionId ?? targetClaim.currentVersion.id,
    targetEdgeId: latestChallenge?.challengeEdgeId ?? state.latestSelectedCandidate?.targetEdgeId ?? null,
    failureType: latestChallenge?.failureType ?? null,
    text: targetClaim.currentVersion.text,
  };
}

function whyPennyChoseIt(
  state: ChallengeBriefState,
  latestChallenge: BriefChallengeRound | undefined,
): ChallengeBriefSectionPayload["whyPennyChoseIt"] {
  return uniqueStrings([
    latestChallenge?.whyThis,
    state.latestSelectedCandidate?.reason,
    ...(state.latestSelectedCandidate?.reasonCodes ?? []).map((code) => `Reason code: ${code}.`),
    state.focusState?.reason ? `Focus state: ${state.focusState.reason}` : null,
  ]).slice(0, 3);
}

function challengeIssued(latestChallenge: BriefChallengeRound | undefined): ChallengeBriefSectionPayload["challengeIssued"] {
  if (!latestChallenge) {
    return {
      text: "No challenge issued yet.",
      strength: null,
      whatWouldResolveIt: null,
      challengeMoveId: null,
      challengeRoundId: null,
    };
  }

  return {
    text: latestChallenge.critique,
    strength: latestChallenge.strength,
    whatWouldResolveIt: latestChallenge.whatWouldResolveIt,
    challengeMoveId: latestChallenge.challengeMoveId,
    challengeRoundId: latestChallenge.id,
  };
}

function userResponse(
  latestChallenge: BriefChallengeRound | undefined,
  responseMove: BriefMove | undefined,
): ChallengeBriefSectionPayload["userResponse"] {
  if (!latestChallenge?.response || !responseMove) {
    return {
      text: "No response recorded yet.",
      response: null,
      reasoning: null,
      moveId: null,
    };
  }

  return {
    text: `${titleCaseResponse(latestChallenge.response)} recorded.`,
    response: titleCaseResponse(latestChallenge.response),
    reasoning: stringValue(responseMove.payload.reasoning),
    moveId: responseMove.id,
  };
}

function whatChanged(
  state: ChallengeBriefState,
  latestChallenge: BriefChallengeRound | undefined,
  responseMove: BriefMove | undefined,
): ChallengeBriefSectionPayload["whatChanged"] {
  if (!latestChallenge?.response || !responseMove) {
    return [
      {
        text: "No claim text changed; no response recorded yet.",
        previousClaimVersionId: null,
        currentClaimVersionId: null,
        moveId: null,
      },
    ];
  }

  if (latestChallenge.response === "revise") {
    const currentVersionId = stringValue(responseMove.payload.currentClaimVersionId) ?? latestChallenge.targetClaimVersionId;
    const currentClaim = state.claims.find((claim) => claim.id === latestChallenge.targetClaimId);

    return [
      {
        text: `Revised claim is now: ${currentClaim?.currentVersion.text ?? "current claim version recorded."}`,
        previousClaimVersionId: stringValue(responseMove.payload.previousClaimVersionId),
        currentClaimVersionId: currentVersionId,
        moveId: responseMove.id,
      },
    ];
  }

  if (latestChallenge.response === "absorb") {
    return [
      {
        text: "The claim text stayed unchanged; the critique is carried forward as an acknowledged vulnerability.",
        previousClaimVersionId: latestChallenge.targetClaimVersionId,
        currentClaimVersionId: latestChallenge.targetClaimVersionId,
        moveId: responseMove.id,
      },
    ];
  }

  return [
    {
      text: "The claim text stayed unchanged because the user defended the claim.",
      previousClaimVersionId: latestChallenge.targetClaimVersionId,
      currentClaimVersionId: latestChallenge.targetClaimVersionId,
      moveId: responseMove.id,
    },
  ];
}

function openRisks(state: ChallengeBriefState, critiqueClaimIds: Set<EntityId>): ChallengeBriefSectionPayload["openRisks"] {
  const risks: ChallengeBriefSectionPayload["openRisks"] = [];

  for (const round of state.challengeRounds) {
    if (round.status === "open" || round.response === "absorb") {
      risks.push({
        kind: "challenge",
        text: round.critique,
        claimId: round.targetClaimId,
        edgeId: round.challengeEdgeId,
        reason: round.status === "open" ? "Challenge has not been answered yet." : "Critique was absorbed as a live risk.",
      });
    }
  }

  for (const claim of state.claims) {
    if (risks.length >= 5) {
      break;
    }

    if (claim.kind === "assumption" && claim.currentVersion.confidence < 60) {
      risks.push({
        kind: "assumption",
        text: claim.currentVersion.text,
        claimId: claim.id,
        edgeId: dependencyEdgeForAssumption(state.edges, claim.id)?.id ?? null,
        reason: "Low-confidence assumption still supports the map.",
      });
    }
  }

  for (const claim of state.claims) {
    if (risks.length >= 5) {
      break;
    }

    const hasSupport = state.edges.some((edge) => edge.kind === "supports" && edge.toClaimId === claim.id);

    if (!critiqueClaimIds.has(claim.id) && claim.currentVersion.confidence >= 80 && !hasSupport) {
      risks.push({
        kind: "unsupported_claim",
        text: claim.currentVersion.text,
        claimId: claim.id,
        edgeId: null,
        reason: "High-confidence claim has no explicit supporting edge.",
      });
    }
  }

  if (risks.length === 0) {
    return [
      {
        kind: "none",
        text: "No unresolved challenge or low-confidence assumption was found in the current session state.",
        claimId: null,
        edgeId: null,
        reason: "Compiled from persisted rows only.",
      },
    ];
  }

  return risks.slice(0, 5);
}

function recommendedNextMove(
  state: ChallengeBriefState,
  latestChallenge: BriefChallengeRound | undefined,
): ChallengeBriefSectionPayload["recommendedNextMove"] {
  if (latestChallenge?.status === "open") {
    return {
      action: "respond_to_challenge",
      targetClaimId: latestChallenge.targetClaimId,
      targetEdgeId: latestChallenge.challengeEdgeId,
      why: "The latest challenge has not been answered with Defend, Revise, or Absorb.",
      expectedCompletionMove: "user_defended|claim_revised|critique_absorbed",
    };
  }

  if (state.latestSelectedCandidate) {
    return {
      action: state.latestSelectedCandidate.action,
      targetClaimId: state.latestSelectedCandidate.targetClaimId,
      targetEdgeId: state.latestSelectedCandidate.targetEdgeId,
      why: state.latestSelectedCandidate.reason,
      expectedCompletionMove: firstAcceptedMoveKind(state.latestSelectedCandidate.exitCriteria),
    };
  }

  const weakestAssumption = state.claims
    .filter((claim) => claim.kind === "assumption")
    .sort((left, right) => left.currentVersion.confidence - right.currentVersion.confidence)[0];

  return {
    action: weakestAssumption ? "challenge" : "clarify",
    targetClaimId: weakestAssumption?.id ?? state.claims[0]?.id ?? null,
    targetEdgeId: weakestAssumption ? dependencyEdgeForAssumption(state.edges, weakestAssumption.id)?.id ?? null : null,
    why: weakestAssumption
      ? "The weakest current assumption is the next safest place to stress-test."
      : "No selected candidate exists, so the next move should clarify the current primary claim.",
    expectedCompletionMove: weakestAssumption ? "challenge_issued" : "claim_revised|focus_completed",
  };
}

function moveTimelineSummary(movesForSession: BriefMove[]): ChallengeBriefSectionPayload["moveTimelineSummary"] {
  const meaningfulKinds = new Set([
    "seed_claim_created",
    "assumptions_extracted",
    "assumption_confirmed",
    "assumption_rejected",
    "assumption_refined",
    "next_move_recomputed",
    "autopilot_focus_started",
    "manual_node_selected",
    "challenge_issued",
    "user_defended",
    "claim_revised",
    "critique_absorbed",
    "focus_completed",
    "artifact_created",
  ]);
  const meaningful = movesForSession.filter((move) => meaningfulKinds.has(move.kind));
  const selected = meaningful.length > 0 ? meaningful : movesForSession;

  return selected.slice(-8).map((move) => ({
    moveId: move.id,
    kind: move.kind,
    summary: move.summary,
    createdAt: move.createdAt,
  }));
}

function refsFor(state: ChallengeBriefState): ChallengeBriefPayload["refs"] {
  return {
    sourceIds: state.sources.map((source) => source.id),
    sourceSpanIds: state.sourceSpans.map((span) => span.id),
    claimIds: state.claims.map((claim) => claim.id),
    claimVersionIds: state.claims.flatMap((claim) => claim.versions.map((version) => version.id)),
    edgeIds: state.edges.map((edge) => edge.id),
    moveIds: state.moves.map((move) => move.id),
    artifactIds: state.existingArtifacts.map((artifact) => artifact.id),
  };
}

function originalSeedIdea(state: ChallengeBriefState): ChallengeBriefSectionPayload["originalSeedIdea"] {
  const rawIdea = state.sources.find((source) => source.kind === "raw_idea") ?? state.sources[0];

  return {
    text: rawIdea?.rawText.trim() || state.session.title || "No original seed idea recorded.",
    sourceId: rawIdea?.id ?? null,
  };
}

function summaryFor(sections: ChallengeBriefSectionPayload): string {
  const response = sections.userResponse.response ? `${sections.userResponse.response} response recorded` : "no response recorded";
  const riskCount = sections.openRisks.filter((risk) => risk.kind !== "none").length;

  return `${clipText(sections.currentPrimaryClaim.text, 140)}; ${response}; ${riskCount} open risk${riskCount === 1 ? "" : "s"}.`;
}

function graphDegreeByClaimId(edgesForSession: BriefEdge[]): Map<EntityId, number> {
  const degree = new Map<EntityId, number>();

  for (const edge of edgesForSession) {
    degree.set(edge.fromClaimId, (degree.get(edge.fromClaimId) ?? 0) + 1);
    degree.set(edge.toClaimId, (degree.get(edge.toClaimId) ?? 0) + 1);
  }

  return degree;
}

function dependencyEdgeForAssumption(edgesForSession: BriefEdge[], claimId: EntityId): BriefEdge | undefined {
  return edgesForSession.find((edge) => edge.kind === "depends_on" && edge.toClaimId === claimId);
}

function latestByCreatedAt<T extends { createdAt: string }>(items: T[]): T | undefined {
  return [...items].sort((left, right) => left.createdAt.localeCompare(right.createdAt)).at(-1);
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const value of values) {
    const trimmed = value?.trim();

    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    unique.push(trimmed);
  }

  return unique;
}

function titleCaseResponse(response: "defend" | "revise" | "absorb"): "Defend" | "Revise" | "Absorb" {
  switch (response) {
    case "defend":
      return "Defend";
    case "revise":
      return "Revise";
    case "absorb":
      return "Absorb";
  }
}

function firstAcceptedMoveKind(exitCriteria: Record<string, unknown>): string | null {
  const acceptedMoveKinds = exitCriteria.acceptedMoveKinds;

  if (!Array.isArray(acceptedMoveKinds)) {
    return null;
  }

  return acceptedMoveKinds.find((kind): kind is string => typeof kind === "string") ?? null;
}

function sessionDto(session: SessionRow): BriefSession {
  return {
    id: session.id,
    ...scopeValues(session),
    status: session.status,
    title: session.title,
    createdAt: session.createdAt.toISOString(),
  };
}

function sourceDto(source: SourceRow): BriefSource {
  return {
    id: source.id,
    kind: source.kind,
    rawText: source.rawText,
    createdAt: source.createdAt.toISOString(),
  };
}

function sourceSpanDto(span: SourceSpanRow): BriefSourceSpan {
  return {
    id: span.id,
    sourceId: span.sourceId,
    claimId: span.claimId,
    claimVersionId: span.claimVersionId,
    createdAt: span.createdAt.toISOString(),
  };
}

function claimDtos(claimRows: ClaimRow[], versionRows: ClaimVersionRow[]): BriefClaim[] {
  const versionsByClaimId = new Map<EntityId, BriefClaimVersion[]>();

  for (const version of versionRows) {
    const versions = versionsByClaimId.get(version.claimId) ?? [];
    versions.push(claimVersionDto(version));
    versionsByClaimId.set(version.claimId, versions);
  }

  return claimRows.map((claim) => {
    const versions = versionsByClaimId.get(claim.id) ?? [];
    const currentVersion = [...versions].reverse().find((version) => version.isCurrent);

    if (!currentVersion) {
      throw new ChallengeBriefConflictError(`Claim ${claim.id} has no current ClaimVersion.`);
    }

    return {
      id: claim.id,
      kind: claim.kind,
      sourceId: claim.sourceId,
      createdAt: claim.createdAt.toISOString(),
      currentVersion,
      versions,
    };
  });
}

function claimVersionDto(version: ClaimVersionRow): BriefClaimVersion {
  return {
    id: version.id,
    claimId: version.claimId,
    text: version.content,
    status: version.status,
    confidence: version.confidence,
    isCurrent: version.isCurrent,
    validFrom: version.validFrom.toISOString(),
    validUntil: version.validUntil?.toISOString() ?? null,
    supersededByVersionId: version.supersededByVersionId,
    moveId: version.moveId,
  };
}

function edgeDto(edge: EdgeRow): BriefEdge {
  return {
    id: edge.id,
    fromClaimId: edge.fromClaimId,
    toClaimId: edge.toClaimId,
    kind: edge.kind,
    status: edge.status,
    label: edge.label,
    createdAt: edge.createdAt.toISOString(),
  };
}

function moveDto(move: MoveRow): BriefMove {
  return {
    id: move.id,
    kind: move.kind,
    summary: move.summary,
    payload: asRecord(move.payload),
    createdAt: move.createdAt.toISOString(),
  };
}

function challengeRoundDto(round: ChallengeRoundRow): BriefChallengeRound {
  return {
    id: round.id,
    status: round.status,
    response: round.response,
    targetClaimId: round.targetClaimId,
    targetClaimVersionId: round.targetClaimVersionId,
    critiqueClaimId: round.critiqueClaimId,
    critiqueClaimVersionId: round.critiqueClaimVersionId,
    challengeEdgeId: round.challengeEdgeId,
    challengeMoveId: round.challengeMoveId,
    responseMoveId: round.responseMoveId,
    failureType: round.failureType,
    strength: round.strength,
    critique: round.critique,
    whyThis: round.whyThis,
    whatWouldResolveIt: round.whatWouldResolveIt,
    createdAt: round.createdAt.toISOString(),
    respondedAt: round.respondedAt?.toISOString() ?? null,
  };
}

function focusStateDto(focusState: FocusStateRow): BriefFocusState {
  return {
    sessionId: focusState.sessionId,
    mode: focusState.mode,
    focusedClaimId: focusState.focusedClaimId,
    focusedEdgeId: focusState.focusedEdgeId,
    source: focusState.source,
    suggestionMoveId: focusState.suggestionMoveId,
    manualMoveId: focusState.manualMoveId,
    paused: focusState.paused,
    reason: focusState.reason,
    updatedAt: focusState.updatedAt.toISOString(),
  };
}

function candidateDto(candidate: CandidateRow): BriefCandidate {
  return {
    id: candidate.id,
    candidateId: candidate.candidateId,
    fingerprint: candidate.fingerprint,
    action: candidate.action,
    mode: candidate.mode,
    targetClaimId: candidate.targetClaimId,
    targetEdgeId: candidate.targetEdgeId,
    rank: candidate.rank,
    score: candidate.score,
    reason: candidate.reason,
    reasonCodes: stringArray(candidate.reasonCodes),
    exitCriteria: asRecord(candidate.exitCriteria),
    selectedAt: candidate.selectedAt?.toISOString() ?? null,
    updatedAt: candidate.updatedAt.toISOString(),
  };
}

function existingArtifactDto(artifact: ArtifactRow): BriefArtifact {
  return {
    id: artifact.id,
    kind: artifact.kind,
    title: artifact.title,
    createdAt: artifact.createdAt.toISOString(),
  };
}

function artifactDto(artifact: ArtifactRow, payload: ChallengeBriefPayload): ChallengeBriefArtifactDto {
  return {
    id: artifact.id,
    kind: "challenge_brief",
    title: artifact.title,
    summary: artifact.summary,
    payload,
    createdAt: artifact.createdAt.toISOString(),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => (typeof item === "string" ? [item] : []));
}

function clipText(value: string, maxLength: number): string {
  const trimmed = value.replace(/\s+/g, " ").trim();

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, Math.max(0, maxLength - 1)).trimEnd()}.`;
}
