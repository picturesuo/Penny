import { z } from "zod";
import { createPennyDb, type PennyDatabase } from "../db/client.ts";
import { createBrainRepository, BrainRepositoryConflictError, BrainRepositoryNotFoundError } from "../domain/repository.ts";
import {
  ThinkingModeConflictError,
  ThinkingModeNotFoundError,
  ThinkingModeService,
  type ManualFocusInput,
  type ManualFocusResponse,
  type StartNextMoveInput,
  type StartNextMoveResponse,
  type ThinkingModeStateResponse,
  type ThinkingModeTickInput,
  type ThinkingModeTickResponse,
} from "../services/thinking-mode-service.ts";

const UuidSchema = z.string().uuid();

const TickRequestSchema = z
  .object({
    sessionId: UuidSchema,
    resume: z.boolean().optional().default(false),
    limit: z.number().int().min(1).max(20).optional(),
  })
  .strict();

const StartCandidateRequestSchema = z
  .object({
    brainId: UuidSchema,
    sessionId: UuidSchema,
  })
  .strict();

const ManualFocusRequestSchema = z
  .object({
    sessionId: UuidSchema,
    claimId: UuidSchema,
    reason: z.string().trim().min(1).max(1_000).optional(),
    previousSuggestionMoveId: UuidSchema.optional(),
  })
  .strict();

const CandidateIdSchema = z.string().trim().min(1).max(200);

export type ThinkingModeRouteService = {
  getState(brainId: string, sessionId: string): Promise<ThinkingModeStateResponse>;
  tick(input: ThinkingModeTickInput): Promise<ThinkingModeTickResponse>;
  startCandidate(input: StartNextMoveInput): Promise<StartNextMoveResponse>;
  manualFocus(input: ManualFocusInput): Promise<ManualFocusResponse>;
};

export type ThinkingModeRouteOptions = {
  service?: ThinkingModeRouteService;
  db?: PennyDatabase;
  databaseUrl?: string;
};

export async function handleThinkingModeStateRequest(
  request: Request,
  brainId: string,
  options: ThinkingModeRouteOptions = {},
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed("GET /api/brains/:brainId/autopilot/state requires the GET method.", "GET");
  }

  const brainIdResult = UuidSchema.safeParse(brainId);

  if (!brainIdResult.success) {
    return invalidRequest("Invalid brainId.", ["brainId must be a UUID."]);
  }

  const sessionId = new URL(request.url).searchParams.get("sessionId");
  const sessionIdResult = UuidSchema.safeParse(sessionId);

  if (!sessionIdResult.success) {
    return invalidRequest("Invalid sessionId.", ["sessionId query parameter must be a UUID."]);
  }

  try {
    const service = resolveService(options);

    return jsonResponse({ data: await service.getState(brainIdResult.data, sessionIdResult.data) });
  } catch (error) {
    return thinkingModeErrorResponse(error);
  }
}

export async function handleThinkingModeTickRequest(
  request: Request,
  brainId: string,
  options: ThinkingModeRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /api/brains/:brainId/autopilot/tick requires the POST method.", "POST");
  }

  const brainIdResult = UuidSchema.safeParse(brainId);

  if (!brainIdResult.success) {
    return invalidRequest("Invalid brainId.", ["brainId must be a UUID."]);
  }

  const parsed = await parseJsonRequest(request, TickRequestSchema);

  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const service = resolveService(options);
    const input: ThinkingModeTickInput = {
      brainId: brainIdResult.data,
      sessionId: parsed.data.sessionId,
      resume: parsed.data.resume,
    };

    if (parsed.data.limit !== undefined) {
      input.limit = parsed.data.limit;
    }

    return jsonResponse({ data: await service.tick(input) }, 201);
  } catch (error) {
    return thinkingModeErrorResponse(error);
  }
}

export async function handleStartNextMoveCandidateRequest(
  request: Request,
  candidateId: string,
  options: ThinkingModeRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /api/next-move-candidates/:candidateId/start requires the POST method.", "POST");
  }

  const candidateIdResult = CandidateIdSchema.safeParse(candidateId);

  if (!candidateIdResult.success) {
    return invalidRequest("Invalid candidateId.", ["candidateId path parameter is required."]);
  }

  const parsed = await parseJsonRequest(request, StartCandidateRequestSchema);

  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const service = resolveService(options);

    return jsonResponse(
      {
        data: await service.startCandidate({
          brainId: parsed.data.brainId,
          sessionId: parsed.data.sessionId,
          candidateId: candidateIdResult.data,
        }),
      },
      201,
    );
  } catch (error) {
    return thinkingModeErrorResponse(error);
  }
}

export async function handleManualFocusRequest(
  request: Request,
  brainId: string,
  options: ThinkingModeRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /api/brains/:brainId/focus/manual requires the POST method.", "POST");
  }

  const brainIdResult = UuidSchema.safeParse(brainId);

  if (!brainIdResult.success) {
    return invalidRequest("Invalid brainId.", ["brainId must be a UUID."]);
  }

  const parsed = await parseJsonRequest(request, ManualFocusRequestSchema);

  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const service = resolveService(options);

    const input: ManualFocusInput = {
      brainId: brainIdResult.data,
      sessionId: parsed.data.sessionId,
      claimId: parsed.data.claimId,
    };

    if (parsed.data.reason !== undefined) {
      input.reason = parsed.data.reason;
    }

    if (parsed.data.previousSuggestionMoveId !== undefined) {
      input.previousSuggestionMoveId = parsed.data.previousSuggestionMoveId;
    }

    return jsonResponse({ data: await service.manualFocus(input) }, 201);
  } catch (error) {
    return thinkingModeErrorResponse(error);
  }
}

async function parseJsonRequest<Schema extends z.ZodType>(
  request: Request,
  schema: Schema,
): Promise<{ ok: true; data: z.infer<Schema> } | { ok: false; response: Response }> {
  const bodyResult = await readJsonBody(request);

  if (!bodyResult.ok) {
    return {
      ok: false,
      response: invalidRequest("Request body must be valid JSON.", [bodyResult.message]),
    };
  }

  const parsed = schema.safeParse(bodyResult.body);

  if (!parsed.success) {
    return {
      ok: false,
      response: invalidRequest("Request body failed validation.", flattenIssues(parsed.error)),
    };
  }

  return {
    ok: true,
    data: parsed.data,
  };
}

async function readJsonBody(request: Request): Promise<{ ok: true; body: unknown } | { ok: false; message: string }> {
  const text = await request.text();

  if (!text.trim()) {
    return { ok: true, body: {} };
  }

  try {
    return {
      ok: true,
      body: JSON.parse(text) as unknown,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function resolveService(options: ThinkingModeRouteOptions): ThinkingModeRouteService {
  if (options.service) {
    return options.service;
  }

  const db = options.db ?? createPennyDb(options.databaseUrl);

  return new ThinkingModeService(createBrainRepository(db));
}

function thinkingModeErrorResponse(error: unknown): Response {
  if (error instanceof ThinkingModeNotFoundError || error instanceof BrainRepositoryNotFoundError) {
    return jsonResponse(
      {
        error: {
          code: "thinking_mode_not_found",
          message: error.message,
        },
      },
      404,
    );
  }

  if (error instanceof ThinkingModeConflictError || error instanceof BrainRepositoryConflictError) {
    return jsonResponse(
      {
        error: {
          code: "thinking_mode_conflict",
          message: error.message,
        },
      },
      409,
    );
  }

  return jsonResponse(
    {
      error: {
        code: "thinking_mode_error",
        message: error instanceof Error ? error.message : String(error),
      },
    },
    500,
  );
}

function methodNotAllowed(message: string, allow: string): Response {
  return jsonResponse(
    {
      error: {
        code: "method_not_allowed",
        message,
      },
    },
    405,
    { allow },
  );
}

function invalidRequest(message: string, issues: ReadonlyArray<string>): Response {
  return jsonResponse(
    {
      error: {
        code: "invalid_request",
        message,
        issues,
      },
    },
    400,
  );
}

function jsonResponse(payload: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

function flattenIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`);
}
