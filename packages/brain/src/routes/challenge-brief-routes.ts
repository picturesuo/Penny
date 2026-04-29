import { z } from "zod";
import { createPennyDb, type PennyDatabase } from "../db/client.ts";
import {
  ChallengeBriefConflictError,
  ChallengeBriefNotFoundError,
  ChallengeBriefService,
  type ChallengeBriefResponse,
} from "../services/challenge-brief-service.ts";

const UuidSchema = z.string().uuid();
const EmptyBodySchema = z.object({}).strict();

export type ChallengeBriefRouteService = {
  generateChallengeBrief(sessionId: string): Promise<ChallengeBriefResponse>;
};

export type ChallengeBriefRouteOptions = {
  service?: ChallengeBriefRouteService;
  db?: PennyDatabase;
  databaseUrl?: string;
};

export async function handleChallengeBriefRequest(
  request: Request,
  sessionId: string,
  options: ChallengeBriefRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /api/sessions/:sessionId/challenge-brief requires the POST method.", "POST");
  }

  const sessionIdResult = UuidSchema.safeParse(sessionId);

  if (!sessionIdResult.success) {
    return invalidRequest("Invalid sessionId.", ["sessionId path parameter must be a UUID."]);
  }

  const parsed = await parseJsonRequest(request, EmptyBodySchema);

  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const service = resolveService(options);

    return jsonResponse({ data: await service.generateChallengeBrief(sessionIdResult.data) }, 201);
  } catch (error) {
    return challengeBriefErrorResponse(error);
  }
}

async function parseJsonRequest<Schema extends z.ZodType>(
  request: Request,
  schema: Schema,
): Promise<{ ok: true; data: z.infer<Schema> } | { ok: false; response: Response }> {
  const text = await request.text();
  let body: unknown = {};

  if (text.trim()) {
    try {
      body = JSON.parse(text) as unknown;
    } catch (error) {
      return {
        ok: false,
        response: invalidRequest("Request body must be valid JSON.", [
          error instanceof Error ? error.message : String(error),
        ]),
      };
    }
  }

  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return {
      ok: false,
      response: invalidRequest(
        "Request body failed validation.",
        parsed.error.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`),
      ),
    };
  }

  return {
    ok: true,
    data: parsed.data,
  };
}

function resolveService(options: ChallengeBriefRouteOptions): ChallengeBriefRouteService {
  if (options.service) {
    return options.service;
  }

  const db = options.db ?? createPennyDb(options.databaseUrl);

  return new ChallengeBriefService(db);
}

function challengeBriefErrorResponse(error: unknown): Response {
  if (error instanceof ChallengeBriefNotFoundError) {
    return jsonResponse(
      {
        error: {
          code: "challenge_brief_not_found",
          message: error.message,
        },
      },
      404,
    );
  }

  if (error instanceof ChallengeBriefConflictError) {
    return jsonResponse(
      {
        error: {
          code: "challenge_brief_conflict",
          message: error.message,
        },
      },
      409,
    );
  }

  return jsonResponse(
    {
      error: {
        code: "challenge_brief_error",
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
