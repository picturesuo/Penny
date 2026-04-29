import { randomUUID } from "node:crypto";
import { and, desc, eq, or, sql, type SQL } from "drizzle-orm";
import { afterMoveEffectsInTransaction, type PersistedDerivedEffect } from "../after-move-effects.ts";
import type { PennyDatabase } from "../db/client.ts";
import {
  brainRuns,
  challengeFailureTypeEnum,
  challengeRounds,
  challengeStrengthEnum,
  claimEdges,
  claims,
  claimVersions,
  nextMoveCandidates,
} from "../db/schema.ts";
import { createMove, type CreatedMove } from "../move-payloads.ts";
import { scopeValues } from "../scope.ts";
import type { EntityId } from "../domain/types.ts";

type ChallengeTransaction = Parameters<Parameters<PennyDatabase["transaction"]>[0]>[0];
type CandidateRow = typeof nextMoveCandidates.$inferSelect;
type ClaimRow = typeof claims.$inferSelect;
type ClaimVersionRow = typeof claimVersions.$inferSelect;
type EdgeRow = typeof claimEdges.$inferSelect;
type ChallengeRoundRow = typeof challengeRounds.$inferSelect;
type FailureType = (typeof challengeFailureTypeEnum.enumValues)[number];
type ChallengeStrength = (typeof challengeStrengthEnum.enumValues)[number];
type ChallengeResponseKind = "defend" | "revise" | "absorb";
type ChallengeResponseMoveKind = "user_defended" | "claim_revised" | "critique_absorbed";

export type IssueChallengeFromCandidateInput = {
  brainId: EntityId;
  sessionId: EntityId;
  candidateId: string;
};

export type ChallengeTemplateInput = {
  targetClaimId: EntityId;
  targetKind: ClaimRow["kind"];
  targetText: string;
  targetConfidence: number;
  candidateAction: CandidateRow["action"];
  candidateReason: string;
  candidateScore: number;
  scoreBreakdown?: Record<string, unknown>;
};

export type TemplateChallenge = {
  critique: string;
  failureType: FailureType;
  strength: ChallengeStrength;
  whyThis: string;
  whatWouldResolveIt: string;
  suggestedNextMove: string;
  provenanceTag: "penny:template.challenge.v0";
};

export type ChallengeRoundDto = {
  id: EntityId;
  sessionId: EntityId;
  status: ChallengeRoundRow["status"];
  response: ChallengeRoundRow["response"];
  targetClaimId: EntityId;
  targetClaimVersionId: EntityId;
  critiqueClaimId: EntityId;
  critiqueClaimVersionId: EntityId;
  challengeEdgeId: EntityId;
  brainRunId: EntityId;
  challengeMoveId: EntityId;
  responseMoveId: EntityId | null;
  focusCompletedMoveId: EntityId | null;
  failureType: FailureType;
  strength: ChallengeStrength;
  critique: string;
  whyThis: string;
  whatWouldResolveIt: string;
  createdAt: string;
  respondedAt: string | null;
  updatedAt: string;
};

export type ChallengeClaimDto = {
  id: EntityId;
  versionId: EntityId;
  kind: ClaimRow["kind"];
  status: ClaimVersionRow["status"];
  text: string;
  confidence: number;
};

export type ChallengeEdgeDto = {
  id: EntityId;
  fromClaimId: EntityId;
  toClaimId: EntityId;
  kind: "challenges" | "contradicts";
  status: EdgeRow["status"];
  label: string | null;
};

export type ChallengeMoveDto = {
  id: EntityId;
  kind: ChallengeResponseMoveKind | "challenge_issued" | "focus_completed";
  summary: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type ChallengeDerivedEffectDto = {
  id: EntityId;
  kind: PersistedDerivedEffect["kind"];
  status: PersistedDerivedEffect["status"];
  version: number;
  title: string;
  summary: string;
  payload: unknown;
  createdAt: string;
};

export type IssueChallengeResponse = {
  status: "issued";
  brainId: EntityId;
  sessionId: EntityId;
  challengeRound: ChallengeRoundDto;
  targetClaim: ChallengeClaimDto;
  critiqueClaim: ChallengeClaimDto;
  challengeEdge: ChallengeEdgeDto;
  critique: string;
  failureType: FailureType;
  strength: ChallengeStrength;
  whyThis: string;
  whatWouldResolveIt: string;
  suggestedNextMove: string;
  move: ChallengeMoveDto;
  brainRun: {
    id: EntityId;
    status: "succeeded";
  };
};

export type RespondToChallengeInput =
  | {
      challengeId: EntityId;
      response: "defend";
      reasoning: string;
    }
  | {
      challengeId: EntityId;
      response: "revise";
      revisedText: string;
      reasoning?: string | null;
    }
  | {
      challengeId: EntityId;
      response: "absorb";
      reasoning?: string | null;
    };

export type ChallengeResponseReceipt = {
  response: ChallengeResponseKind;
  moveKind: ChallengeResponseMoveKind;
  targetClaimId: EntityId;
  challengeEdgeId: EntityId;
  previousClaimVersionId: EntityId | null;
  currentClaimVersionId: EntityId;
  claimTextChanged: boolean;
  unresolvedRisk: boolean;
};

export type ChallengeNextMoveDirective = {
  status: "client_tick_required";
  requiredCommand: "tick_autopilot";
  sessionId: EntityId;
  method: "POST";
  endpoint: string;
  body: {
    resume: true;
  };
  reason: string;
  expectedMoveKind: "next_move_recomputed";
};

export type RespondToChallengeResponse = {
  status: "responded";
  challengeRound: ChallengeRoundDto;
  response: ChallengeResponseKind;
  targetClaim: ChallengeClaimDto;
  critiqueClaimId: EntityId;
  challengeEdge: ChallengeEdgeDto;
  move: ChallengeMoveDto;
  focusCompletedMove: ChallengeMoveDto;
  derivedEffects: ChallengeDerivedEffectDto[];
  receipt: ChallengeResponseReceipt;
  nextMove: ChallengeNextMoveDirective;
};

export class ChallengeRoundNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChallengeRoundNotFoundError";
  }
}

export class ChallengeRoundConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChallengeRoundConflictError";
  }
}

export class ChallengeRoundService {
  constructor(private readonly db: PennyDatabase) {}

  async issueChallengeFromCandidate(input: IssueChallengeFromCandidateInput): Promise<IssueChallengeResponse> {
    return this.db.transaction(async (tx) => {
      const candidate = await loadCandidate(tx, input.sessionId, input.candidateId);
      const target = await loadClaimWithCurrentVersion(tx, candidate.targetClaimId);

      if (target.claim.sessionId !== input.sessionId) {
        throw new ChallengeRoundConflictError("Candidate target claim does not belong to the requested session.");
      }

      const challenge = buildTemplateChallenge({
        targetClaimId: target.claim.id,
        targetKind: target.claim.kind,
        targetText: target.version.content,
        targetConfidence: target.version.confidence,
        candidateAction: candidate.action,
        candidateReason: candidate.reason,
        candidateScore: candidate.score,
        scoreBreakdown: asRecord(candidate.scoreBreakdown),
      });
      const now = new Date();
      const [brainRun] = await tx
        .insert(brainRuns)
        .values({
          ...scopeValues(target.claim),
          sessionId: target.claim.sessionId,
          sourceId: target.claim.sourceId,
          operation: "brain.challenge",
          provider: "penny-template",
          model: "challenge-v0",
          status: "succeeded",
          input: {
            candidateId: candidate.candidateId,
            candidateFingerprint: candidate.fingerprint,
            targetClaimId: target.claim.id,
            targetClaimVersionId: target.version.id,
            targetText: target.version.content,
          },
          output: challenge,
          completedAt: now,
        })
        .returning();

      if (!brainRun) {
        throw new ChallengeRoundConflictError("Failed to record challenge BrainRun.");
      }

      const [critiqueClaim] = await tx
        .insert(claims)
        .values({
          ...scopeValues(target.claim),
          sessionId: target.claim.sessionId,
          sourceId: target.claim.sourceId,
          kind: "belief",
        })
        .returning();

      if (!critiqueClaim) {
        throw new ChallengeRoundConflictError("Failed to create critique claim.");
      }

      const [critiqueVersion] = await tx
        .insert(claimVersions)
        .values({
          claimId: critiqueClaim.id,
          sourceId: target.claim.sourceId,
          brainRunId: brainRun.id,
          content: challenge.critique,
          status: "exploratory",
          confidence: confidenceForStrength(challenge.strength),
          isCurrent: true,
        })
        .returning();

      if (!critiqueVersion) {
        throw new ChallengeRoundConflictError("Failed to create critique ClaimVersion.");
      }

      const [edge] = await tx
        .insert(claimEdges)
        .values({
          ...scopeValues(target.claim),
          sessionId: target.claim.sessionId,
          fromClaimId: critiqueClaim.id,
          toClaimId: target.claim.id,
          kind: "challenges",
          status: "active",
          label: challenge.failureType,
        })
        .returning();

      if (!edge) {
        throw new ChallengeRoundConflictError("Failed to create challenge edge.");
      }

      const challengeEdge = normalizeChallengeEdge(edge);
      const move = await createMove(tx, "challenge_issued", {
        sessionId: target.claim.sessionId,
        scope: target.claim,
        summary: "Issued a Thinking Mode challenge against the selected claim.",
        payload: {
          targetClaimId: target.claim.id,
          targetClaimVersionId: target.version.id,
          critiqueClaimId: critiqueClaim.id,
          critiqueClaimVersionId: critiqueVersion.id,
          challengeEdgeId: challengeEdge.id,
          brainRunId: brainRun.id,
          failureType: challenge.failureType,
          strength: challenge.strength,
          provenanceTag: challenge.provenanceTag,
          claimIds: [target.claim.id, critiqueClaim.id],
          edgeIds: [challengeEdge.id],
        },
      });

      const [round] = await tx
        .insert(challengeRounds)
        .values({
          ...scopeValues(target.claim),
          sessionId: target.claim.sessionId,
          nextMoveCandidateId: candidate.id,
          candidateId: candidate.candidateId,
          candidateFingerprint: candidate.fingerprint,
          status: "open",
          targetClaimId: target.claim.id,
          targetClaimVersionId: target.version.id,
          critiqueClaimId: critiqueClaim.id,
          critiqueClaimVersionId: critiqueVersion.id,
          challengeEdgeId: challengeEdge.id,
          brainRunId: brainRun.id,
          challengeMoveId: move.id,
          failureType: challenge.failureType,
          strength: challenge.strength,
          critique: challenge.critique,
          whyThis: challenge.whyThis,
          whatWouldResolveIt: challenge.whatWouldResolveIt,
          updatedAt: now,
        })
        .returning();

      if (!round) {
        throw new ChallengeRoundConflictError("Failed to create ChallengeRound.");
      }

      return {
        status: "issued",
        brainId: input.brainId,
        sessionId: input.sessionId,
        challengeRound: roundDto(round),
        targetClaim: claimDto(target.claim, target.version),
        critiqueClaim: claimDto(critiqueClaim, critiqueVersion),
        challengeEdge: edgeDto(challengeEdge),
        critique: challenge.critique,
        failureType: challenge.failureType,
        strength: challenge.strength,
        whyThis: challenge.whyThis,
        whatWouldResolveIt: challenge.whatWouldResolveIt,
        suggestedNextMove: challenge.suggestedNextMove,
        move: moveDto(move),
        brainRun: {
          id: brainRun.id,
          status: "succeeded",
        },
      };
    });
  }

  async respondToChallenge(input: RespondToChallengeInput): Promise<RespondToChallengeResponse> {
    return this.db.transaction(async (tx) => {
      const [round] = await tx.select().from(challengeRounds).where(eq(challengeRounds.id, input.challengeId)).limit(1);

      if (!round) {
        throw new ChallengeRoundNotFoundError("ChallengeRound was not found.");
      }

      if (round.status !== "open") {
        throw new ChallengeRoundConflictError("ChallengeRound has already been responded to.");
      }

      const target = await loadClaimWithCurrentVersion(tx, round.targetClaimId);
      const [critiqueClaim] = await tx.select().from(claims).where(eq(claims.id, round.critiqueClaimId)).limit(1);
      const [edge] = await tx.select().from(claimEdges).where(eq(claimEdges.id, round.challengeEdgeId)).limit(1);

      if (!critiqueClaim) {
        throw new ChallengeRoundConflictError("ChallengeRound has no critique claim.");
      }

      if (!edge) {
        throw new ChallengeRoundConflictError("ChallengeRound has no challenge edge.");
      }

      if ((edge.kind !== "challenges" && edge.kind !== "contradicts") || edge.toClaimId !== target.claim.id) {
        throw new ChallengeRoundConflictError("ChallengeRound edge does not target the expected claim.");
      }

      const responseResult = await persistChallengeRoundResponse(tx, input, target, critiqueClaim, edge);
      const derived = await afterMoveEffectsInTransaction(tx, {
        sessionId: target.claim.sessionId,
        moveId: responseResult.move.id,
      });
      const focusCompletedMove = await createMove(tx, "focus_completed", {
        sessionId: target.claim.sessionId,
        scope: target.claim,
        summary: "Completed challenge focus after user response.",
        payload: {
          focusSource: "challenge_response",
          completedByMoveId: responseResult.move.id,
          completedByMoveKind: responseResult.move.kind,
          challengeRoundId: round.id,
          targetClaimId: target.claim.id,
          targetEdgeId: responseResult.edge.id,
          outcome: input.response,
          claimIds: [target.claim.id, critiqueClaim.id],
          edgeIds: [responseResult.edge.id],
          artifactIds: [],
        },
      });
      const now = new Date();
      const [updatedRound] = await tx
        .update(challengeRounds)
        .set({
          status: "responded",
          response: input.response,
          responseMoveId: responseResult.move.id,
          focusCompletedMoveId: focusCompletedMove.id,
          respondedAt: now,
          updatedAt: now,
        })
        .where(eq(challengeRounds.id, round.id))
        .returning();

      if (!updatedRound) {
        throw new ChallengeRoundConflictError("Failed to mark ChallengeRound responded.");
      }

      return {
        status: "responded",
        challengeRound: roundDto(updatedRound),
        response: input.response,
        targetClaim: claimDto(target.claim, responseResult.currentVersion),
        critiqueClaimId: critiqueClaim.id,
        challengeEdge: edgeDto(responseResult.edge),
        move: moveDto(responseResult.move),
        focusCompletedMove: moveDto(focusCompletedMove),
        derivedEffects: derived.effects.map(derivedEffectDto),
        receipt: {
          response: input.response,
          moveKind: responseResult.move.kind,
          targetClaimId: target.claim.id,
          challengeEdgeId: responseResult.edge.id,
          previousClaimVersionId: responseResult.previousVersionId,
          currentClaimVersionId: responseResult.currentVersion.id,
          claimTextChanged: input.response === "revise",
          unresolvedRisk: input.response === "absorb",
        },
        nextMove: clientTickRequired(target.claim.sessionId),
      };
    });
  }
}

function clientTickRequired(sessionId: EntityId): ChallengeNextMoveDirective {
  return {
    status: "client_tick_required",
    requiredCommand: "tick_autopilot",
    sessionId,
    method: "POST",
    endpoint: `/api/sessions/${sessionId}/autopilot/tick`,
    body: {
      resume: true,
    },
    reason:
      "Challenge response completed focus; call tick to recompute backend-owned next-move candidates before rendering the next suggestion.",
    expectedMoveKind: "next_move_recomputed",
  };
}

export function buildTemplateChallenge(input: ChallengeTemplateInput): TemplateChallenge {
  const targetText = input.targetText.trim();
  const exactDemo = targetText.toLowerCase().includes("pre-seed founders will pay for structured thinking before traction");

  if (exactDemo) {
    return {
      critique:
        'The risky assumption is not that founders have messy thinking. They do. The risk is that pre-seed founders will pay for structured thinking before traction, when their budget and attention usually go to building, selling, fundraising, or finding customers. If Penny does not create an immediate artifact that helps with one of those urgent jobs, "better thinking" may be admired but deferred.',
      failureType: "shaky_assumption",
      strength: "strong",
      whyThis:
        "This claim is load-bearing because the founder wedge depends on willingness to pay before traction. It is also behaviorally fragile: founders may value clarity in theory while choosing faster, cheaper, or more familiar substitutes under pressure.",
      whatWouldResolveIt:
        "Resolve this by naming the urgent pre-seed moment where structured thinking becomes worth paying for now, plus the artifact Penny produces in that moment. A credible answer should distinguish paid urgency from general interest.",
      suggestedNextMove:
        "Defend the willingness-to-pay claim, revise it to a narrower founder moment, or absorb it as an unresolved market risk.",
      provenanceTag: "penny:template.challenge.v0",
    };
  }

  const failureType = inferFailureType(input);
  const strength = inferStrength(input);
  const quotedClaim = compact(targetText, 260);

  return {
    critique: critiqueFor(failureType, quotedClaim),
    failureType,
    strength,
    whyThis: compact(input.candidateReason, 700),
    whatWouldResolveIt: resolutionFor(failureType),
    suggestedNextMove:
      "Choose Defend if the critique is overweighted, Revise if the claim should change, or Absorb if this should remain a live risk.",
    provenanceTag: "penny:template.challenge.v0",
  };
}

async function loadCandidate(tx: ChallengeTransaction, sessionId: EntityId, candidateReference: string): Promise<CandidateRow> {
  const [candidate] = await tx
    .select()
    .from(nextMoveCandidates)
    .where(and(eq(nextMoveCandidates.sessionId, sessionId), candidateReferenceWhere(candidateReference)))
    .orderBy(desc(nextMoveCandidates.selected), desc(nextMoveCandidates.updatedAt))
    .limit(1);

  if (!candidate) {
    throw new ChallengeRoundNotFoundError("Next move candidate was not found for this session.");
  }

  return candidate;
}

async function loadClaimWithCurrentVersion(
  tx: ChallengeTransaction,
  claimId: EntityId,
): Promise<{ claim: ClaimRow; version: ClaimVersionRow }> {
  const [claim] = await tx.select().from(claims).where(eq(claims.id, claimId)).limit(1);

  if (!claim) {
    throw new ChallengeRoundNotFoundError("Target claim was not found.");
  }

  const [version] = await tx
    .select()
    .from(claimVersions)
    .where(and(eq(claimVersions.claimId, claim.id), eq(claimVersions.isCurrent, true)))
    .orderBy(desc(claimVersions.createdAt))
    .limit(1);

  if (!version) {
    throw new ChallengeRoundConflictError("Target claim has no current ClaimVersion.");
  }

  return { claim, version };
}

type ResponsePersistenceResult = {
  move: CreatedMove<ChallengeResponseMoveKind>;
  currentVersion: ClaimVersionRow;
  previousVersionId: EntityId | null;
  edge: EdgeRow & { kind: "challenges" | "contradicts" };
};

async function persistChallengeRoundResponse(
  tx: ChallengeTransaction,
  input: RespondToChallengeInput,
  target: { claim: ClaimRow; version: ClaimVersionRow },
  critiqueClaim: ClaimRow,
  edge: EdgeRow,
): Promise<ResponsePersistenceResult> {
  const challengeEdge = normalizeChallengeEdge(edge);

  if (input.response === "defend") {
    const move = await createMove(tx, "user_defended", {
      sessionId: target.claim.sessionId,
      scope: target.claim,
      summary: "User defended the target claim against the critique.",
      payload: {
        response: "defend",
        reasoning: input.reasoning,
        targetClaimId: target.claim.id,
        targetClaimVersionId: target.version.id,
        critiqueClaimId: critiqueClaim.id,
        challengeEdgeId: challengeEdge.id,
        claimIds: [target.claim.id, critiqueClaim.id],
        edgeIds: [challengeEdge.id],
      },
    });

    return {
      move,
      currentVersion: target.version,
      previousVersionId: null,
      edge: challengeEdge,
    };
  }

  if (input.response === "revise") {
    const versionId = randomUUID();
    const moveId = randomUUID();
    const validFrom = new Date();
    const move = await createMove(tx, "claim_revised", {
      id: moveId,
      sessionId: target.claim.sessionId,
      scope: target.claim,
      summary: "User revised the target claim in response to the critique.",
      payload: {
        response: "revise",
        reasoning: input.reasoning ?? null,
        targetClaimId: target.claim.id,
        previousClaimVersionId: target.version.id,
        currentClaimVersionId: versionId,
        critiqueClaimId: critiqueClaim.id,
        challengeEdgeId: challengeEdge.id,
        claimVersionIds: [target.version.id, versionId],
        claimIds: [target.claim.id, critiqueClaim.id],
        edgeIds: [challengeEdge.id],
      },
    });

    const [newVersion] = await tx
      .insert(claimVersions)
      .values({
        id: versionId,
        claimId: target.claim.id,
        sourceId: target.version.sourceId ?? target.claim.sourceId,
        moveId: move.id,
        content: input.revisedText,
        status: "exploratory",
        confidence: target.version.confidence,
        isCurrent: false,
        validFrom,
      })
      .returning();

    if (!newVersion) {
      throw new ChallengeRoundConflictError("Failed to create revised ClaimVersion.");
    }

    await tx
      .update(claimVersions)
      .set({
        isCurrent: false,
        validUntil: validFrom,
        supersededByVersionId: versionId,
      })
      .where(and(eq(claimVersions.claimId, target.claim.id), eq(claimVersions.isCurrent, true)));

    const [markedCurrentVersion] = await tx
      .update(claimVersions)
      .set({
        isCurrent: true,
      })
      .where(eq(claimVersions.id, newVersion.id))
      .returning();

    if (!markedCurrentVersion) {
      throw new ChallengeRoundConflictError("Failed to mark revised ClaimVersion current.");
    }

    return {
      move,
      currentVersion: {
        ...newVersion,
        isCurrent: true,
      },
      previousVersionId: target.version.id,
      edge: challengeEdge,
    };
  }

  const [acknowledgedEdge] = await tx
    .update(claimEdges)
    .set({
      status: "acknowledged_vulnerability",
    })
    .where(eq(claimEdges.id, challengeEdge.id))
    .returning();

  if (!acknowledgedEdge) {
    throw new ChallengeRoundConflictError("Failed to acknowledge challenge edge.");
  }

  const normalizedAcknowledgedEdge = normalizeChallengeEdge(acknowledgedEdge);
  const move = await createMove(tx, "critique_absorbed", {
    sessionId: target.claim.sessionId,
    scope: target.claim,
    summary: "User absorbed the critique as an acknowledged vulnerability.",
    payload: {
      response: "absorb",
      reasoning: input.reasoning ?? null,
      targetClaimId: target.claim.id,
      targetClaimVersionId: target.version.id,
      critiqueClaimId: critiqueClaim.id,
      challengeEdgeId: normalizedAcknowledgedEdge.id,
      edgeStatus: normalizedAcknowledgedEdge.status,
      claimIds: [target.claim.id, critiqueClaim.id],
      edgeIds: [normalizedAcknowledgedEdge.id],
    },
  });

  return {
    move,
    currentVersion: target.version,
    previousVersionId: null,
    edge: normalizedAcknowledgedEdge,
  };
}

function candidateReferenceWhere(candidateReference: string): SQL {
  const filters: SQL[] = [
    eq(nextMoveCandidates.candidateId, candidateReference),
    eq(nextMoveCandidates.fingerprint, candidateReference),
  ];

  if (isUuid(candidateReference)) {
    filters.push(eq(nextMoveCandidates.id, candidateReference));
  }

  return or(...filters) ?? sql`false`;
}

function inferFailureType(input: ChallengeTemplateInput): FailureType {
  if (input.candidateAction === "clarify") {
    return "definition_failure";
  }

  if (input.candidateAction === "verify") {
    return "weak_evidence";
  }

  if (input.candidateAction === "resume_open_challenge") {
    return "missing_counterargument";
  }

  const text = input.targetText.toLowerCase();

  if (text.includes("like ") || text.includes("similar to") || text.includes("as with")) {
    return "analogy_break";
  }

  if (input.targetConfidence >= 80) {
    return "weak_evidence";
  }

  return "shaky_assumption";
}

function inferStrength(input: ChallengeTemplateInput): ChallengeStrength {
  if (input.candidateScore >= 850 || input.targetConfidence >= 80) {
    return "strong";
  }

  if (input.candidateScore >= 550 || input.targetConfidence >= 55) {
    return "moderate";
  }

  return "weak";
}

function critiqueFor(failureType: FailureType, targetText: string): string {
  switch (failureType) {
    case "definition_failure":
      return `This claim is hard to evaluate because its key terms are not pinned down: "${targetText}". If the terms can shift mid-argument, the map can appear stronger than it is.`;
    case "weak_evidence":
      return `This claim is carrying more confidence than its visible evidence supports: "${targetText}". Penny needs to know what observation, source, or test would make this belief withstand pressure.`;
    case "missing_counterargument":
      return `This claim has not yet faced the strongest opposing case: "${targetText}". A serious answer should name the alternative explanation and why it should lose.`;
    case "analogy_break":
      return `This claim may be borrowing strength from an analogy that does not fully transfer: "${targetText}". The important question is where the buyer, timing, incentive, or constraint differs.`;
    case "dependency_risk":
      return `This claim may depend on a weaker foundation than the map currently shows: "${targetText}". If that prerequisite fails, downstream confidence should not quietly remain unchanged.`;
    case "unaddressed_precedent":
      return `This claim may be ignoring relevant prior attempts or known failure patterns: "${targetText}". Breaking the norm is possible, but the reason the norm exists has to be addressed directly.`;
    case "premise_rejection":
      return `This claim may assume the audience already accepts the framing: "${targetText}". If they reject the premise, the later evidence may never get a fair hearing.`;
    case "shaky_assumption":
      return `This assumption is load-bearing but still fragile: "${targetText}". The risk is not that it sounds implausible; the risk is that too much of the map depends on it before it has survived a concrete test.`;
  }
}

function resolutionFor(failureType: FailureType): string {
  switch (failureType) {
    case "definition_failure":
      return "Resolve this by defining the ambiguous term tightly enough that the claim can be judged true, false, or in need of revision.";
    case "weak_evidence":
      return "Resolve this by naming the evidence that would support or weaken the claim, and how that evidence would change the current view.";
    case "missing_counterargument":
      return "Resolve this by stating the strongest opposing explanation and why your claim still beats it.";
    case "analogy_break":
      return "Resolve this by naming which parts of the analogy transfer and which parts do not.";
    case "dependency_risk":
      return "Resolve this by identifying the prerequisite claim and what should happen downstream if that prerequisite weakens.";
    case "unaddressed_precedent":
      return "Resolve this by naming the relevant precedent or norm and explaining why this case escapes it.";
    case "premise_rejection":
      return "Resolve this by stating what the audience must accept first and how you would earn that premise.";
    case "shaky_assumption":
      return "Resolve this by naming the concrete condition under which the assumption would become credible enough to support the downstream claims.";
  }
}

function confidenceForStrength(strength: ChallengeStrength): number {
  switch (strength) {
    case "strong":
      return 80;
    case "moderate":
      return 65;
    case "weak":
      return 50;
  }
}

function normalizeChallengeEdge(edge: EdgeRow): EdgeRow & { kind: "challenges" | "contradicts" } {
  if (edge.kind !== "challenges" && edge.kind !== "contradicts") {
    throw new ChallengeRoundConflictError("Only challenge edges can receive challenge responses.");
  }

  return edge as EdgeRow & { kind: "challenges" | "contradicts" };
}

function claimDto(claim: ClaimRow, version: ClaimVersionRow): ChallengeClaimDto {
  return {
    id: claim.id,
    versionId: version.id,
    kind: claim.kind,
    status: version.status,
    text: version.content,
    confidence: version.confidence,
  };
}

function edgeDto(edge: EdgeRow & { kind: "challenges" | "contradicts" }): ChallengeEdgeDto {
  return {
    id: edge.id,
    fromClaimId: edge.fromClaimId,
    toClaimId: edge.toClaimId,
    kind: edge.kind,
    status: edge.status,
    label: edge.label,
  };
}

function roundDto(round: ChallengeRoundRow): ChallengeRoundDto {
  return {
    id: round.id,
    sessionId: round.sessionId,
    status: round.status,
    response: round.response,
    targetClaimId: round.targetClaimId,
    targetClaimVersionId: round.targetClaimVersionId,
    critiqueClaimId: round.critiqueClaimId,
    critiqueClaimVersionId: round.critiqueClaimVersionId,
    challengeEdgeId: round.challengeEdgeId,
    brainRunId: round.brainRunId,
    challengeMoveId: round.challengeMoveId,
    responseMoveId: round.responseMoveId,
    focusCompletedMoveId: round.focusCompletedMoveId,
    failureType: round.failureType,
    strength: round.strength,
    critique: round.critique,
    whyThis: round.whyThis,
    whatWouldResolveIt: round.whatWouldResolveIt,
    createdAt: round.createdAt.toISOString(),
    respondedAt: round.respondedAt?.toISOString() ?? null,
    updatedAt: round.updatedAt.toISOString(),
  };
}

function moveDto(move: CreatedMove<ChallengeResponseMoveKind | "challenge_issued" | "focus_completed">): ChallengeMoveDto {
  return {
    id: move.id,
    kind: move.kind,
    summary: move.summary,
    payload: move.payload,
    createdAt: move.createdAt.toISOString(),
  };
}

function derivedEffectDto(effect: PersistedDerivedEffect): ChallengeDerivedEffectDto {
  return {
    id: effect.id,
    kind: effect.kind,
    status: effect.status,
    version: effect.version,
    title: effect.title,
    summary: effect.summary,
    payload: effect.payload,
    createdAt: effect.createdAt.toISOString(),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function compact(value: string, maxLength: number): string {
  const collapsed = value.replace(/\s+/g, " ").trim();

  if (collapsed.length <= maxLength) {
    return collapsed;
  }

  return `${collapsed.slice(0, Math.max(0, maxLength - 1)).trimEnd()}.`;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
