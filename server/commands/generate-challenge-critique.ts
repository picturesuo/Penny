import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { generateChallengeCritique as generateChallengeCritiqueOperation } from "../ai/operations/generateChallengeCritique.ts";
import { generateChallengeCritique as generateChallengeCritiqueStub } from "../ai/generate-challenge-critique.ts";
import { getDb } from "../db/client.ts";
import { challengeCritiques, claims, maps, movesEvents } from "../db/schema.ts";
import { findExistingMoveEvent, type SelectableDbTx } from "../idempotency/find-existing-move-event.ts";

export type GenerateChallengeCritiqueEventType = "challenge.critique.generated";

export type GenerateChallengeCritiqueInput = {
  userId: string;
  critiqueId: string;
  requestId?: string | null;
};

export type ChallengeCritiqueReadyRecord = {
  id: string;
  userId: string;
  status: "ready";
  body: string;
  updatedAt: Date;
};

export type ChallengeCritiqueGeneratedEventRecord = {
  userId: string;
  aggregateType: "challenge_critique";
  aggregateId: string;
  requestId: string;
  type: GenerateChallengeCritiqueEventType;
  payload: {
    roundId: string;
    mapId: string;
    claimId: string;
    status: "ready";
    body: string;
    critiqueJson?: Record<string, unknown>;
    provider?: string | null;
    model?: string | null;
    promptVersion?: string | null;
  };
  createdAt: Date;
};

export type GenerateChallengeCritiqueRepositoryTx = {
  findMoveEventByRequestId?(input: {
    userId: string;
    requestId: string;
    type: string;
  }): Promise<{ aggregateId: string; payload: Record<string, unknown> | null } | null>;
  findOwnedCritique(input: {
    critiqueId: string;
    userId: string;
  }): Promise<{ id: string; roundId: string; mapId: string; claimId: string; userId: string; status: string; body: string | null } | null>;
  findOwnedClaim(input: {
    claimId: string;
    mapId: string;
    userId: string;
  }): Promise<{ body: string } | null>;
  findCritiqueGenerationContext?(input: {
    claimId: string;
    mapId: string;
    userId: string;
  }): Promise<{
    claimText: string | null;
    claimConfidenceBps: number | null;
    mapTitle: string | null;
  } | null>;
  updateChallengeCritique(record: ChallengeCritiqueReadyRecord): Promise<void>;
  insertMoveEvent(event: ChallengeCritiqueGeneratedEventRecord): Promise<void>;
};

export type GenerateChallengeCritiqueRepository = {
  transaction<T>(callback: (tx: GenerateChallengeCritiqueRepositoryTx) => Promise<T>): Promise<T>;
};

type GenerateChallengeCritiqueDbCritiqueRow = {
  id: string;
  roundId: string;
  mapId: string;
  claimId: string;
  userId: string;
  status: string;
  body: string | null;
};

type GenerateChallengeCritiqueDbClaimRow = {
  body: string;
  confidenceBps: number;
};

type GenerateChallengeCritiqueDbMapRow = {
  title: string;
};

type GenerateChallengeCritiqueDbTx = SelectableDbTx & {
  update: (table: unknown) => {
    set: (value: Record<string, unknown>) => {
      where: (condition: unknown) => Promise<unknown>;
    };
  };
  insert: (table: unknown) => {
    values: (value: Record<string, unknown>) => Promise<unknown>;
  };
};

type GenerateChallengeCritiqueTx = GenerateChallengeCritiqueRepositoryTx | GenerateChallengeCritiqueDbTx;

type GenerateChallengeCritiqueDb = {
  transaction<T>(callback: (tx: GenerateChallengeCritiqueDbTx) => Promise<T>): Promise<T>;
};

type GenerateChallengeCritiqueTransactional = {
  transaction<T>(callback: (tx: GenerateChallengeCritiqueTx) => Promise<T>): Promise<T>;
};

type LoadedChallengeCritiqueContext = {
  critiqueId: string;
  roundId: string;
  mapId: string;
  claimId: string;
  userId: string;
  claimText: string | null;
  claimConfidenceBps: number | null;
  mapTitle: string | null;
};

type GeneratedChallengeCritiqueArtifact = {
  body: string;
  critiqueJson?: Record<string, unknown>;
  metadata: {
    provider: string | null;
    model: string | null;
    promptVersion: string | null;
  };
};

export type GenerateChallengeCritiqueResult = {
  critiqueId: string;
  status: "ready";
  body: string;
};

export type GenerateChallengeCritiqueDependencies = {
  createId?: () => string;
  generateCritique?: (input: LoadedChallengeCritiqueContext) => Promise<GeneratedChallengeCritiqueArtifact>;
  now?: () => Date;
};

export class GenerateChallengeCritiqueValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerateChallengeCritiqueValidationError";
  }
}

export class GenerateChallengeCritiqueNotFoundError extends Error {
  constructor(critiqueId: string) {
    super(`Challenge critique not found for generateChallengeCritique: ${critiqueId}`);
    this.name = "GenerateChallengeCritiqueNotFoundError";
  }
}

export class GenerateChallengeCritiqueClaimNotFoundError extends Error {
  constructor(claimId: string) {
    super(`Claim not found for generateChallengeCritique: ${claimId}`);
    this.name = "GenerateChallengeCritiqueClaimNotFoundError";
  }
}

type NormalizedGenerateChallengeCritiqueInput = {
  userId: string;
  critiqueId: string;
  requestId: string | null;
};

const READY_STATUS = "ready" as const;
const FALLBACK_PROMPT_VERSION = "generateChallengeCritique.stub.v1";
const FALLBACK_MODEL = "heuristic-stub";
const FALLBACK_PROVIDER = "local";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function formatListSection(title: string, items: string[]): string | null {
  if (!items.length) {
    return null;
  }

  return `${title}:\n- ${items.join("\n- ")}`;
}

function formatStructuredCritique(output: Record<string, unknown>): string {
  const sections = [
    readOptionalString(output.conciseCritiqueSummary) ? `Main challenge: ${readOptionalString(output.conciseCritiqueSummary)}` : null,
    readOptionalString(output.strongestCounterargument)
      ? `Strongest counterargument: ${readOptionalString(output.strongestCounterargument)}`
      : null,
    formatListSection("Assumptions", readStringArray(output.assumptions)),
    formatListSection("Likely failure modes", readStringArray(output.likelyFailureModes)),
    formatListSection("Follow-up questions", readStringArray(output.followUpQuestions)),
    typeof output.suggestedConfidenceDelta === "number"
      ? `Suggested confidence delta: ${output.suggestedConfidenceDelta}`
      : null,
    readOptionalString(output.uncertaintyNote) ? `Uncertainty note: ${readOptionalString(output.uncertaintyNote)}` : null,
  ];

  return sections.filter((section): section is string => Boolean(section)).join("\n\n");
}

function readGeneratedBody(payload: Record<string, unknown> | null): string | null {
  const body = readOptionalString(payload?.body);

  if (body) {
    return body;
  }

  const critiqueJson = asRecord(payload?.critiqueJson);
  const critiqueBody = readOptionalString(critiqueJson?.body);

  if (critiqueBody) {
    return critiqueBody;
  }

  return critiqueJson ? formatStructuredCritique(critiqueJson) || null : null;
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GenerateChallengeCritiqueValidationError("generateChallengeCritique input must be an object.");
  }

  return value as Record<string, unknown>;
}

function readRequiredString(
  value: unknown,
  fieldName: string,
  options: { minLength?: number; maxLength?: number } = {},
): string {
  if (typeof value !== "string") {
    throw new GenerateChallengeCritiqueValidationError(`${fieldName} must be a string.`);
  }

  const trimmed = value.trim();

  if (options.minLength !== undefined && trimmed.length < options.minLength) {
    throw new GenerateChallengeCritiqueValidationError(`${fieldName} must be at least ${options.minLength} character(s).`);
  }

  if (options.maxLength !== undefined && trimmed.length > options.maxLength) {
    throw new GenerateChallengeCritiqueValidationError(`${fieldName} must be at most ${options.maxLength} character(s).`);
  }

  return trimmed;
}

function readOptionalInputString(
  value: unknown,
  fieldName: string,
  options: { maxLength?: number } = {},
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new GenerateChallengeCritiqueValidationError(`${fieldName} must be a string when provided.`);
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (options.maxLength !== undefined && trimmed.length > options.maxLength) {
    throw new GenerateChallengeCritiqueValidationError(`${fieldName} must be at most ${options.maxLength} character(s).`);
  }

  return trimmed;
}

function isGenerateChallengeCritiqueRepositoryTx(value: unknown): value is GenerateChallengeCritiqueRepositoryTx {
  return Boolean(
    value &&
      typeof value === "object" &&
      "findOwnedCritique" in value &&
      typeof (value as GenerateChallengeCritiqueRepositoryTx).findOwnedCritique === "function" &&
      "findOwnedClaim" in value &&
      typeof (value as GenerateChallengeCritiqueRepositoryTx).findOwnedClaim === "function" &&
      "updateChallengeCritique" in value &&
      typeof (value as GenerateChallengeCritiqueRepositoryTx).updateChallengeCritique === "function" &&
      "insertMoveEvent" in value &&
      typeof (value as GenerateChallengeCritiqueRepositoryTx).insertMoveEvent === "function",
  );
}

function hasSelectQuery(value: GenerateChallengeCritiqueTx): value is GenerateChallengeCritiqueDbTx {
  return "select" in value && typeof value.select === "function";
}

export function validateGenerateChallengeCritiqueInput(input: unknown): NormalizedGenerateChallengeCritiqueInput {
  const object = asObject(input);

  return {
    userId: readRequiredString(object.userId, "userId", { minLength: 1, maxLength: 200 }),
    critiqueId: readRequiredString(object.critiqueId, "critiqueId", { minLength: 1, maxLength: 200 }),
    requestId: readOptionalInputString(object.requestId, "requestId", { maxLength: 200 }),
  };
}

async function findOwnedCritique(
  tx: GenerateChallengeCritiqueTx,
  input: { critiqueId: string; userId: string },
): Promise<{
  id: string;
  roundId: string;
  mapId: string;
  claimId: string;
  userId: string;
  status: string;
  body: string | null;
} | null> {
  if (isGenerateChallengeCritiqueRepositoryTx(tx)) {
    return tx.findOwnedCritique(input);
  }

  if (!hasSelectQuery(tx)) {
    return null;
  }

  const rows = (await tx
    .select({
      id: challengeCritiques.id,
      roundId: challengeCritiques.roundId,
      mapId: challengeCritiques.mapId,
      claimId: challengeCritiques.claimId,
      userId: challengeCritiques.userId,
      status: challengeCritiques.status,
      body: challengeCritiques.body,
    })
    .from(challengeCritiques)
    .where(and(eq(challengeCritiques.id, input.critiqueId), eq(challengeCritiques.userId, input.userId)))
    .limit(1)) as GenerateChallengeCritiqueDbCritiqueRow[];

  return rows[0] ?? null;
}

async function defaultGenerateCritique(input: LoadedChallengeCritiqueContext): Promise<GeneratedChallengeCritiqueArtifact> {
  const claimText = input.claimText?.trim() || "This claim needs a sharper challenge critique and a falsifiable test.";

  try {
    const generated = await generateChallengeCritiqueOperation(
      {
        claimId: input.claimId,
        claimText,
        claimConfidence:
          typeof input.claimConfidenceBps === "number" && Number.isFinite(input.claimConfidenceBps)
            ? Math.max(0, Math.min(100, Math.round(input.claimConfidenceBps / 100)))
            : 50,
        mapTitle: input.mapTitle,
        neighboringClaims: [],
        previousRounds: [],
      },
      {
        userId: input.userId,
        mapId: input.mapId,
        claimId: input.claimId,
        roundId: input.roundId,
      },
    );

    const critiqueJson = generated.output as unknown as Record<string, unknown>;

    return {
      body: formatStructuredCritique(critiqueJson),
      critiqueJson,
      metadata: {
        provider: generated.meta.provider,
        model: generated.meta.model,
        promptVersion: generated.meta.promptVersion,
      },
    };
  } catch {
    const generated = generateChallengeCritiqueStub({
      claim: claimText,
    });

    return {
      body: generated.body,
      critiqueJson: {
        body: generated.body,
      },
      metadata: {
        provider: FALLBACK_PROVIDER,
        model: FALLBACK_MODEL,
        promptVersion: FALLBACK_PROMPT_VERSION,
      },
    };
  }
}

async function loadChallengeCritiqueContext(
  tx: GenerateChallengeCritiqueTx,
  critique: { id: string; roundId: string; mapId: string; claimId: string; userId: string },
): Promise<LoadedChallengeCritiqueContext> {
  if (isGenerateChallengeCritiqueRepositoryTx(tx) && tx.findCritiqueGenerationContext) {
    const context = await tx.findCritiqueGenerationContext({
      claimId: critique.claimId,
      mapId: critique.mapId,
      userId: critique.userId,
    });

    if (!context?.claimText) {
      throw new GenerateChallengeCritiqueClaimNotFoundError(critique.claimId);
    }

    return {
      critiqueId: critique.id,
      roundId: critique.roundId,
      mapId: critique.mapId,
      claimId: critique.claimId,
      userId: critique.userId,
      claimText: context.claimText,
      claimConfidenceBps: context.claimConfidenceBps ?? null,
      mapTitle: context.mapTitle ?? null,
    };
  }

  if (isGenerateChallengeCritiqueRepositoryTx(tx)) {
    const claim = await tx.findOwnedClaim({
      claimId: critique.claimId,
      mapId: critique.mapId,
      userId: critique.userId,
    });

    if (!claim) {
      throw new GenerateChallengeCritiqueClaimNotFoundError(critique.claimId);
    }

    return {
      critiqueId: critique.id,
      roundId: critique.roundId,
      mapId: critique.mapId,
      claimId: critique.claimId,
      userId: critique.userId,
      claimText: claim.body,
      claimConfidenceBps: null,
      mapTitle: null,
    };
  }

  if (!hasSelectQuery(tx)) {
    throw new GenerateChallengeCritiqueClaimNotFoundError(critique.claimId);
  }

  const claimRows = (await tx
    .select({
      body: claims.body,
      confidenceBps: claims.confidenceBps,
    })
    .from(claims)
    .where(and(eq(claims.id, critique.claimId), eq(claims.mapId, critique.mapId), eq(claims.userId, critique.userId)))
    .limit(1)) as GenerateChallengeCritiqueDbClaimRow[];

  const claimRow = claimRows[0] ?? null;

  if (!claimRow) {
    throw new GenerateChallengeCritiqueClaimNotFoundError(critique.claimId);
  }

  const mapRows = (await tx
    .select({
      title: maps.title,
    })
    .from(maps)
    .where(and(eq(maps.id, critique.mapId), eq(maps.userId, critique.userId)))
    .limit(1)) as GenerateChallengeCritiqueDbMapRow[];

  const mapRow = mapRows[0] ?? null;

  return {
    critiqueId: critique.id,
    roundId: critique.roundId,
    mapId: critique.mapId,
    claimId: critique.claimId,
    userId: critique.userId,
    claimText: claimRow.body,
    claimConfidenceBps: claimRow.confidenceBps,
    mapTitle: mapRow?.title ?? null,
  };
}

export async function generateChallengeCritique(
  input: unknown,
  repository: GenerateChallengeCritiqueRepository | GenerateChallengeCritiqueDb = getDb() as unknown as GenerateChallengeCritiqueDb,
  dependencies: GenerateChallengeCritiqueDependencies = {},
): Promise<GenerateChallengeCritiqueResult> {
  const normalized = validateGenerateChallengeCritiqueInput(input);
  const createId = dependencies.createId ?? randomUUID;
  const now = dependencies.now ?? (() => new Date());
  const generateCritique = dependencies.generateCritique ?? defaultGenerateCritique;
  const transactionalRepository = repository as GenerateChallengeCritiqueTransactional;

  return transactionalRepository.transaction(async (tx) => {
    const requestId = normalized.requestId ?? createId();
    const existingEvent = await findExistingMoveEvent(tx, {
      userId: normalized.userId,
      requestId,
      type: "challenge.critique.generated",
    });

    if (existingEvent) {
      const existingCritique = await findOwnedCritique(tx, {
        critiqueId: existingEvent.aggregateId,
        userId: normalized.userId,
      });

      const existingBody = existingCritique?.body ?? readGeneratedBody(existingEvent.payload);

      if (existingCritique?.status === READY_STATUS && existingBody) {
        return {
          critiqueId: existingCritique.id,
          status: READY_STATUS,
          body: existingBody,
        };
      }
    }

    const critique = await findOwnedCritique(tx, {
      critiqueId: normalized.critiqueId,
      userId: normalized.userId,
    });

    if (!critique) {
      throw new GenerateChallengeCritiqueNotFoundError(normalized.critiqueId);
    }

    if (critique.status === READY_STATUS && critique.body) {
      return {
        critiqueId: critique.id,
        status: READY_STATUS,
        body: critique.body,
      };
    }

    const context = await loadChallengeCritiqueContext(tx, critique);
    const generated = await generateCritique(context);
    const timestamp = now();

    if (isGenerateChallengeCritiqueRepositoryTx(tx)) {
      await tx.updateChallengeCritique({
        id: critique.id,
        userId: normalized.userId,
        status: READY_STATUS,
        body: generated.body,
        updatedAt: timestamp,
      });

      await tx.insertMoveEvent({
        userId: normalized.userId,
        aggregateType: "challenge_critique",
        aggregateId: critique.id,
        requestId,
        type: "challenge.critique.generated",
        payload: {
          roundId: critique.roundId,
          mapId: critique.mapId,
          claimId: critique.claimId,
          status: READY_STATUS,
          body: generated.body,
          ...(generated.critiqueJson ? { critiqueJson: generated.critiqueJson } : {}),
          ...(generated.metadata.provider ? { provider: generated.metadata.provider } : {}),
          ...(generated.metadata.model ? { model: generated.metadata.model } : {}),
          ...(generated.metadata.promptVersion ? { promptVersion: generated.metadata.promptVersion } : {}),
        },
        createdAt: timestamp,
      });
    } else {
      await tx
        .update(challengeCritiques)
        .set({
          status: READY_STATUS,
          body: generated.body,
          updatedAt: timestamp,
        })
        .where(and(eq(challengeCritiques.id, critique.id), eq(challengeCritiques.userId, normalized.userId)));

      await tx.insert(movesEvents).values({
        userId: normalized.userId,
        aggregateType: "challenge_critique",
        aggregateId: critique.id,
        requestId,
        type: "challenge.critique.generated",
        payloadJson: {
          roundId: critique.roundId,
          mapId: critique.mapId,
          claimId: critique.claimId,
          status: READY_STATUS,
          body: generated.body,
          ...(generated.critiqueJson ? { critiqueJson: generated.critiqueJson } : {}),
          ...(generated.metadata.provider ? { provider: generated.metadata.provider } : {}),
          ...(generated.metadata.model ? { model: generated.metadata.model } : {}),
          ...(generated.metadata.promptVersion ? { promptVersion: generated.metadata.promptVersion } : {}),
        },
        createdAt: timestamp,
      });
    }

    return {
      critiqueId: critique.id,
      status: READY_STATUS,
      body: generated.body,
    };
  });
}
