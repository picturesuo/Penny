import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

import {
  generateChallengeCritique as generateChallengeCritiqueOperation,
  type GenerateChallengeCritiquePreviousRound,
} from "../ai/operations/generateChallengeCritique.ts";
import { getDb } from "../db/client.ts";
import { challengeCritiques, challengeRounds, claims, maps, movesEvents } from "../db/schema.ts";
import { findExistingMoveEvent, type SelectableDbTx } from "../idempotency/find-existing-move-event.ts";
import { resolveCommandContext } from "./command-context.ts";

export type RequestChallengeCritiqueEventType = "challenge.critique.requested";

export type ChallengeCritiqueStatus = "pending" | "ready" | "failed";

export type RequestChallengeCritiqueInput = {
  userId: string;
  roundId: string;
  requestId?: string | null;
};

export type ChallengeCritiqueRecord = {
  id: string;
  roundId: string;
  mapId: string;
  claimId: string;
  userId: string;
  status: ChallengeCritiqueStatus;
  body: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ChallengeCritiqueRequestedEventRecord = {
  userId: string;
  aggregateType: "challenge_critique";
  aggregateId: string;
  requestId: string;
  type: RequestChallengeCritiqueEventType;
  payload: {
    roundId: string;
    mapId: string;
    claimId: string;
    status: ChallengeCritiqueStatus;
  };
  createdAt: Date;
};

export type RequestChallengeCritiqueRepositoryTx = {
  findMoveEventByRequestId?(input: {
    userId: string;
    requestId: string;
    type: string;
  }): Promise<{ aggregateId: string; payload: Record<string, unknown> | null } | null>;
  findOwnedCritique?(input: {
    critiqueId: string;
    userId: string;
  }): Promise<{ id: string; roundId: string; status: string; body: string | null } | null>;
  findOwnedCritiqueByRound(input: {
    roundId: string;
    userId: string;
  }): Promise<{ id: string; roundId: string; status: string; body: string | null } | null>;
  findMapById(input: {
    mapId: string;
  }): Promise<{ id: string; userId: string } | null>;
  findClaimById(input: {
    claimId: string;
  }): Promise<{ id: string; mapId: string; userId: string } | null>;
  findRoundById?(input: {
    roundId: string;
  }): Promise<{ id: string; mapId: string; claimId: string; userId: string } | null>;
  findOwnedRound(input: {
    roundId: string;
    userId: string;
  }): Promise<{ id: string; mapId: string; claimId: string; userId: string } | null>;
  insertChallengeCritique(record: ChallengeCritiqueRecord): Promise<void>;
  updateChallengeCritiquePlaceholder(record: {
    id: string;
    userId: string;
    status: ChallengeCritiqueStatus;
    body: string | null;
    updatedAt: Date;
  }): Promise<void>;
  insertMoveEvent(event: ChallengeCritiqueRequestedEventRecord): Promise<void>;
};

export type RequestChallengeCritiqueRepository = {
  transaction<T>(callback: (tx: RequestChallengeCritiqueRepositoryTx) => Promise<T>): Promise<T>;
};

type RequestChallengeCritiqueDbRoundRow = {
  id: string;
  mapId: string;
  claimId: string;
  userId: string;
};

type RequestChallengeCritiqueDbCritiqueRow = {
  id: string;
  roundId: string;
  status: string;
  body: string | null;
};

type RequestChallengeCritiqueDbMapRow = {
  id: string;
  userId: string;
};

type RequestChallengeCritiqueDbClaimRow = {
  id: string;
  mapId: string;
  userId: string;
  body?: string;
  confidenceBps?: number | null;
};

type RequestChallengeCritiqueDbMapTitleRow = {
  id: string;
  title: string;
  userId: string;
};

type RequestChallengeCritiqueDbRoundSummaryRow = {
  id: string;
  createdAt: Date;
};

type RequestChallengeCritiqueDbMoveEventRow = {
  payloadJson: unknown;
};

type RequestChallengeCritiqueDbTx = SelectableDbTx & {
  insert: (table: unknown) => {
    values: (value: Record<string, unknown>) => Promise<unknown>;
  };
  update: (table: unknown) => {
    set: (value: Record<string, unknown>) => {
      where: (condition: unknown) => Promise<unknown>;
    };
  };
};

type RequestChallengeCritiqueTx = RequestChallengeCritiqueRepositoryTx | RequestChallengeCritiqueDbTx;

type RequestChallengeCritiqueDb = {
  transaction<T>(callback: (tx: RequestChallengeCritiqueDbTx) => Promise<T>): Promise<T>;
};

type RequestChallengeCritiqueTransactional = {
  transaction<T>(callback: (tx: RequestChallengeCritiqueTx) => Promise<T>): Promise<T>;
};

export type RequestChallengeCritiqueResult = {
  critiqueId: string;
  roundId: string;
  critiqueStatus: ChallengeCritiqueStatus;
};

export type RequestChallengeCritiqueDependencies = {
  createId?: () => string;
  now?: () => Date;
};

export class RequestChallengeCritiqueValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RequestChallengeCritiqueValidationError";
  }
}

export class RequestChallengeCritiqueRoundNotFoundError extends Error {
  constructor(roundId: string) {
    super(`Challenge round not found for requestChallengeCritique: ${roundId}`);
    this.name = "RequestChallengeCritiqueRoundNotFoundError";
  }
}

export class RequestChallengeCritiqueRoundForbiddenError extends Error {
  constructor(roundId: string) {
    super(`User does not own challenge round for requestChallengeCritique: ${roundId}`);
    this.name = "RequestChallengeCritiqueRoundForbiddenError";
  }
}

type NormalizedRequestChallengeCritiqueInput = {
  userId: string;
  roundId: string;
  requestId: string | null;
};

const PENDING_STATUS = "pending" as const;
const READY_STATUS = "ready" as const;
const FAILED_STATUS = "failed" as const;

function normalizeStoredStatus(status: string | null | undefined): ChallengeCritiqueStatus {
  if (status === READY_STATUS || status === FAILED_STATUS || status === PENDING_STATUS) {
    return status;
  }

  return PENDING_STATUS;
}

function readPayloadStatus(payload: Record<string, unknown> | null): ChallengeCritiqueStatus {
  return normalizeStoredStatus(typeof payload?.status === "string" ? payload.status : null);
}

function readLooseOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

function formatListSection(title: string, items: string[]): string | null {
  if (!items.length) {
    return null;
  }

  return `${title}:\n- ${items.join("\n- ")}`;
}

function formatStructuredCritique(output: Record<string, unknown>): string {
  const sections = [
    readLooseOptionalString(output.conciseCritiqueSummary)
      ? `Main challenge: ${readLooseOptionalString(output.conciseCritiqueSummary)}`
      : null,
    readLooseOptionalString(output.strongestCounterargument)
      ? `Strongest counterargument: ${readLooseOptionalString(output.strongestCounterargument)}`
      : null,
    formatListSection("Assumptions", readStringArray(output.assumptions)),
    formatListSection("Likely failure modes", readStringArray(output.likelyFailureModes)),
    formatListSection("Follow-up questions", readStringArray(output.followUpQuestions)),
    typeof output.suggestedConfidenceDelta === "number"
      ? `Suggested confidence delta: ${output.suggestedConfidenceDelta}`
      : null,
    readLooseOptionalString(output.uncertaintyNote)
      ? `Uncertainty note: ${readLooseOptionalString(output.uncertaintyNote)}`
      : null,
  ];

  return sections.filter((section): section is string => Boolean(section)).join("\n\n");
}

function readGeneratedCritiqueSummary(input: {
  body: string | null;
  critiqueJson: Record<string, unknown> | null;
}): string | null {
  const summary = readLooseOptionalString(input.critiqueJson?.conciseCritiqueSummary);

  if (summary) {
    return summary;
  }

  const body = readLooseOptionalString(input.body);

  if (!body) {
    return null;
  }

  return body.length <= 800 ? body : `${body.slice(0, 797)}...`;
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return "Challenge critique generation failed.";
}

function toPercentConfidence(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round(value / 100)));
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RequestChallengeCritiqueValidationError("requestChallengeCritique input must be an object.");
  }

  return value as Record<string, unknown>;
}

function readRequiredString(
  value: unknown,
  fieldName: string,
  options: { minLength?: number; maxLength?: number } = {},
): string {
  if (typeof value !== "string") {
    throw new RequestChallengeCritiqueValidationError(`${fieldName} must be a string.`);
  }

  const trimmed = value.trim();

  if (options.minLength !== undefined && trimmed.length < options.minLength) {
    throw new RequestChallengeCritiqueValidationError(`${fieldName} must be at least ${options.minLength} character(s).`);
  }

  if (options.maxLength !== undefined && trimmed.length > options.maxLength) {
    throw new RequestChallengeCritiqueValidationError(`${fieldName} must be at most ${options.maxLength} character(s).`);
  }

  return trimmed;
}

function readOptionalString(
  value: unknown,
  fieldName: string,
  options: { maxLength?: number } = {},
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new RequestChallengeCritiqueValidationError(`${fieldName} must be a string when provided.`);
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (options.maxLength !== undefined && trimmed.length > options.maxLength) {
    throw new RequestChallengeCritiqueValidationError(`${fieldName} must be at most ${options.maxLength} character(s).`);
  }

  return trimmed;
}

function isRequestChallengeCritiqueRepositoryTx(value: unknown): value is RequestChallengeCritiqueRepositoryTx {
  return Boolean(
    value &&
      typeof value === "object" &&
      "findOwnedRound" in value &&
      typeof (value as RequestChallengeCritiqueRepositoryTx).findOwnedRound === "function" &&
      "findOwnedCritiqueByRound" in value &&
      typeof (value as RequestChallengeCritiqueRepositoryTx).findOwnedCritiqueByRound === "function" &&
      "findMapById" in value &&
      typeof (value as RequestChallengeCritiqueRepositoryTx).findMapById === "function" &&
      "findClaimById" in value &&
      typeof (value as RequestChallengeCritiqueRepositoryTx).findClaimById === "function" &&
      "insertChallengeCritique" in value &&
      typeof (value as RequestChallengeCritiqueRepositoryTx).insertChallengeCritique === "function" &&
      "updateChallengeCritiquePlaceholder" in value &&
      typeof (value as RequestChallengeCritiqueRepositoryTx).updateChallengeCritiquePlaceholder === "function" &&
      "insertMoveEvent" in value &&
      typeof (value as RequestChallengeCritiqueRepositoryTx).insertMoveEvent === "function",
  );
}

function hasSelectQuery(value: RequestChallengeCritiqueTx): value is RequestChallengeCritiqueDbTx {
  return "select" in value && typeof value.select === "function";
}

export function validateRequestChallengeCritiqueInput(input: unknown): NormalizedRequestChallengeCritiqueInput {
  const object = asObject(input);

  return {
    userId: readRequiredString(object.userId, "userId", { minLength: 1, maxLength: 200 }),
    roundId: readRequiredString(object.roundId, "roundId", { minLength: 1, maxLength: 200 }),
    requestId: readOptionalString(object.requestId, "requestId", { maxLength: 200 }),
  };
}

async function findOwnedCritique(
  tx: RequestChallengeCritiqueTx,
  input: { critiqueId: string; userId: string },
): Promise<{ id: string; roundId: string; status: string; body: string | null } | null> {
  if (isRequestChallengeCritiqueRepositoryTx(tx) && tx.findOwnedCritique) {
    return (await tx.findOwnedCritique(input)) ?? null;
  }

  if (!hasSelectQuery(tx)) {
    return null;
  }

  const rows = (await tx
    .select({
      id: challengeCritiques.id,
      roundId: challengeCritiques.roundId,
      status: challengeCritiques.status,
      body: challengeCritiques.body,
    })
    .from(challengeCritiques)
    .where(and(eq(challengeCritiques.id, input.critiqueId), eq(challengeCritiques.userId, input.userId)))
    .limit(1)) as RequestChallengeCritiqueDbCritiqueRow[];

  return rows[0] ?? null;
}

async function findOwnedCritiqueByRound(
  tx: RequestChallengeCritiqueTx,
  input: { roundId: string; userId: string },
): Promise<{ id: string; roundId: string; status: string; body: string | null } | null> {
  if (isRequestChallengeCritiqueRepositoryTx(tx)) {
    return tx.findOwnedCritiqueByRound(input);
  }

  if (!hasSelectQuery(tx)) {
    return null;
  }

  const rows = (await tx
    .select({
      id: challengeCritiques.id,
      roundId: challengeCritiques.roundId,
      status: challengeCritiques.status,
      body: challengeCritiques.body,
    })
    .from(challengeCritiques)
    .where(and(eq(challengeCritiques.roundId, input.roundId), eq(challengeCritiques.userId, input.userId)))
    .limit(1)) as RequestChallengeCritiqueDbCritiqueRow[];

  return rows[0] ?? null;
}

async function findMapById(
  tx: RequestChallengeCritiqueTx,
  input: { mapId: string },
): Promise<{ id: string; userId: string } | null> {
  if (isRequestChallengeCritiqueRepositoryTx(tx)) {
    return tx.findMapById(input);
  }

  const rows = (await tx
    .select({
      id: maps.id,
      userId: maps.userId,
    })
    .from(maps)
    .where(eq(maps.id, input.mapId))
    .limit(1)) as RequestChallengeCritiqueDbMapRow[];

  return rows[0] ?? null;
}

async function findClaimById(
  tx: RequestChallengeCritiqueTx,
  input: { claimId: string },
): Promise<{ id: string; mapId: string; userId: string } | null> {
  if (isRequestChallengeCritiqueRepositoryTx(tx)) {
    return tx.findClaimById(input);
  }

  const rows = (await tx
    .select({
      id: claims.id,
      mapId: claims.mapId,
      userId: claims.userId,
    })
    .from(claims)
    .where(eq(claims.id, input.claimId))
    .limit(1)) as RequestChallengeCritiqueDbClaimRow[];

  return rows[0] ?? null;
}

async function loadCurrentClaimContext(
  tx: RequestChallengeCritiqueDbTx,
  input: { claimId: string; mapId: string; userId: string },
): Promise<{ claimText: string; claimConfidenceBps: number | null } | null> {
  const rows = (await tx
    .select({
      id: claims.id,
      body: claims.body,
      confidenceBps: claims.confidenceBps,
    })
    .from(claims)
    .where(and(eq(claims.id, input.claimId), eq(claims.mapId, input.mapId), eq(claims.userId, input.userId)))
    .limit(1)) as RequestChallengeCritiqueDbClaimRow[];

  const row = rows[0] ?? null;

  if (!row) {
    return null;
  }

  return {
    claimText: row.body ?? "",
    claimConfidenceBps: row.confidenceBps ?? null,
  };
}

async function loadMapTitle(
  tx: RequestChallengeCritiqueDbTx,
  input: { mapId: string; userId: string },
): Promise<string | null> {
  const rows = (await tx
    .select({
      id: maps.id,
      title: maps.title,
      userId: maps.userId,
    })
    .from(maps)
    .where(and(eq(maps.id, input.mapId), eq(maps.userId, input.userId)))
    .limit(1)) as RequestChallengeCritiqueDbMapTitleRow[];

  return rows[0]?.title ?? null;
}

async function loadPriorChallengeContext(
  tx: RequestChallengeCritiqueDbTx,
  input: { currentRoundId: string; mapId: string; claimId: string; userId: string },
): Promise<GenerateChallengeCritiquePreviousRound[]> {
  const roundRows = (await tx
    .select({
      id: challengeRounds.id,
      createdAt: challengeRounds.createdAt,
    })
    .from(challengeRounds)
    .where(
      and(
        eq(challengeRounds.mapId, input.mapId),
        eq(challengeRounds.claimId, input.claimId),
        eq(challengeRounds.userId, input.userId),
      ),
    )
    .orderBy(challengeRounds.createdAt, challengeRounds.id)) as RequestChallengeCritiqueDbRoundSummaryRow[];

  const priorRounds = roundRows.filter((row) => row.id !== input.currentRoundId);
  const results: GenerateChallengeCritiquePreviousRound[] = [];

  for (const [index, round] of priorRounds.entries()) {
    const critiqueRows = (await tx
      .select({
        id: challengeCritiques.id,
        status: challengeCritiques.status,
        body: challengeCritiques.body,
        critiqueJson: challengeCritiques.critiqueJson,
        createdAt: challengeCritiques.createdAt,
      })
      .from(challengeCritiques)
      .where(and(eq(challengeCritiques.roundId, round.id), eq(challengeCritiques.userId, input.userId)))
      .orderBy(challengeCritiques.createdAt, challengeCritiques.id)) as Array<{
      id: string;
      status: string;
      body: string | null;
      critiqueJson: unknown;
      createdAt: Date;
    }>;

    const critiqueRow = critiqueRows.at(-1) ?? null;
    const critiqueSummary = critiqueRow
      ? readGeneratedCritiqueSummary({
          body: critiqueRow.body,
          critiqueJson: asRecord(critiqueRow.critiqueJson),
        })
      : null;

    if (!critiqueSummary) {
      continue;
    }

    const responseEventRows = (await tx
      .select({
        payloadJson: movesEvents.payloadJson,
      })
      .from(movesEvents)
      .where(
        and(
          eq(movesEvents.aggregateType, "challenge_round"),
          eq(movesEvents.aggregateId, round.id),
          eq(movesEvents.userId, input.userId),
          eq(movesEvents.type, "challenge.response.recorded"),
        ),
      )
      .orderBy(movesEvents.createdAt, movesEvents.id)) as RequestChallengeCritiqueDbMoveEventRow[];

    const responsePayload = asRecord(responseEventRows.at(-1)?.payloadJson);

    results.push({
      roundId: round.id,
      roundNumber: index + 1,
      critiqueSummary,
      userResponse: readLooseOptionalString(responsePayload?.response),
      responsePath: readLooseOptionalString(responsePayload?.responsePath),
      confidenceDelta: null,
    });
  }

  return results;
}

async function findRoundForChallengeCritique(
  tx: RequestChallengeCritiqueTx,
  input: { roundId: string; userId: string },
): Promise<{ id: string; mapId: string; claimId: string; userId: string } | null> {
  if (isRequestChallengeCritiqueRepositoryTx(tx)) {
    if (tx.findRoundById) {
      return tx.findRoundById({ roundId: input.roundId });
    }

    return tx.findOwnedRound(input);
  }

  return (
    (await tx
      .select({
        id: challengeRounds.id,
        mapId: challengeRounds.mapId,
        claimId: challengeRounds.claimId,
        userId: challengeRounds.userId,
      })
      .from(challengeRounds)
      .where(eq(challengeRounds.id, input.roundId))
      .limit(1)) as RequestChallengeCritiqueDbRoundRow[]
  )[0] ?? null;
}

async function updateCritiquePlaceholder(
  tx: RequestChallengeCritiqueTx,
  record: {
    id: string;
    userId: string;
    status: ChallengeCritiqueStatus;
    body: string | null;
    updatedAt: Date;
  },
) {
  if (isRequestChallengeCritiqueRepositoryTx(tx)) {
    await tx.updateChallengeCritiquePlaceholder(record);
    return;
  }

  await tx
    .update(challengeCritiques)
    .set({
      status: record.status,
      body: record.body,
      critiqueJson: null,
      updatedAt: record.updatedAt,
    })
    .where(and(eq(challengeCritiques.id, record.id), eq(challengeCritiques.userId, record.userId)));
}

async function insertCritiqueEvent(
  tx: RequestChallengeCritiqueTx,
  event: ChallengeCritiqueRequestedEventRecord,
) {
  if (isRequestChallengeCritiqueRepositoryTx(tx)) {
    await tx.insertMoveEvent(event);
    return;
  }

  await tx.insert(movesEvents).values({
    userId: event.userId,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    requestId: event.requestId,
    type: event.type,
    payloadJson: event.payload,
    createdAt: event.createdAt,
  });
}

async function updateGeneratedCritique(
  tx: RequestChallengeCritiqueDbTx,
  input: {
    critiqueId: string;
    userId: string;
    body: string;
    critiqueJson: Record<string, unknown>;
    updatedAt: Date;
  },
) {
  await tx
    .update(challengeCritiques)
    .set({
      status: READY_STATUS,
      body: input.body,
      critiqueJson: input.critiqueJson,
      updatedAt: input.updatedAt,
    })
    .where(and(eq(challengeCritiques.id, input.critiqueId), eq(challengeCritiques.userId, input.userId)));
}

async function updateFailedCritique(
  tx: RequestChallengeCritiqueDbTx,
  input: {
    critiqueId: string;
    userId: string;
    updatedAt: Date;
  },
) {
  await tx
    .update(challengeCritiques)
    .set({
      status: FAILED_STATUS,
      body: null,
      critiqueJson: null,
      updatedAt: input.updatedAt,
    })
    .where(and(eq(challengeCritiques.id, input.critiqueId), eq(challengeCritiques.userId, input.userId)));
}

async function insertGeneratedCritiqueEvent(
  tx: RequestChallengeCritiqueDbTx,
  input: {
    critiqueId: string;
    roundId: string;
    mapId: string;
    claimId: string;
    userId: string;
    requestId: string;
    createdAt: Date;
    body: string;
    critiqueJson: Record<string, unknown>;
    provider: string | null;
    model: string | null;
    promptVersion: string | null;
  },
) {
  await tx.insert(movesEvents).values({
    userId: input.userId,
    aggregateType: "challenge_critique",
    aggregateId: input.critiqueId,
    requestId: input.requestId,
    type: "challenge.critique.generated",
    payloadJson: {
      roundId: input.roundId,
      mapId: input.mapId,
      claimId: input.claimId,
      status: READY_STATUS,
      body: input.body,
      critiqueJson: input.critiqueJson,
      ...(input.provider ? { provider: input.provider } : {}),
      ...(input.model ? { model: input.model } : {}),
      ...(input.promptVersion ? { promptVersion: input.promptVersion } : {}),
    },
    createdAt: input.createdAt,
  });
}

async function insertFailedCritiqueEvent(
  tx: RequestChallengeCritiqueDbTx,
  input: {
    critiqueId: string;
    roundId: string;
    mapId: string;
    claimId: string;
    userId: string;
    requestId: string;
    createdAt: Date;
    errorMessage: string;
  },
) {
  await tx.insert(movesEvents).values({
    userId: input.userId,
    aggregateType: "challenge_critique",
    aggregateId: input.critiqueId,
    requestId: input.requestId,
    type: "challenge.critique.failed",
    payloadJson: {
      roundId: input.roundId,
      mapId: input.mapId,
      claimId: input.claimId,
      status: FAILED_STATUS,
      errorMessage: input.errorMessage,
    },
    createdAt: input.createdAt,
  });
}

async function bridgeGenerateCritique(
  tx: RequestChallengeCritiqueDbTx,
  input: {
    critiqueId: string;
    roundId: string;
    mapId: string;
    claimId: string;
    userId: string;
    requestId: string;
    createdAt: Date;
  },
) {
  const claimContext = await loadCurrentClaimContext(tx, {
    claimId: input.claimId,
    mapId: input.mapId,
    userId: input.userId,
  });

  if (!claimContext) {
    const errorMessage = "Challenge critique generation failed because the claim context is missing.";

    await updateFailedCritique(tx, {
      critiqueId: input.critiqueId,
      userId: input.userId,
      updatedAt: input.createdAt,
    });

    await insertFailedCritiqueEvent(tx, {
      ...input,
      errorMessage,
    });

    return;
  }

  const mapTitle = await loadMapTitle(tx, {
    mapId: input.mapId,
    userId: input.userId,
  });
  const previousRounds = await loadPriorChallengeContext(tx, {
    currentRoundId: input.roundId,
    mapId: input.mapId,
    claimId: input.claimId,
    userId: input.userId,
  });

  try {
    const generated = await generateChallengeCritiqueOperation(
      {
        claimId: input.claimId,
        claimText: claimContext.claimText,
        claimConfidence: toPercentConfidence(claimContext.claimConfidenceBps),
        mapTitle,
        previousRounds,
        priorRoundContext: previousRounds.at(-1) ?? null,
      },
      {
        userId: input.userId,
        mapId: input.mapId,
        claimId: input.claimId,
        roundId: input.roundId,
        requestId: input.requestId,
      },
    );

    const critiqueJson = generated.output as Record<string, unknown>;
    const body = formatStructuredCritique(critiqueJson);

    await updateGeneratedCritique(tx, {
      critiqueId: input.critiqueId,
      userId: input.userId,
      body,
      critiqueJson,
      updatedAt: input.createdAt,
    });

    await insertGeneratedCritiqueEvent(tx, {
      ...input,
      body,
      critiqueJson,
      provider: generated.meta.provider,
      model: generated.meta.model,
      promptVersion: generated.meta.promptVersion,
    });
  } catch (error) {
    const errorMessage = readErrorMessage(error);

    await updateFailedCritique(tx, {
      critiqueId: input.critiqueId,
      userId: input.userId,
      updatedAt: input.createdAt,
    });

    await insertFailedCritiqueEvent(tx, {
      ...input,
      errorMessage,
    });
  }
}

export async function requestChallengeCritique(
  input: unknown,
  repository: RequestChallengeCritiqueRepository | RequestChallengeCritiqueDb = getDb() as unknown as RequestChallengeCritiqueDb,
  dependencies: RequestChallengeCritiqueDependencies = {},
): Promise<RequestChallengeCritiqueResult> {
  const normalized = validateRequestChallengeCritiqueInput(input);
  const createId = dependencies.createId ?? randomUUID;
  const now = dependencies.now ?? (() => new Date());
  const transactionalRepository = repository as RequestChallengeCritiqueTransactional;

  return transactionalRepository.transaction(async (tx) => {
    const commandContext = resolveCommandContext({
      actorUserId: normalized.userId,
      requestId: normalized.requestId,
      now,
      createId,
    });
    const existingEvent = await findExistingMoveEvent(tx, {
      userId: commandContext.actorUserId,
      requestId: commandContext.requestId,
      type: "challenge.critique.requested",
    });

    if (existingEvent) {
      const existingCritique = await findOwnedCritique(tx, {
        critiqueId: existingEvent.aggregateId,
        userId: commandContext.actorUserId,
      });

      return {
        critiqueId: existingEvent.aggregateId,
        roundId:
          existingCritique?.roundId ??
          (typeof existingEvent.payload?.roundId === "string" ? existingEvent.payload.roundId : normalized.roundId),
        critiqueStatus: readPayloadStatus(existingEvent.payload),
      };
    }

    const targetRound = await findRoundForChallengeCritique(tx, {
      roundId: normalized.roundId,
      userId: commandContext.actorUserId,
    });

    if (!targetRound) {
      throw new RequestChallengeCritiqueRoundNotFoundError(normalized.roundId);
    }

    if (targetRound.userId !== commandContext.actorUserId) {
      throw new RequestChallengeCritiqueRoundForbiddenError(normalized.roundId);
    }

    const targetMap = await findMapById(tx, { mapId: targetRound.mapId });
    const targetClaim = await findClaimById(tx, { claimId: targetRound.claimId });

    if (
      !targetMap ||
      !targetClaim ||
      targetMap.userId !== commandContext.actorUserId ||
      targetClaim.userId !== commandContext.actorUserId ||
      targetClaim.mapId !== targetRound.mapId
    ) {
      throw new RequestChallengeCritiqueRoundForbiddenError(normalized.roundId);
    }

    const existingCritique = await findOwnedCritiqueByRound(tx, {
      roundId: targetRound.id,
      userId: commandContext.actorUserId,
    });
    const critiqueId = existingCritique?.id ?? createId();

    if (existingCritique) {
      await updateCritiquePlaceholder(tx, {
        id: critiqueId,
        userId: commandContext.actorUserId,
        status: PENDING_STATUS,
        body: null,
        updatedAt: commandContext.now,
      });
    } else if (isRequestChallengeCritiqueRepositoryTx(tx)) {
      await tx.insertChallengeCritique({
        id: critiqueId,
        roundId: targetRound.id,
        mapId: targetRound.mapId,
        claimId: targetRound.claimId,
        userId: commandContext.actorUserId,
        status: PENDING_STATUS,
        body: null,
        createdAt: commandContext.now,
        updatedAt: commandContext.now,
      });
    } else {
      await tx.insert(challengeCritiques).values({
        id: critiqueId,
        roundId: targetRound.id,
        mapId: targetRound.mapId,
        claimId: targetRound.claimId,
        userId: commandContext.actorUserId,
        status: PENDING_STATUS,
        body: null,
        createdAt: commandContext.now,
        updatedAt: commandContext.now,
      });
    }

    await insertCritiqueEvent(tx, {
      userId: commandContext.actorUserId,
      aggregateType: "challenge_critique",
      aggregateId: critiqueId,
      requestId: commandContext.requestId,
      type: "challenge.critique.requested",
      payload: {
        roundId: targetRound.id,
        mapId: targetRound.mapId,
        claimId: targetRound.claimId,
        status: PENDING_STATUS,
      },
      createdAt: commandContext.now,
    });

    if (hasSelectQuery(tx)) {
      await bridgeGenerateCritique(tx, {
        critiqueId,
        roundId: targetRound.id,
        mapId: targetRound.mapId,
        claimId: targetRound.claimId,
        userId: commandContext.actorUserId,
        requestId: commandContext.requestId,
        createdAt: commandContext.now,
      });
    }

    return {
      critiqueId,
      roundId: targetRound.id,
      critiqueStatus: PENDING_STATUS,
    };
  });
}
