import { and, eq } from "drizzle-orm";

import { movesEvents } from "../db/schema.ts";

export type ExistingMoveEvent = {
  aggregateId: string;
  payload: Record<string, unknown> | null;
};

export type FindExistingMoveEventInput = {
  userId: string;
  requestId: string;
  type: string;
};

export type IdempotencyAwareRepositoryTx = {
  findMoveEventByRequestId?: (input: FindExistingMoveEventInput) => Promise<{
    aggregateId: string;
    payload?: Record<string, unknown> | null;
  } | null>;
};

type FindExistingMoveEventDbRow = {
  aggregateId: string;
  payloadJson: unknown;
};

type FindExistingMoveEventDbTx = {
  select: (...args: unknown[]) => {
    from: (table: unknown) => {
      where: (condition: unknown) => {
        limit: (count: number) => Promise<FindExistingMoveEventDbRow[]>;
      };
    };
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasRepositoryLookup(value: unknown): value is IdempotencyAwareRepositoryTx {
  return Boolean(
    value &&
      typeof value === "object" &&
      "findMoveEventByRequestId" in value &&
      typeof (value as IdempotencyAwareRepositoryTx).findMoveEventByRequestId === "function",
  );
}

export async function findExistingMoveEvent(tx: IdempotencyAwareRepositoryTx | FindExistingMoveEventDbTx | any, input: FindExistingMoveEventInput): Promise<ExistingMoveEvent | null> {
  if (hasRepositoryLookup(tx)) {
    const existingEvent = (await tx.findMoveEventByRequestId?.(input)) ?? null;

    if (!existingEvent) {
      return null;
    }

    return {
      aggregateId: existingEvent.aggregateId,
      payload: existingEvent.payload ?? null,
    };
  }

  const rows = await tx
    .select({
      aggregateId: movesEvents.aggregateId,
      payloadJson: movesEvents.payloadJson,
    })
    .from(movesEvents)
    .where(and(eq(movesEvents.userId, input.userId), eq(movesEvents.requestId, input.requestId), eq(movesEvents.type, input.type)))
    .limit(1);

  const row = rows[0];

  if (!row) {
    return null;
  }

  return {
    aggregateId: row.aggregateId,
    payload: isRecord(row.payloadJson) ? row.payloadJson : null,
  };
}
