import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { type PennyDatabase } from "./db/client.ts";
import { commandIdempotencyKeys } from "./db/schema.ts";
import { scopeValues, type BrainScope, type BrainScopeInput } from "./scope.ts";

export const CommandIdempotencyKeySchema = z.string().trim().min(1).max(200);

export const CommandIdempotencyRequestFields = {
  idempotencyKey: CommandIdempotencyKeySchema.optional(),
  commandId: CommandIdempotencyKeySchema.optional(),
  customId: CommandIdempotencyKeySchema.optional(),
} satisfies z.ZodRawShape;

export type CommandIdempotencyStatus = (typeof commandIdempotencyKeys.$inferSelect)["status"];

export type CommandIdempotencyRecord = {
  id: string;
  route: string;
  key: string;
  scopeHash: string;
  requestHash: string;
  status: CommandIdempotencyStatus;
  responseStatus: number | null;
  responseBody: unknown;
};

export type CommandIdempotencyReservation =
  | { kind: "reserved"; id: string }
  | { kind: "existing"; record: CommandIdempotencyRecord };

export type CommandIdempotencyStore = {
  reserve(input: {
    route: string;
    key: string;
    scope: BrainScope;
    scopeHash: string;
    requestHash: string;
  }): Promise<CommandIdempotencyReservation>;
  complete(
    id: string,
    input: {
      status: Exclude<CommandIdempotencyStatus, "running">;
      responseStatus: number;
      responseBody: unknown;
      error: unknown;
    },
  ): Promise<void>;
};

export type CommandIdempotencyInput = {
  route: string;
  key: string | null;
  requestHash: string;
  scope?: BrainScopeInput | undefined;
  store?: CommandIdempotencyStore | undefined;
  execute: () => Promise<Response>;
};

type CommandIdempotencyBody = {
  idempotencyKey?: string | undefined;
  commandId?: string | undefined;
  customId?: string | undefined;
};

const commandKeyHeaders = ["idempotency-key", "x-idempotency-key", "x-penny-idempotency-key"];
const commandKeyBodyFields = ["idempotencyKey", "commandId", "customId"] as const;

export async function runIdempotentCommand(input: CommandIdempotencyInput): Promise<Response> {
  if (!input.key) {
    return input.execute();
  }

  if (!input.store) {
    return jsonResponse(
      {
        error: {
          code: "idempotency_store_required",
          message: "A Penny database is required when an idempotency key is provided.",
        },
      },
      500,
    );
  }

  const scope = scopeValues(input.scope);
  const scopeHash = commandScopeHash(scope);
  const reservation = await input.store.reserve({
    route: input.route,
    key: input.key,
    scope,
    scopeHash,
    requestHash: input.requestHash,
  });

  if (reservation.kind === "existing") {
    return replayCommandReservation(reservation.record, input.requestHash);
  }

  try {
    const response = await input.execute();
    const materialized = await materializeResponse(response);
    const status = materialized.status < 400 ? "succeeded" : "failed";

    await input.store.complete(reservation.id, {
      status,
      responseStatus: materialized.status,
      responseBody: materialized.body,
      error: status === "failed" ? materialized.body : null,
    });

    return materializedResponse(materialized, "created");
  } catch (error) {
    const body = {
      error: {
        code: "command_failed",
        message: formatErrorMessage(error),
      },
    };

    await input.store.complete(reservation.id, {
      status: "failed",
      responseStatus: 500,
      responseBody: body,
      error: body.error,
    });

    return jsonResponse(body, 500, { "x-penny-idempotency": "created" });
  }
}

export function createDbCommandIdempotencyStore(db: PennyDatabase): CommandIdempotencyStore {
  return {
    async reserve(input) {
      const [reserved] = await db
        .insert(commandIdempotencyKeys)
        .values({
          ...input.scope,
          route: input.route,
          key: input.key,
          scopeHash: input.scopeHash,
          requestHash: input.requestHash,
          status: "running",
        })
        .onConflictDoNothing({
          target: [commandIdempotencyKeys.route, commandIdempotencyKeys.scopeHash, commandIdempotencyKeys.key],
        })
        .returning();

      if (reserved) {
        return {
          kind: "reserved",
          id: reserved.id,
        };
      }

      const [existing] = await db
        .select()
        .from(commandIdempotencyKeys)
        .where(
          and(
            eq(commandIdempotencyKeys.route, input.route),
            eq(commandIdempotencyKeys.scopeHash, input.scopeHash),
            eq(commandIdempotencyKeys.key, input.key),
          ),
        )
        .limit(1);

      if (!existing) {
        return {
          kind: "existing",
          record: {
            id: randomUUID(),
            route: input.route,
            key: input.key,
            scopeHash: input.scopeHash,
            requestHash: input.requestHash,
            status: "running",
            responseStatus: null,
            responseBody: null,
          },
        };
      }

      return {
        kind: "existing",
        record: recordSlice(existing),
      };
    },
    async complete(id, input) {
      await db
        .update(commandIdempotencyKeys)
        .set({
          status: input.status,
          responseStatus: input.responseStatus,
          responseBody: input.responseBody,
          error: input.error,
          completedAt: new Date(),
        })
        .where(eq(commandIdempotencyKeys.id, id));
    },
  };
}

export function createMemoryCommandIdempotencyStore(): CommandIdempotencyStore {
  const records = new Map<string, CommandIdempotencyRecord>();

  return {
    async reserve(input) {
      const recordKey = memoryRecordKey(input.route, input.scopeHash, input.key);
      const existing = records.get(recordKey);

      if (existing) {
        return {
          kind: "existing",
          record: existing,
        };
      }

      const id = randomUUID();
      records.set(recordKey, {
        id,
        route: input.route,
        key: input.key,
        scopeHash: input.scopeHash,
        requestHash: input.requestHash,
        status: "running",
        responseStatus: null,
        responseBody: null,
      });

      return {
        kind: "reserved",
        id,
      };
    },
    async complete(id, input) {
      for (const [key, record] of records) {
        if (record.id !== id) {
          continue;
        }

        records.set(key, {
          ...record,
          status: input.status,
          responseStatus: input.responseStatus,
          responseBody: input.responseBody,
        });
        return;
      }
    },
  };
}

export function resolveCommandIdempotencyKey(
  request: Request,
  body: CommandIdempotencyBody,
): { ok: true; key: string | null } | { ok: false; response: Response } {
  const candidates = [
    ...commandKeyHeaders.map((name) => request.headers.get(name)?.trim()).filter((value): value is string => Boolean(value)),
    ...commandKeyBodyFields.map((field) => body[field]?.trim()).filter((value): value is string => Boolean(value)),
  ];
  const uniqueCandidates = [...new Set(candidates)];

  if (uniqueCandidates.length === 0) {
    return {
      ok: true,
      key: null,
    };
  }

  if (uniqueCandidates.length > 1) {
    return {
      ok: false,
      response: jsonResponse(
        {
          error: {
            code: "conflicting_idempotency_keys",
            message: "Provide only one idempotency key value for a command.",
          },
        },
        400,
      ),
    };
  }

  const parsed = CommandIdempotencyKeySchema.safeParse(uniqueCandidates[0]);

  if (!parsed.success) {
    return {
      ok: false,
      response: jsonResponse(
        {
          error: {
            code: "invalid_idempotency_key",
            message: "Idempotency keys must be 1 to 200 characters.",
          },
        },
        400,
      ),
    };
  }

  return {
    ok: true,
    key: parsed.data,
  };
}

export function commandRequestHash(route: string, body: unknown): string {
  return hashStableJson({
    route,
    body: stripCommandIdempotencyFields(body),
  });
}

export function commandScopeHash(scope: BrainScopeInput | null | undefined): string {
  return hashStableJson(scopeValues(scope));
}

export function commandScopeFromHeaders(request: Request): BrainScope {
  return scopeValues({
    userId: firstPresentHeader(request, ["x-user-id", "x-penny-user-id"]) ?? null,
    workspaceId: firstPresentHeader(request, ["x-workspace-id", "x-penny-workspace-id"]) ?? null,
    projectId: firstPresentHeader(request, ["x-project-id", "x-penny-project-id"]) ?? null,
    sphereId: firstPresentHeader(request, ["x-sphere-id", "x-penny-sphere-id"]) ?? null,
  });
}

export function stripCommandIdempotencyFields<T>(body: T): Omit<T, keyof CommandIdempotencyBody> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return body as Omit<T, keyof CommandIdempotencyBody>;
  }

  const { idempotencyKey: _idempotencyKey, commandId: _commandId, customId: _customId, ...commandBody } = body as T &
    CommandIdempotencyBody;

  return commandBody;
}

function replayCommandReservation(record: CommandIdempotencyRecord, requestHash: string): Response {
  if (record.requestHash !== requestHash) {
    return jsonResponse(
      {
        error: {
          code: "idempotency_key_conflict",
          message: "This idempotency key was already used for a different command request.",
        },
      },
      409,
      { "x-penny-idempotency": "conflict" },
    );
  }

  if (record.status === "running") {
    return jsonResponse(
      {
        error: {
          code: "idempotency_key_in_progress",
          message: "This idempotency key is already running for the same command.",
        },
      },
      409,
      { "x-penny-idempotency": "running" },
    );
  }

  if (record.responseStatus && record.responseBody !== null && record.responseBody !== undefined) {
    return jsonResponse(record.responseBody, record.responseStatus, { "x-penny-idempotency": "replayed" });
  }

  return jsonResponse(
    {
      error: {
        code: "idempotency_response_unavailable",
        message: "This idempotency key has no stored command response.",
      },
    },
    409,
    { "x-penny-idempotency": "unavailable" },
  );
}

function recordSlice(row: typeof commandIdempotencyKeys.$inferSelect): CommandIdempotencyRecord {
  return {
    id: row.id,
    route: row.route,
    key: row.key,
    scopeHash: row.scopeHash,
    requestHash: row.requestHash,
    status: row.status,
    responseStatus: row.responseStatus,
    responseBody: row.responseBody,
  };
}

async function materializeResponse(response: Response): Promise<{
  status: number;
  headers: Headers;
  body: unknown;
}> {
  const text = await response.text();
  let body: unknown = null;

  if (text.trim()) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = { raw: text };
    }
  }

  return {
    status: response.status,
    headers: response.headers,
    body,
  };
}

function materializedResponse(
  response: {
    status: number;
    headers: Headers;
    body: unknown;
  },
  idempotencyStatus: "created" | "replayed",
): Response {
  const headers = new Headers(response.headers);
  headers.set("x-penny-idempotency", idempotencyStatus);

  return new Response(JSON.stringify(response.body), {
    status: response.status,
    headers,
  });
}

function jsonResponse(payload: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

function hashStableJson(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);

  return `{${entries.join(",")}}`;
}

function firstPresentHeader(request: Request, names: string[]): string | undefined {
  for (const name of names) {
    const value = request.headers.get(name)?.trim();

    if (value) {
      return value;
    }
  }

  return undefined;
}

function memoryRecordKey(route: string, scopeHash: string, key: string): string {
  return [route, scopeHash, key].join("\u0000");
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return String(error);
}
