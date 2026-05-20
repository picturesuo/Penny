import { createHash } from "node:crypto";
import type { BrainDevelopmentEventKind, BrainRankerResult } from "./brain-ranker.ts";
import { createPennyDb, type PennyDatabase } from "./db/client.ts";
import { brainDevelopmentEvents, brainRankedCandidates, brainRankerRuns } from "./db/schema.ts";
import type { BrainScope } from "./scope.ts";

export type RecordBrainRankerRunInput = {
  scope: BrainScope;
  createProjectId: string;
  createSessionId: string;
  optionSetId: string;
  rawIdea: string;
  result: BrainRankerResult;
  occurredAt: string;
};

export type RecordBrainDevelopmentEventInput = {
  scope: BrainScope;
  kind: BrainDevelopmentEventKind;
  explicitness: "explicit" | "implicit";
  weight: number;
  summary: string;
  occurredAt: string;
  createProjectId?: string | null | undefined;
  createSessionId?: string | null | undefined;
  optionSetId?: string | null | undefined;
  artifactId?: string | null | undefined;
  exportId?: string | null | undefined;
  memoryNodeIds?: string[] | undefined;
  sourceReferenceIds?: string[] | undefined;
  payload?: Record<string, unknown> | undefined;
};

export type BrainRankerRecorder = {
  recordCreateRankerRun(input: RecordBrainRankerRunInput): Promise<void>;
  recordDevelopmentEvent(input: RecordBrainDevelopmentEventInput): Promise<void>;
};

let defaultBrainRankerRecorderCache: BrainRankerRecorder | null = null;
let defaultBrainRankerRecorderCacheKey: string | null = null;

export function resolveDefaultBrainRankerRecorder(env: Record<string, string | undefined> = process.env): BrainRankerRecorder | null {
  const databaseUrl = env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    return null;
  }

  const cacheKey = `db:${databaseUrl}`;
  if (defaultBrainRankerRecorderCache && defaultBrainRankerRecorderCacheKey === cacheKey) {
    return defaultBrainRankerRecorderCache;
  }

  defaultBrainRankerRecorderCache = createDbBrainRankerRecorder(createPennyDb(databaseUrl));
  defaultBrainRankerRecorderCacheKey = cacheKey;

  return defaultBrainRankerRecorderCache;
}

export function createDbBrainRankerRecorder(db: PennyDatabase): BrainRankerRecorder {
  return {
    async recordCreateRankerRun(input) {
      const rawIdeaHash = hashText(input.rawIdea);
      const runId = stableId("brain-ranker-run", scopeKey(input.scope), input.createProjectId, input.createSessionId, input.optionSetId, rawIdeaHash);
      const candidateIds = input.result.rankedCandidates.map((candidate) => stableId("brain-ranked-candidate", runId, candidate.id));
      const eventIds = input.result.developmentEvents.map((event) => stableId("brain-development-event", runId, event.id));
      const createdAt = new Date(input.occurredAt);

      await db.transaction(async (tx) => {
        await tx
          .insert(brainRankerRuns)
          .values({
            ...input.scope,
            id: runId,
            createProjectId: input.createProjectId,
            createSessionId: input.createSessionId,
            optionSetId: input.optionSetId,
            rawIdeaHash,
            contextLight: input.result.contextLight,
            nextBestMove: input.result.nextBestMove,
            rankedCandidateIds: candidateIds,
            highValueMemoryNodeIds: input.result.highValueMemories.map((memory) => memory.id),
            clusters: input.result.clusters,
            developmentEventIds: eventIds,
            createdAt,
          })
          .onConflictDoNothing();

        if (input.result.rankedCandidates.length) {
          await tx
            .insert(brainRankedCandidates)
            .values(
              input.result.rankedCandidates.map((candidate, index) => ({
                ...input.scope,
                id: candidateIds[index] ?? stableId("brain-ranked-candidate", runId, candidate.lens, index),
                rankerRunId: runId,
                lens: candidate.lens,
                title: candidate.title,
                topReason: candidate.topReason,
                grounding: candidate.grounding,
                contextLabel: candidate.contextLabel,
                memoryClass: candidate.memoryClass,
                memoryCount: candidate.memoryCount,
                sourceCount: candidate.sourceCount,
                reasons: candidate.reasons,
                uncertainty: candidate.uncertainty,
                memoryRefs: candidate.memoryRefs,
                sourceReferences: candidate.sourceReferences,
                nextBestMove: candidate.nextBestMove,
                createdAt,
              })),
            )
            .onConflictDoNothing();
        }

        if (input.result.developmentEvents.length) {
          await tx
            .insert(brainDevelopmentEvents)
            .values(
              input.result.developmentEvents.map((event, index) => ({
                ...input.scope,
                id: eventIds[index] ?? stableId("brain-development-event", runId, event.kind, index),
                kind: event.kind,
                explicitness: event.explicitness,
                weight: weightToDb(event.weight),
                createProjectId: input.createProjectId,
                createSessionId: input.createSessionId,
                optionSetId: input.optionSetId,
                memoryNodeIds: event.memoryNodeIds,
                sourceReferenceIds: event.sourceReferenceIds,
                payload: { rankerRunId: runId },
                summary: event.summary,
                occurredAt: new Date(event.occurredAt),
                createdAt,
              })),
            )
            .onConflictDoNothing();
        }
      });
    },

    async recordDevelopmentEvent(input) {
      await db
        .insert(brainDevelopmentEvents)
        .values({
          ...input.scope,
          id: stableId(
            "brain-development-event",
            scopeKey(input.scope),
            input.kind,
            input.createProjectId,
            input.createSessionId,
            input.optionSetId,
            input.artifactId,
            input.exportId,
            input.summary,
            input.occurredAt,
          ),
          kind: input.kind,
          explicitness: input.explicitness,
          weight: weightToDb(input.weight),
          createProjectId: input.createProjectId ?? null,
          createSessionId: input.createSessionId ?? null,
          optionSetId: input.optionSetId ?? null,
          artifactId: input.artifactId ?? null,
          exportId: input.exportId ?? null,
          memoryNodeIds: input.memoryNodeIds ?? [],
          sourceReferenceIds: input.sourceReferenceIds ?? [],
          payload: input.payload ?? {},
          summary: input.summary,
          occurredAt: new Date(input.occurredAt),
          createdAt: new Date(input.occurredAt),
        })
        .onConflictDoNothing();
    },
  };
}

function weightToDb(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 100)));
}

function scopeKey(scope: BrainScope): string {
  return [scope.userId ?? "anon-user", scope.workspaceId ?? "anon-workspace", scope.projectId ?? "anon-project", scope.sphereId ?? "anon-sphere"].join("|");
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function stableId(prefix: string, ...parts: Array<string | number | null | undefined>): string {
  return `${prefix}-${hashText(parts.map((part) => String(part ?? "")).join("\u001f")).slice(0, 24)}`;
}
