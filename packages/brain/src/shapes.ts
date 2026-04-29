import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { PennyDatabase } from "./db/client.ts";
import { shapeStatusEnum, shapes } from "./db/schema.ts";
import { scopeValues, type BrainScopeInput } from "./scope.ts";

export type ShapeStatus = (typeof shapeStatusEnum.enumValues)[number];
export type PersistedShape = typeof shapes.$inferSelect;

export type ShapeMove = {
  moveId: string;
  kind: string;
  summary: string;
  createdAt: string;
};

export type InferredShape = {
  key: string;
  label: string;
  description: string;
  confidence: number;
  supportingMoveIds: string[];
  status: "candidate";
};

export type CompiledShape = {
  id: string | null;
  key: string;
  label: string;
  description: string;
  confidence: number;
  supportingMoveIds: string[];
  status: ShapeStatus;
  version: number | null;
  sourceMoveId: string | null;
};

type ShapeTransaction = Parameters<Parameters<PennyDatabase["transaction"]>[0]>[0];

const ShapeDraftSchema = z
  .object({
    key: z.string().trim().min(1).max(80),
    label: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(500),
    confidence: z.number().int().min(0).max(100),
    supportingMoveIds: z.array(z.string().uuid()).min(1).max(24),
    status: z.literal("candidate"),
  })
  .strict();

const ReviewShapeStatusSchema = z.enum(["confirmed", "rejected"]);

export class ShapeNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShapeNotFoundError";
  }
}

export class ShapeValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super("Shape failed validation.");
    this.name = "ShapeValidationError";
    this.issues = issues;
  }
}

export async function persistInferredShapes(
  tx: ShapeTransaction,
  input: { sessionId: string; scope?: BrainScopeInput; moves: ShapeMove[] },
): Promise<PersistedShape[]> {
  const inferred = inferShapesFromMoves(input.moves);
  const existingRows = await tx
    .select()
    .from(shapes)
    .where(eq(shapes.sessionId, input.sessionId))
    .orderBy(desc(shapes.createdAt));
  const allRows: PersistedShape[] = [...existingRows];

  for (const shape of inferred) {
    const sourceMoveId = shape.supportingMoveIds.at(-1);

    if (!sourceMoveId || hasSameActiveShape(allRows, shape)) {
      continue;
    }

    const [inserted] = await tx
      .insert(shapes)
      .values({
        ...scopeValues(input.scope),
        sessionId: input.sessionId,
        sourceMoveId,
        key: shape.key,
        status: shape.status,
        version: nextVersion(allRows, shape.key),
        label: shape.label,
        description: shape.description,
        confidence: shape.confidence,
        supportingMoveIds: shape.supportingMoveIds,
        payload: {
          inferredFrom: "recent_moves",
          evidenceMoveIds: shape.supportingMoveIds,
        },
      })
      .returning();

    if (inserted) {
      allRows.unshift(inserted);
    }
  }

  return activeShapeRows(allRows);
}

export async function reviewShape(
  db: PennyDatabase,
  input: { shapeId: string; status: "confirmed" | "rejected" },
): Promise<PersistedShape> {
  const status = ReviewShapeStatusSchema.parse(input.status);
  const [shape] = await db
    .update(shapes)
    .set({
      status,
      reviewedAt: new Date(),
    })
    .where(eq(shapes.id, input.shapeId))
    .returning();

  if (!shape) {
    throw new ShapeNotFoundError("Shape was not found.");
  }

  return shape;
}

export function compiledShapesFromRows(rows: PersistedShape[]): CompiledShape[] {
  return activeShapeRows(rows).map(shapeSlice);
}

export function inferredShapeSlices(moves: ShapeMove[]): CompiledShape[] {
  return inferShapesFromMoves(moves).map((shape) => ({
    id: null,
    key: shape.key,
    label: shape.label,
    description: shape.description,
    confidence: shape.confidence,
    supportingMoveIds: shape.supportingMoveIds,
    status: shape.status,
    version: null,
    sourceMoveId: null,
  }));
}

export function inferShapesFromMoves(moves: ShapeMove[]): InferredShape[] {
  const recentMoves = moves
    .filter((move) => move.moveId && move.kind)
    .slice(-12);

  if (recentMoves.length === 0) {
    return [];
  }

  const candidates = [
    inferInitialDecompositionShape(recentMoves),
    inferAssumptionReviewShape(recentMoves),
    inferChallengeResponseShape(recentMoves),
    inferConceptGroundingShape(recentMoves),
    inferEvidenceCheckingShape(recentMoves),
    inferArtifactCompilationShape(recentMoves),
  ].filter((shape): shape is InferredShape => Boolean(shape));

  return validateShapes(candidates).sort(shapeSort).slice(0, 3);
}

function inferInitialDecompositionShape(moves: ShapeMove[]): InferredShape | null {
  const supporting = moves.filter((move) =>
    ["seed_claim_created", "assumptions_extracted", "first_challenge_suggested"].includes(move.kind),
  );

  if (supporting.length < 2) {
    return null;
  }

  const kinds = new Set(supporting.map((move) => move.kind));
  const confidence = boundedConfidence(52 + supporting.length * 7 + (kinds.size >= 3 ? 8 : 0));

  return {
    key: "initial_decomposition",
    label: "Initial decomposition",
    description: "Recent moves split the raw idea into a seed, load-bearing assumptions, and a first challenge.",
    confidence,
    supportingMoveIds: moveIds(supporting),
    status: "candidate",
  };
}

function inferAssumptionReviewShape(moves: ShapeMove[]): InferredShape | null {
  const supporting = moves.filter((move) =>
    ["assumption_confirmed", "assumption_rejected", "assumption_refined"].includes(move.kind),
  );

  if (supporting.length === 0) {
    return null;
  }

  const kinds = new Set(supporting.map((move) => move.kind));
  const confidence = boundedConfidence(54 + supporting.length * 8 + (kinds.size > 1 ? 6 : 0));

  return {
    key: "assumption_review_loop",
    label: "Assumption review loop",
    description: "Recent moves are improving the idea by confirming, rejecting, or refining load-bearing assumptions.",
    confidence,
    supportingMoveIds: moveIds(supporting),
    status: "candidate",
  };
}

function inferChallengeResponseShape(moves: ShapeMove[]): InferredShape | null {
  const supporting = moves.filter((move) =>
    ["challenge_issued", "user_defended", "claim_revised", "critique_absorbed"].includes(move.kind),
  );

  if (supporting.length === 0) {
    return null;
  }

  const hasChallenge = supporting.some((move) => move.kind === "challenge_issued");
  const hasResponse = supporting.some((move) => ["user_defended", "claim_revised", "critique_absorbed"].includes(move.kind));
  const confidence = boundedConfidence(52 + supporting.length * 8 + (hasChallenge && hasResponse ? 10 : 0));

  return {
    key: "challenge_response_loop",
    label: "Challenge response loop",
    description: "Recent moves are pressure-testing claims through challenge and explicit response.",
    confidence,
    supportingMoveIds: moveIds(supporting),
    status: "candidate",
  };
}

function inferConceptGroundingShape(moves: ShapeMove[]): InferredShape | null {
  const supporting = moves.filter((move) => move.kind === "learning_triggered");

  if (supporting.length === 0) {
    return null;
  }

  return {
    key: "concept_grounding",
    label: "Concept grounding",
    description: "Recent moves use Makes Cents to clarify a concept before continuing the map.",
    confidence: boundedConfidence(50 + supporting.length * 10),
    supportingMoveIds: moveIds(supporting),
    status: "candidate",
  };
}

function inferEvidenceCheckingShape(moves: ShapeMove[]): InferredShape | null {
  const supporting = moves.filter((move) => move.kind === "verify_run");

  if (supporting.length === 0) {
    return null;
  }

  return {
    key: "evidence_checking",
    label: "Evidence checking",
    description: "Recent moves are checking claims against evidence without changing confidence automatically.",
    confidence: boundedConfidence(52 + supporting.length * 9),
    supportingMoveIds: moveIds(supporting),
    status: "candidate",
  };
}

function inferArtifactCompilationShape(moves: ShapeMove[]): InferredShape | null {
  const supporting = moves.filter((move) => move.kind === "artifact_created");

  if (supporting.length === 0) {
    return null;
  }

  return {
    key: "artifact_compilation",
    label: "Artifact compilation",
    description: "Recent moves are turning recorded thinking history into a session-end brief.",
    confidence: boundedConfidence(50 + supporting.length * 8),
    supportingMoveIds: moveIds(supporting),
    status: "candidate",
  };
}

function validateShapes(drafts: InferredShape[]): InferredShape[] {
  const validated: InferredShape[] = [];

  for (const draft of drafts) {
    const parsed = ShapeDraftSchema.safeParse(draft);

    if (!parsed.success) {
      throw new ShapeValidationError(parsed.error.issues.map((issue) => issue.message));
    }

    validated.push(parsed.data);
  }

  return validated;
}

function hasSameActiveShape(rows: PersistedShape[], shape: InferredShape): boolean {
  return rows.some(
    (row) =>
      row.key === shape.key &&
      (row.status === "candidate" || row.status === "confirmed") &&
      sameStrings(row.supportingMoveIds, shape.supportingMoveIds),
  );
}

function activeShapeRows(rows: PersistedShape[]): PersistedShape[] {
  const latestByKey = new Map<string, PersistedShape>();

  for (const row of [...rows].sort(shapeRowSort)) {
    if (row.status === "rejected" || row.status === "superseded" || latestByKey.has(row.key)) {
      continue;
    }

    latestByKey.set(row.key, row);
  }

  return [...latestByKey.values()].sort(shapeRowSort).slice(0, 3);
}

function shapeSlice(row: PersistedShape): CompiledShape {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    description: row.description,
    confidence: row.confidence,
    supportingMoveIds: row.supportingMoveIds,
    status: row.status,
    version: row.version,
    sourceMoveId: row.sourceMoveId,
  };
}

function nextVersion(rows: PersistedShape[], key: string): number {
  return rows.filter((row) => row.key === key).reduce((max, row) => Math.max(max, row.version), 0) + 1;
}

function shapeRowSort(left: PersistedShape, right: PersistedShape): number {
  return (
    statusWeight(right.status) - statusWeight(left.status) ||
    right.confidence - left.confidence ||
    right.supportingMoveIds.length - left.supportingMoveIds.length ||
    right.version - left.version ||
    right.createdAt.getTime() - left.createdAt.getTime()
  );
}

function shapeSort(left: InferredShape, right: InferredShape): number {
  return right.confidence - left.confidence || right.supportingMoveIds.length - left.supportingMoveIds.length;
}

function statusWeight(status: ShapeStatus): number {
  if (status === "confirmed") {
    return 2;
  }

  if (status === "candidate") {
    return 1;
  }

  return 0;
}

function moveIds(moves: ShapeMove[]): string[] {
  return [...new Set(moves.map((move) => move.moveId))];
}

function boundedConfidence(value: number): number {
  return Math.max(0, Math.min(88, Math.round(value)));
}

function sameStrings(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
