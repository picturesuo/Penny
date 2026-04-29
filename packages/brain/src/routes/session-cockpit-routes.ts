import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { createPennyDb, type PennyDatabase } from "../db/client.ts";
import { artifacts, challengeRounds } from "../db/schema.ts";
import {
  type BrainRepository,
  BrainRepositoryConflictError,
  BrainRepositoryNotFoundError,
  createBrainRepository,
} from "../domain/repository.ts";
import type { EntityId } from "../domain/types.ts";
import {
  loadSessionGraph,
  SessionGraphConflictError,
  SessionGraphNotFoundError,
  type SessionGraphPayload,
} from "../session-graph-route.ts";
import {
  ThinkingModeConflictError,
  ThinkingModeNotFoundError,
  ThinkingModeService,
  type ManualFocusResponse,
  type StartNextMoveResponse,
  type ThinkingModeStateResponse,
  type ThinkingModeTickResponse,
} from "../services/thinking-mode-service.ts";

const UuidSchema = z.string().uuid();
const CandidateIdSchema = z.string().trim().min(1).max(200);
const EmptyBodySchema = z.object({}).strict();
const TickBodySchema = z
  .object({
    resume: z.boolean().optional().default(false),
    limit: z.number().int().min(1).max(20).optional(),
  })
  .strict();
const ManualFocusBodySchema = z
  .object({
    claimId: UuidSchema,
    reason: z.string().trim().min(1).max(1_000).optional(),
    previousSuggestionMoveId: UuidSchema.optional(),
  })
  .strict();

type ChallengeRoundRow = typeof challengeRounds.$inferSelect;
type ArtifactRow = typeof artifacts.$inferSelect;
type CockpitClaim = SessionGraphPayload["ideaMap"]["claims"][number];
type CockpitEdge = SessionGraphPayload["ideaMap"]["edges"][number];

export type SessionCockpitChallengeRound = {
  id: EntityId;
  sessionId: EntityId;
  status: ChallengeRoundRow["status"];
  response: ChallengeRoundRow["response"];
  targetClaimId: EntityId;
  targetClaimVersionId: EntityId;
  critiqueClaimId: EntityId;
  critiqueClaimVersionId: EntityId;
  challengeEdgeId: EntityId;
  brainRunId: EntityId;
  challengeMoveId: EntityId;
  responseMoveId: EntityId | null;
  focusCompletedMoveId: EntityId | null;
  failureType: ChallengeRoundRow["failureType"];
  strength: ChallengeRoundRow["strength"];
  critique: string;
  whyThis: string;
  whatWouldResolveIt: string;
  createdAt: string;
  respondedAt: string | null;
  updatedAt: string;
};

export type SessionCockpitActiveChallenge = SessionCockpitChallengeRound & {
  targetClaim: CockpitClaim | null;
  critiqueClaim: CockpitClaim | null;
  challengeEdge: CockpitEdge | null;
};

export type SessionCockpitArtifact = {
  id: EntityId;
  sessionId: EntityId;
  kind: ArtifactRow["kind"];
  title: string;
  summary: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type SessionCockpitPayload = {
  session: SessionGraphPayload["session"];
  sourceOfTruth: SessionGraphPayload["sourceOfTruth"];
  ideaMap: SessionGraphPayload["ideaMap"];
  graph: SessionGraphPayload["graph"];
  moves: SessionGraphPayload["moves"];
  lensSnapshot: SessionGraphPayload["lensSnapshot"];
  autopilot: ThinkingModeStateResponse;
  activeChallenge: SessionCockpitActiveChallenge | null;
  latestArtifact: SessionCockpitArtifact | null;
  meta: SessionGraphPayload["meta"] & {
    latestArtifactId: EntityId | null;
    activeChallengeId: EntityId | null;
  };
};

export type SessionAutopilotTickInput = {
  sessionId: EntityId;
  resume?: boolean;
  limit?: number;
};

export type SessionStartNextMoveInput = {
  sessionId: EntityId;
  candidateId: string;
};

export type SessionManualFocusInput = {
  sessionId: EntityId;
  claimId: EntityId;
  reason?: string | null;
  previousSuggestionMoveId?: EntityId | null;
};

export type SessionCockpitRouteService = {
  getCockpit(sessionId: EntityId): Promise<SessionCockpitPayload>;
  getAutopilotState(sessionId: EntityId): Promise<ThinkingModeStateResponse>;
  tickAutopilot(input: SessionAutopilotTickInput): Promise<ThinkingModeTickResponse>;
  startCandidate(input: SessionStartNextMoveInput): Promise<StartNextMoveResponse>;
  manualFocus(input: SessionManualFocusInput): Promise<ManualFocusResponse>;
};

export type SessionCockpitRouteOptions = {
  service?: SessionCockpitRouteService;
  db?: PennyDatabase;
  databaseUrl?: string;
};

export class SessionCockpitService implements SessionCockpitRouteService {
  private readonly repository: BrainRepository;
  private readonly thinkingModeService: ThinkingModeService;

  constructor(private readonly db: PennyDatabase) {
    this.repository = createBrainRepository(db);
    this.thinkingModeService = new ThinkingModeService(this.repository);
  }

  async getCockpit(sessionId: EntityId): Promise<SessionCockpitPayload> {
    const [graph, autopilot, activeChallenge, latestArtifact] = await Promise.all([
      loadSessionGraph(this.db, sessionId),
      this.getAutopilotState(sessionId),
      loadActiveChallenge(this.db, sessionId),
      loadLatestArtifact(this.db, sessionId),
    ]);

    return buildSessionCockpitPayload(graph, autopilot, activeChallenge, latestArtifact);
  }

  async getAutopilotState(sessionId: EntityId): Promise<ThinkingModeStateResponse> {
    return this.thinkingModeService.getState(brainIdForSessionAlias(sessionId), sessionId);
  }

  async tickAutopilot(input: SessionAutopilotTickInput): Promise<ThinkingModeTickResponse> {
    const tickInput = {
      brainId: brainIdForSessionAlias(input.sessionId),
      sessionId: input.sessionId,
    };

    return this.thinkingModeService.tick({
      ...tickInput,
      ...(input.resume !== undefined ? { resume: input.resume } : {}),
      ...(input.limit !== undefined ? { limit: input.limit } : {}),
    });
  }

  async startCandidate(input: SessionStartNextMoveInput): Promise<StartNextMoveResponse> {
    return this.thinkingModeService.startCandidate({
      brainId: brainIdForSessionAlias(input.sessionId),
      sessionId: input.sessionId,
      candidateId: input.candidateId,
    });
  }

  async manualFocus(input: SessionManualFocusInput): Promise<ManualFocusResponse> {
    return this.thinkingModeService.manualFocus({
      brainId: brainIdForSessionAlias(input.sessionId),
      sessionId: input.sessionId,
      claimId: input.claimId,
      reason: input.reason ?? null,
      previousSuggestionMoveId: input.previousSuggestionMoveId ?? null,
    });
  }
}

export async function handleSessionCockpitRequest(
  request: Request,
  sessionId: string,
  options: SessionCockpitRouteOptions = {},
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed("GET /api/sessions/:sessionId/cockpit requires the GET method.", "GET");
  }

  const sessionIdResult = UuidSchema.safeParse(sessionId);

  if (!sessionIdResult.success) {
    return invalidRequest("Invalid sessionId.", ["sessionId path parameter must be a UUID."]);
  }

  try {
    const service = resolveService(options);

    return jsonResponse({ data: await service.getCockpit(sessionIdResult.data) });
  } catch (error) {
    return sessionAdapterErrorResponse(error);
  }
}

export async function handleSessionAutopilotStateRequest(
  request: Request,
  sessionId: string,
  options: SessionCockpitRouteOptions = {},
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed("GET /api/sessions/:sessionId/autopilot/state requires the GET method.", "GET");
  }

  const sessionIdResult = UuidSchema.safeParse(sessionId);

  if (!sessionIdResult.success) {
    return invalidRequest("Invalid sessionId.", ["sessionId path parameter must be a UUID."]);
  }

  try {
    const service = resolveService(options);

    return jsonResponse({ data: await service.getAutopilotState(sessionIdResult.data) });
  } catch (error) {
    return sessionAdapterErrorResponse(error);
  }
}

export async function handleSessionAutopilotTickRequest(
  request: Request,
  sessionId: string,
  options: SessionCockpitRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /api/sessions/:sessionId/autopilot/tick requires the POST method.", "POST");
  }

  const sessionIdResult = UuidSchema.safeParse(sessionId);

  if (!sessionIdResult.success) {
    return invalidRequest("Invalid sessionId.", ["sessionId path parameter must be a UUID."]);
  }

  const parsed = await parseJsonRequest(request, TickBodySchema);

  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const service = resolveService(options);
    const input: SessionAutopilotTickInput = {
      sessionId: sessionIdResult.data,
      resume: parsed.data.resume,
    };

    if (parsed.data.limit !== undefined) {
      input.limit = parsed.data.limit;
    }

    return jsonResponse({ data: await service.tickAutopilot(input) }, 201);
  } catch (error) {
    return sessionAdapterErrorResponse(error);
  }
}

export async function handleSessionStartNextMoveCandidateRequest(
  request: Request,
  sessionId: string,
  candidateId: string,
  options: SessionCockpitRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed(
      "POST /api/sessions/:sessionId/next-move-candidates/:candidateId/start requires the POST method.",
      "POST",
    );
  }

  const sessionIdResult = UuidSchema.safeParse(sessionId);
  const candidateIdResult = CandidateIdSchema.safeParse(candidateId);

  if (!sessionIdResult.success) {
    return invalidRequest("Invalid sessionId.", ["sessionId path parameter must be a UUID."]);
  }

  if (!candidateIdResult.success) {
    return invalidRequest("Invalid candidateId.", ["candidateId path parameter is required."]);
  }

  const parsed = await parseJsonRequest(request, EmptyBodySchema);

  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const service = resolveService(options);

    return jsonResponse(
      {
        data: await service.startCandidate({
          sessionId: sessionIdResult.data,
          candidateId: candidateIdResult.data,
        }),
      },
      201,
    );
  } catch (error) {
    return sessionAdapterErrorResponse(error);
  }
}

export async function handleSessionManualFocusRequest(
  request: Request,
  sessionId: string,
  options: SessionCockpitRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /api/sessions/:sessionId/focus/manual requires the POST method.", "POST");
  }

  const sessionIdResult = UuidSchema.safeParse(sessionId);

  if (!sessionIdResult.success) {
    return invalidRequest("Invalid sessionId.", ["sessionId path parameter must be a UUID."]);
  }

  const parsed = await parseJsonRequest(request, ManualFocusBodySchema);

  if (!parsed.ok) {
    return parsed.response;
  }

  try {
    const service = resolveService(options);
    const input: SessionManualFocusInput = {
      sessionId: sessionIdResult.data,
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
    return sessionAdapterErrorResponse(error);
  }
}

export function buildSessionCockpitPayload(
  graph: SessionGraphPayload,
  autopilot: ThinkingModeStateResponse,
  activeChallenge: SessionCockpitChallengeRound | null,
  latestArtifact: SessionCockpitArtifact | null = null,
): SessionCockpitPayload {
  return {
    session: graph.session,
    sourceOfTruth: graph.sourceOfTruth,
    ideaMap: graph.ideaMap,
    graph: graph.graph,
    moves: graph.moves,
    lensSnapshot: graph.lensSnapshot,
    autopilot,
    activeChallenge: activeChallenge ? attachChallengeGraphRefs(activeChallenge, graph) : null,
    latestArtifact,
    meta: {
      ...graph.meta,
      latestArtifactId: latestArtifact?.id ?? null,
      activeChallengeId: activeChallenge?.id ?? null,
    },
  };
}

async function loadActiveChallenge(
  db: PennyDatabase,
  sessionId: EntityId,
): Promise<SessionCockpitChallengeRound | null> {
  const [round] = await db
    .select()
    .from(challengeRounds)
    .where(and(eq(challengeRounds.sessionId, sessionId), eq(challengeRounds.status, "open")))
    .orderBy(desc(challengeRounds.createdAt))
    .limit(1);

  return round ? challengeRoundSlice(round) : null;
}

async function loadLatestArtifact(db: PennyDatabase, sessionId: EntityId): Promise<SessionCockpitArtifact | null> {
  const [artifact] = await db
    .select()
    .from(artifacts)
    .where(eq(artifacts.sessionId, sessionId))
    .orderBy(desc(artifacts.createdAt))
    .limit(1);

  return artifact ? artifactSlice(artifact) : null;
}

function artifactSlice(artifact: ArtifactRow): SessionCockpitArtifact {
  return {
    id: artifact.id,
    sessionId: artifact.sessionId,
    kind: artifact.kind,
    title: artifact.title,
    summary: artifact.summary,
    payload: asRecord(artifact.payload),
    createdAt: artifact.createdAt.toISOString(),
  };
}

function challengeRoundSlice(round: ChallengeRoundRow): SessionCockpitChallengeRound {
  return {
    id: round.id,
    sessionId: round.sessionId,
    status: round.status,
    response: round.response,
    targetClaimId: round.targetClaimId,
    targetClaimVersionId: round.targetClaimVersionId,
    critiqueClaimId: round.critiqueClaimId,
    critiqueClaimVersionId: round.critiqueClaimVersionId,
    challengeEdgeId: round.challengeEdgeId,
    brainRunId: round.brainRunId,
    challengeMoveId: round.challengeMoveId,
    responseMoveId: round.responseMoveId,
    focusCompletedMoveId: round.focusCompletedMoveId,
    failureType: round.failureType,
    strength: round.strength,
    critique: round.critique,
    whyThis: round.whyThis,
    whatWouldResolveIt: round.whatWouldResolveIt,
    createdAt: round.createdAt.toISOString(),
    respondedAt: round.respondedAt?.toISOString() ?? null,
    updatedAt: round.updatedAt.toISOString(),
  };
}

function attachChallengeGraphRefs(
  challenge: SessionCockpitChallengeRound,
  graph: SessionGraphPayload,
): SessionCockpitActiveChallenge {
  return {
    ...challenge,
    targetClaim: graph.ideaMap.claims.find((claim) => claim.id === challenge.targetClaimId) ?? null,
    critiqueClaim: graph.ideaMap.claims.find((claim) => claim.id === challenge.critiqueClaimId) ?? null,
    challengeEdge: graph.ideaMap.edges.find((edge) => edge.id === challenge.challengeEdgeId) ?? null,
  };
}

function brainIdForSessionAlias(sessionId: EntityId): EntityId {
  return sessionId;
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

function resolveService(options: SessionCockpitRouteOptions): SessionCockpitRouteService {
  if (options.service) {
    return options.service;
  }

  return new SessionCockpitService(options.db ?? createPennyDb(options.databaseUrl));
}

function sessionAdapterErrorResponse(error: unknown): Response {
  if (
    error instanceof ThinkingModeNotFoundError ||
    error instanceof BrainRepositoryNotFoundError ||
    error instanceof SessionGraphNotFoundError
  ) {
    return jsonResponse(
      {
        error: {
          code: "session_adapter_not_found",
          message: error.message,
        },
      },
      404,
    );
  }

  if (
    error instanceof ThinkingModeConflictError ||
    error instanceof BrainRepositoryConflictError ||
    error instanceof SessionGraphConflictError
  ) {
    return jsonResponse(
      {
        error: {
          code: "session_adapter_conflict",
          message: error.message,
        },
      },
      409,
    );
  }

  return jsonResponse(
    {
      error: {
        code: "session_adapter_error",
        message: error instanceof Error ? error.message : String(error),
      },
    },
    500,
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
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
