import { randomUUID } from "node:crypto";
import { logger } from "@/lib/logger";

export type ChallengeFlowOperationKey =
  | "challenge.start"
  | "challenge.respond"
  | "challenge.projection.read";

export type ChallengeFlowStatus =
  | "received"
  | "validated"
  | "validation_failed"
  | "created"
  | "selected"
  | "written"
  | "served"
  | "failed";

export type ChallengeFlowLogFields = {
  request_id: string;
  correlation_id: string;
  user_id: string | null;
  map_id: string | null;
  claim_id: string | null;
  round_id: string | null;
  provider: string | null;
  model: string | null;
  operation_key: ChallengeFlowOperationKey;
  status: ChallengeFlowStatus;
};

type ChallengeFlowLogLevel = "info" | "warn" | "error";

type ChallengeFlowLogExtras = Record<string, unknown> | undefined;

const REQUEST_ID_HEADER_CANDIDATES = ["x-request-id", "x-vercel-id"] as const;
const CORRELATION_ID_HEADER_CANDIDATES = ["x-correlation-id", "x-correlationid", "x-request-id", "x-vercel-id"] as const;

function firstHeader(request: Request, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = request.headers.get(key);
    if (value && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

export function createChallengeFlowLogFields(
  request: Request,
  operationKey: ChallengeFlowOperationKey,
  fields?: Partial<Omit<ChallengeFlowLogFields, "request_id" | "correlation_id" | "operation_key" | "status">> & {
    request_id?: string | null;
    correlation_id?: string | null;
    status?: ChallengeFlowStatus;
  },
): ChallengeFlowLogFields {
  const requestId = fields?.request_id ?? firstHeader(request, REQUEST_ID_HEADER_CANDIDATES) ?? randomUUID();
  const correlationId = fields?.correlation_id ?? firstHeader(request, CORRELATION_ID_HEADER_CANDIDATES) ?? requestId;

  return {
    request_id: requestId,
    correlation_id: correlationId,
    user_id: fields?.user_id ?? null,
    map_id: fields?.map_id ?? null,
    claim_id: fields?.claim_id ?? null,
    round_id: fields?.round_id ?? null,
    provider: fields?.provider ?? null,
    model: fields?.model ?? null,
    operation_key: operationKey,
    status: fields?.status ?? "received",
  };
}

export function withChallengeFlowLogFields(
  fields: ChallengeFlowLogFields,
  overrides: Partial<Omit<ChallengeFlowLogFields, "request_id" | "correlation_id">>,
): ChallengeFlowLogFields {
  return {
    ...fields,
    ...overrides,
    request_id: fields.request_id,
    correlation_id: fields.correlation_id,
    operation_key: overrides.operation_key ?? fields.operation_key,
  };
}

export function logChallengeFlow(
  level: ChallengeFlowLogLevel,
  message: string,
  fields: ChallengeFlowLogFields,
  extras?: ChallengeFlowLogExtras,
) {
  logger[level](message, {
    userId: fields.user_id ?? undefined,
    featureId: "challenge-flow",
    data: {
      ...fields,
      ...(extras ?? {}),
    },
  });
}
