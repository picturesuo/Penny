import { and, eq } from "drizzle-orm";

import type { DbClient } from "../../db/client.ts";
import { getDb } from "../../db/client.ts";
import { claims, maps } from "../../db/schema.ts";
import { SUMMARIZE_MAP_PROMPT_VERSION, buildSummarizeMapPromptInput } from "../prompts/summarizeMap/v1.ts";
import { validateSummarizeMapOutput, type SummarizeMapOutput } from "../schemas/summarizeMap.ts";

export type SummarizeMapInput = {
  userId: string;
  mapId: string;
};

export type SummarizeMapResult = SummarizeMapOutput;

export type SummarizeMapRepository = {
  findMap(input: { userId: string; mapId: string }): Promise<{ id: string; title: string } | null>;
  findClaims(input: { userId: string; mapId: string }): Promise<Array<{ id: string; body: string; confidenceBps: number }>>;
};

export class SummarizeMapValidationError extends Error {
  readonly issues: string[];

  constructor(message: string, issues: string[] = [message]) {
    super(message);
    this.name = "SummarizeMapValidationError";
    this.issues = issues;
  }
}

export class SummarizeMapNotFoundError extends Error {
  constructor(mapId: string) {
    super(`Map not found for summarizeMap: ${mapId}`);
    this.name = "SummarizeMapNotFoundError";
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SummarizeMapValidationError("summarizeMap input must be an object.");
  }

  return value as Record<string, unknown>;
}

function readRequiredString(value: unknown, fieldName: string, maxLength: number) {
  if (typeof value !== "string") {
    throw new SummarizeMapValidationError(`${fieldName} must be a string.`);
  }

  const trimmed = value.trim();

  if (!trimmed) {
    throw new SummarizeMapValidationError(`${fieldName} must not be blank.`);
  }

  if (trimmed.length > maxLength) {
    throw new SummarizeMapValidationError(`${fieldName} must be at most ${maxLength} characters.`);
  }

  return trimmed;
}

function validateInput(input: unknown): SummarizeMapInput {
  const object = asRecord(input);

  return {
    userId: readRequiredString(object.userId, "userId", 200),
    mapId: readRequiredString(object.mapId, "mapId", 200),
  };
}

export function createSummarizeMapDbRepository(db: DbClient = getDb()): SummarizeMapRepository {
  return {
    async findMap(input) {
      return (
        await db
          .select({
            id: maps.id,
            title: maps.title,
          })
          .from(maps)
          .where(and(eq(maps.id, input.mapId), eq(maps.userId, input.userId)))
          .limit(1)
      )[0] ?? null;
    },
    async findClaims(input) {
      return db
        .select({
          id: claims.id,
          body: claims.body,
          confidenceBps: claims.confidenceBps,
        })
        .from(claims)
        .where(and(eq(claims.mapId, input.mapId), eq(claims.userId, input.userId)))
        .limit(25);
    },
  };
}

export const summarizeMapDeps: {
  repository?: SummarizeMapRepository;
} = {};

function compactClaim(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= 140 ? normalized : `${normalized.slice(0, 137).trim()}...`;
}

function findTensions(claimTexts: string[]) {
  const hasMust = claimTexts.some((claim) => /\b(should|must|need to|ought)\b/i.test(claim));
  const hasRisk = claimTexts.some((claim) => /\b(risk|tradeoff|but|however|unless|except)\b/i.test(claim));
  const hasCausal = claimTexts.some((claim) => /\b(because|causes?|drives?|leads? to|therefore)\b/i.test(claim));
  const tensions: string[] = [];

  if (hasMust && hasRisk) {
    tensions.push("The map mixes recommendations with unresolved tradeoffs.");
  }

  if (hasCausal) {
    tensions.push("At least one claim depends on a causal story that should be tested.");
  }

  if (tensions.length === 0) {
    tensions.push("The strongest tension is still implicit: what evidence would make these claims false?");
  }

  return tensions;
}

export async function summarizeMap(
  input: unknown,
  repository: SummarizeMapRepository = summarizeMapDeps.repository ?? createSummarizeMapDbRepository(),
): Promise<SummarizeMapResult> {
  const normalized = validateInput(input);
  const map = await repository.findMap(normalized);

  if (!map) {
    throw new SummarizeMapNotFoundError(normalized.mapId);
  }

  const claimRows = await repository.findClaims(normalized);
  const claimTexts = claimRows.map((claim) => compactClaim(claim.body));
  const promptInput = buildSummarizeMapPromptInput({
    mapId: map.id,
    title: map.title,
    claims: claimTexts,
  });
  const keyClaims = claimTexts.slice(0, 5);
  const output = {
    summary:
      keyClaims.length > 0
        ? `${map.title} currently centers on ${keyClaims.length} key claim${keyClaims.length === 1 ? "" : "s"} about ${keyClaims[0]}.`
        : `${map.title} does not have claims yet, so the map summary is still a placeholder for future thinking.`,
    keyClaims: keyClaims.length > 0 ? keyClaims : ["Add the first claim to make this map summarizable."],
    tensions: findTensions(claimTexts),
    nextQuestions:
      keyClaims.length > 0
        ? [
            "Which claim has the weakest evidence?",
            "What would change your confidence in the most central claim?",
          ]
        : ["What is the first claim this map should preserve?"],
  };

  void promptInput;
  void SUMMARIZE_MAP_PROMPT_VERSION;

  return validateSummarizeMapOutput(output);
}
