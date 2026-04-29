import { and, desc, eq } from "drizzle-orm";
import type { PennyDatabase } from "./db/client.ts";
import { derivedEffects, shapes } from "./db/schema.ts";
import { compiledShapesFromRows, type CompiledShape } from "./shapes.ts";

type LensTransaction = Parameters<Parameters<PennyDatabase["transaction"]>[0]>[0];

export type LensSnapshot = {
  shapes: Array<{
    id: string | null;
    key: string;
    label: string;
    description: string;
    confidence: number;
    status: CompiledShape["status"];
    supportingMoveIds: string[];
  }>;
  pendingEffects: Array<{
    id: string;
    kind: (typeof derivedEffects.$inferSelect)["kind"];
    title: string;
    summary: string;
    payload: unknown;
  }>;
};

export function emptyLensSnapshot(): LensSnapshot {
  return {
    shapes: [],
    pendingEffects: [],
  };
}

export async function loadLensSnapshot(tx: LensTransaction, sessionId: string): Promise<LensSnapshot> {
  const [shapeRows, pendingEffectRows] = await Promise.all([
    tx.select().from(shapes).where(eq(shapes.sessionId, sessionId)).orderBy(desc(shapes.createdAt)),
    tx
      .select()
      .from(derivedEffects)
      .where(and(eq(derivedEffects.sessionId, sessionId), eq(derivedEffects.status, "pending_review")))
      .orderBy(desc(derivedEffects.createdAt))
      .limit(6),
  ]);

  return {
    shapes: compiledShapesFromRows(shapeRows).map((shape) => ({
      id: shape.id,
      key: shape.key,
      label: shape.label,
      description: shape.description,
      confidence: shape.confidence,
      status: shape.status,
      supportingMoveIds: shape.supportingMoveIds,
    })),
    pendingEffects: pendingEffectRows.map((effect) => ({
      id: effect.id,
      kind: effect.kind,
      title: effect.title,
      summary: effect.summary,
      payload: effect.payload,
    })),
  };
}

export function formatLensSnapshot(snapshot: LensSnapshot | undefined): string {
  return JSON.stringify(snapshot ?? emptyLensSnapshot(), null, 2);
}
