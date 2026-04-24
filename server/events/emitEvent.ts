import { movesEvents } from "../db/schema.ts";
import { getDb } from "../db/client.ts";

const EVENT_TYPES = [
  "map.created",
  "claim.created",
  "claim.updated",
  "workspace.selection.changed",
  "challenge.round.started",
  "challenge.critique.requested",
  "challenge.critique.generated",
  "challenge.critique.failed",
  "challenge.response.recorded",
] as const;

type EventType = (typeof EVENT_TYPES)[number];

type EmitEventRecord = {
  userId: string;
  aggregateType: string;
  aggregateId: string;
  type: EventType;
  payloadJson: Record<string, unknown>;
  requestId: string;
};

type InsertableDb = {
  insert: (table: unknown) => {
    values: (input: EmitEventRecord) => Promise<unknown> | unknown;
  };
};

export type EmitEventInput = {
  userId: string;
  aggregateType: string;
  aggregateId: string;
  type: EventType;
  payloadJson: Record<string, unknown>;
  requestId: string;
  db?: InsertableDb;
};

export class EmitEventValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmitEventValidationError";
  }
}

function isEventType(value: string): value is EventType {
  return EVENT_TYPES.includes(value as EventType);
}

function assertNonEmptyString(value: string, fieldName: string) {
  if (!value.trim()) {
    throw new EmitEventValidationError(`${fieldName} is required.`);
  }
}

function validateInput(input: EmitEventInput) {
  assertNonEmptyString(input.type, "type");
  assertNonEmptyString(input.userId, "userId");
  assertNonEmptyString(input.aggregateType, "aggregateType");
  assertNonEmptyString(input.aggregateId, "aggregateId");
  assertNonEmptyString(input.requestId, "requestId");

  if (!isEventType(input.type)) {
    throw new EmitEventValidationError(
      `Invalid event type "${input.type}". Expected one of: ${EVENT_TYPES.join(", ")}.`,
    );
  }

  if (!input.payloadJson || typeof input.payloadJson !== "object" || Array.isArray(input.payloadJson)) {
    throw new EmitEventValidationError("payloadJson must be an object.");
  }
}

export async function emitEvent(input: EmitEventInput) {
  validateInput(input);

  const db = input.db ?? getDb();

  const record: EmitEventRecord = {
    userId: input.userId,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    type: input.type,
    payloadJson: input.payloadJson,
    requestId: input.requestId,
  };

  await db.insert(movesEvents).values(record);
}

export { EVENT_TYPES };
