import { randomUUID } from "node:crypto";
import { asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  getAutopilotPauseState,
  rankAutopilotMoves,
  type AutopilotArtifact,
  type AutopilotCandidate,
  type AutopilotClaim,
  type AutopilotEdge,
  type AutopilotMove,
  type AutopilotRanking,
  type AutopilotState,
  type AutopilotSuggestion,
} from "./autopilot-core.ts";
import {
  CommandIdempotencyRequestFields,
  commandRequestHash,
  commandScopeFromHeaders,
  createDbCommandIdempotencyStore,
  resolveCommandIdempotencyKey,
  runIdempotentCommand,
  stripCommandIdempotencyFields,
  type CommandIdempotencyStore,
} from "./command-idempotency.ts";
import { createPennyDb, type PennyDatabase } from "./db/client.ts";
import { artifacts, claimEdges, claims, claimVersions, moves, sessions } from "./db/schema.ts";
import { createMove, type CreatedMove } from "./move-payloads.ts";

const AutopilotTickRequestSchema = z
  .object({
    sessionId: z.string().uuid(),
    resume: z.boolean().optional().default(false),
    ...CommandIdempotencyRequestFields,
  })
  .strict();

const ManualNodeSelectedRequestSchema = z
  .object({
    sessionId: z.string().uuid(),
    claimId: z.string().uuid(),
    reason: z.string().trim().min(1).max(1_000).optional(),
    previousSuggestionMoveId: z.string().uuid().optional(),
    ...CommandIdempotencyRequestFields,
  })
  .strict();

type CommandIdempotencyFieldName = "idempotencyKey" | "commandId" | "customId";

export type AutopilotTickRequest = Omit<z.infer<typeof AutopilotTickRequestSchema>, CommandIdempotencyFieldName>;
export type ManualNodeSelectedRequest = Omit<z.infer<typeof ManualNodeSelectedRequestSchema>, CommandIdempotencyFieldName>;

export type PersistedAutopilotMove = {
  id: string;
  kind: "autopilot_suggested" | "manual_node_selected";
  summary: string;
  claimIds: string[];
  edgeIds: string[];
  artifactIds: string[];
};

export type PersistedAutopilotTick = {
  status: "ready" | "paused" | "empty";
  sessionId: string;
  suggestion: AutopilotSuggestion | null;
  candidates: AutopilotCandidate[];
  move: PersistedAutopilotMove | null;
  pause: {
    paused: boolean;
    manualMoveId: string | null;
    focusedClaimId: string | null;
    pausedAt: string | null;
  };
};

export type PersistedManualNodeSelection = {
  status: "paused";
  sessionId: string;
  focusClaim: {
    id: string;
    versionId: string;
    kind: AutopilotClaim["kind"];
    status: AutopilotClaim["status"];
    text: string;
    confidence: number;
  };
  move: PersistedAutopilotMove;
  pause: {
    paused: true;
    manualMoveId: string;
    focusedClaimId: string;
    pausedAt: string;
  };
};

export type AutopilotTickRouteOptions = {
  db?: PennyDatabase;
  databaseUrl?: string;
  tickAutopilot?: (
    input: AutopilotTickRequest,
    options: { db?: PennyDatabase },
  ) => Promise<PersistedAutopilotTick>;
  idempotencyStore?: CommandIdempotencyStore;
};

export type ManualNodeSelectedRouteOptions = {
  db?: PennyDatabase;
  databaseUrl?: string;
  selectManualNode?: (
    input: ManualNodeSelectedRequest,
    options: { db?: PennyDatabase },
  ) => Promise<PersistedManualNodeSelection>;
  idempotencyStore?: CommandIdempotencyStore;
};

type AutopilotTransaction = Parameters<Parameters<PennyDatabase["transaction"]>[0]>[0];

export async function handleAutopilotTickRequest(
  request: Request,
  options: AutopilotTickRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /autopilot/tick requires the POST method.");
  }

  const parsed = await parseJsonRequest(request, AutopilotTickRequestSchema);

  if (!parsed.ok) {
    return parsed.response;
  }

  const keyResult = resolveCommandIdempotencyKey(request, parsed.data);

  if (!keyResult.ok) {
    return keyResult.response;
  }

  const commandInput = stripCommandIdempotencyFields(parsed.data) as AutopilotTickRequest;
  const db = resolveAutopilotDb(options, Boolean(options.tickAutopilot));
  const tickAutopilot =
    options.tickAutopilot ??
    ((input: AutopilotTickRequest, tickOptions: { db?: PennyDatabase }) =>
      persistAutopilotTick(requireAutopilotDb(tickOptions.db), input));
  const idempotencyStore = options.idempotencyStore ?? (db ? createDbCommandIdempotencyStore(db) : undefined);

  return runIdempotentCommand({
    route: "POST /autopilot/tick",
    key: keyResult.key,
    requestHash: commandRequestHash("POST /autopilot/tick", commandInput),
    scope: commandScopeFromHeaders(request),
    store: idempotencyStore,
    execute: async () => {
      try {
        return jsonResponse({ data: await tickAutopilot(commandInput, dbOption(db)) }, 201);
      } catch (error) {
        return autopilotErrorResponse(error);
      }
    },
  });
}

export async function handleManualNodeSelectedRequest(
  request: Request,
  options: ManualNodeSelectedRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /autopilot/select-node requires the POST method.");
  }

  const parsed = await parseJsonRequest(request, ManualNodeSelectedRequestSchema);

  if (!parsed.ok) {
    return parsed.response;
  }

  const keyResult = resolveCommandIdempotencyKey(request, parsed.data);

  if (!keyResult.ok) {
    return keyResult.response;
  }

  const commandInput = stripCommandIdempotencyFields(parsed.data) as ManualNodeSelectedRequest;
  const db = resolveAutopilotDb(options, Boolean(options.selectManualNode));
  const selectManualNode =
    options.selectManualNode ??
    ((input: ManualNodeSelectedRequest, selectOptions: { db?: PennyDatabase }) =>
      persistManualNodeSelection(requireAutopilotDb(selectOptions.db), input));
  const idempotencyStore = options.idempotencyStore ?? (db ? createDbCommandIdempotencyStore(db) : undefined);

  return runIdempotentCommand({
    route: "POST /autopilot/select-node",
    key: keyResult.key,
    requestHash: commandRequestHash("POST /autopilot/select-node", commandInput),
    scope: commandScopeFromHeaders(request),
    store: idempotencyStore,
    execute: async () => {
      try {
        return jsonResponse({ data: await selectManualNode(commandInput, dbOption(db)) }, 201);
      } catch (error) {
        return autopilotErrorResponse(error);
      }
    },
  });
}

export class AutopilotNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AutopilotNotFoundError";
  }
}

export class AutopilotConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AutopilotConflictError";
  }
}

export async function persistAutopilotTick(
  db: PennyDatabase,
  input: AutopilotTickRequest,
): Promise<PersistedAutopilotTick> {
  return db.transaction(async (tx) => {
    const state = await loadAutopilotState(tx, input.sessionId);
    const pause = getAutopilotPauseState(state.moves);

    if (pause.paused && !input.resume) {
      return {
        status: "paused",
        sessionId: state.session.id,
        suggestion: null,
        candidates: [],
        move: null,
        pause,
      };
    }

    const ranking = rankAutopilotMoves(state);

    if (!ranking.suggestion) {
      return {
        status: "empty",
        sessionId: state.session.id,
        suggestion: null,
        candidates: [],
        move: null,
        pause: {
          paused: false,
          manualMoveId: pause.manualMoveId,
          focusedClaimId: pause.focusedClaimId,
          pausedAt: pause.pausedAt,
        },
      };
    }

    const moveId = randomUUID();
    const move = await createMove(tx, "autopilot_suggested", {
      id: moveId,
      sessionId: state.session.id,
      scope: state.session,
      summary: `Autopilot suggested: ${ranking.suggestion.label}.`,
      payload: autopilotSuggestionPayload(moveId, ranking, state),
    });

    return {
      status: "ready",
      sessionId: state.session.id,
      suggestion: ranking.suggestion,
      candidates: ranking.candidates,
      move: autopilotMoveSlice(move),
      pause: {
        paused: false,
        manualMoveId: pause.manualMoveId,
        focusedClaimId: pause.focusedClaimId,
        pausedAt: pause.pausedAt,
      },
    };
  });
}

export async function persistManualNodeSelection(
  db: PennyDatabase,
  input: ManualNodeSelectedRequest,
): Promise<PersistedManualNodeSelection> {
  return db.transaction(async (tx) => {
    const state = await loadAutopilotState(tx, input.sessionId);
    const claim = state.claims.find((candidate) => candidate.id === input.claimId);

    if (!claim) {
      throw new AutopilotNotFoundError("Manual node selection requires a claim in this session.");
    }

    const edgeIds = state.edges
      .filter((edge) => edge.fromClaimId === claim.id || edge.toClaimId === claim.id)
      .map((edge) => edge.id);
    const previousSuggestionMoveId = input.previousSuggestionMoveId ?? latestAutopilotSuggestionMoveId(state.moves);
    const move = await createMove(tx, "manual_node_selected", {
      sessionId: state.session.id,
      scope: state.session,
      summary: "User manually selected a graph node and paused autopilot.",
      payload: {
        claimId: claim.id,
        previousSuggestionMoveId,
        reason: input.reason ?? null,
        pauseAutopilot: true,
        claimIds: [claim.id],
        edgeIds,
        artifactIds: [],
      },
    });

    return {
      status: "paused",
      sessionId: state.session.id,
      focusClaim: {
        id: claim.id,
        versionId: claim.versionId,
        kind: claim.kind,
        status: claim.status,
        text: claim.text,
        confidence: claim.confidence,
      },
      move: autopilotMoveSlice(move),
      pause: {
        paused: true,
        manualMoveId: move.id,
        focusedClaimId: claim.id,
        pausedAt: move.createdAt.toISOString(),
      },
    };
  });
}

async function loadAutopilotState(db: AutopilotTransaction, sessionId: string): Promise<AutopilotState> {
  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);

  if (!session) {
    throw new AutopilotNotFoundError("Autopilot session was not found.");
  }

  if (session.status !== "open") {
    throw new AutopilotConflictError("Autopilot can only tick open sessions.");
  }

  const claimRows = await db.select().from(claims).where(eq(claims.sessionId, session.id)).orderBy(asc(claims.createdAt));
  const claimIds = claimRows.map((claim) => claim.id);
  const versionRows =
    claimIds.length > 0
      ? await db
          .select()
          .from(claimVersions)
          .where(inArray(claimVersions.claimId, claimIds))
          .orderBy(asc(claimVersions.createdAt))
      : [];
  const edgeRows = await db
    .select()
    .from(claimEdges)
    .where(eq(claimEdges.sessionId, session.id))
    .orderBy(asc(claimEdges.createdAt));
  const moveRows = await db.select().from(moves).where(eq(moves.sessionId, session.id)).orderBy(asc(moves.createdAt));
  const artifactRows = await db
    .select()
    .from(artifacts)
    .where(eq(artifacts.sessionId, session.id))
    .orderBy(asc(artifacts.createdAt));
  const currentVersions = currentVersionsByClaimId(versionRows);

  return {
    session: {
      id: session.id,
      userId: session.userId,
      workspaceId: session.workspaceId,
      projectId: session.projectId,
      sphereId: session.sphereId,
      status: session.status,
      createdAt: session.createdAt,
    },
    sessionId: session.id,
    claims: claimRows.flatMap((claim) => {
      const version = currentVersions.get(claim.id);

      if (!version) {
        return [];
      }

      return [
        {
          id: claim.id,
          sessionId: claim.sessionId,
          kind: claim.kind,
          status: version.status,
          text: version.content,
          confidence: version.confidence,
          versionId: version.id,
          createdAt: claim.createdAt,
          updatedAt: version.createdAt,
        } satisfies AutopilotClaim,
      ];
    }),
    edges: edgeRows.map(
      (edge): AutopilotEdge => ({
        id: edge.id,
        sessionId: edge.sessionId,
        fromClaimId: edge.fromClaimId,
        toClaimId: edge.toClaimId,
        kind: edge.kind,
        status: edge.status,
        label: edge.label,
        createdAt: edge.createdAt,
      }),
    ),
    moves: moveRows.map(
      (move): AutopilotMove => ({
        id: move.id,
        sessionId: move.sessionId,
        kind: move.kind,
        summary: move.summary,
        payload: move.payload,
        createdAt: move.createdAt,
      }),
    ),
    artifacts: artifactRows.map(
      (artifact): AutopilotArtifact => ({
        id: artifact.id,
        sessionId: artifact.sessionId,
        kind: artifact.kind,
        createdAt: artifact.createdAt,
      }),
    ),
  };
}

function autopilotSuggestionPayload(suggestionId: string, ranking: AutopilotRanking, state: AutopilotState) {
  const suggestion = requireSuggestion(ranking);
  const candidateScores = ranking.candidates.slice(0, 8).map(candidateScoreSlice);

  return {
    suggestionId,
    action: suggestion.action,
    mode: suggestion.mode,
    label: suggestion.label,
    targetClaimId: suggestion.targetClaimId,
    targetEdgeId: suggestion.targetEdgeId,
    score: suggestion.score,
    why: suggestion.why,
    reasonCodes: suggestion.reasonCodes,
    candidateScores,
    goThere: suggestion.goThere,
    claimIds: suggestion.targetClaimId ? [suggestion.targetClaimId] : [],
    edgeIds: suggestion.targetEdgeId ? [suggestion.targetEdgeId] : [],
    artifactIds: artifactIdsForSuggestion(state.artifacts ?? [], suggestion),
  };
}

function candidateScoreSlice(candidate: AutopilotCandidate) {
  return {
    action: candidate.action,
    mode: candidate.mode,
    targetClaimId: candidate.targetClaimId,
    targetEdgeId: candidate.targetEdgeId,
    score: candidate.score,
    reasonCodes: candidate.reasonCodes,
  };
}

function requireSuggestion(ranking: AutopilotRanking): AutopilotSuggestion {
  if (!ranking.suggestion) {
    throw new AutopilotConflictError("Cannot persist an empty autopilot suggestion.");
  }

  return ranking.suggestion;
}

function artifactIdsForSuggestion(artifactRows: AutopilotArtifact[], suggestion: AutopilotSuggestion): string[] {
  if (suggestion.action !== "create_challenge_brief") {
    return [];
  }

  return artifactRows
    .filter((artifact) => artifact.kind === "challenge_brief" || artifact.kind === "idea_map_challenge_brief")
    .map((artifact) => artifact.id);
}

function currentVersionsByClaimId(versionRows: Array<typeof claimVersions.$inferSelect>): Map<string, typeof claimVersions.$inferSelect> {
  const versionsByClaimId = new Map<string, typeof claimVersions.$inferSelect>();

  for (const version of [...versionRows].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())) {
    if (version.isCurrent && !versionsByClaimId.has(version.claimId)) {
      versionsByClaimId.set(version.claimId, version);
    }
  }

  return versionsByClaimId;
}

function latestAutopilotSuggestionMoveId(moveRows: AutopilotMove[]): string | null {
  return [...moveRows]
    .filter((move) => move.kind === "autopilot_suggested")
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
    .at(-1)?.id ?? null;
}

function autopilotMoveSlice(move: CreatedMove<"autopilot_suggested" | "manual_node_selected">): PersistedAutopilotMove {
  return {
    id: move.id,
    kind: move.kind,
    summary: move.summary,
    claimIds: move.payload.claimIds,
    edgeIds: move.payload.edgeIds,
    artifactIds: move.payload.artifactIds,
  };
}

async function parseJsonRequest<Schema extends z.ZodType>(
  request: Request,
  schema: Schema,
): Promise<{ ok: true; data: z.infer<Schema> } | { ok: false; response: Response }> {
  const bodyResult = await readJsonBody(request);

  if (!bodyResult.ok) {
    return {
      ok: false,
      response: jsonResponse(
        {
          error: {
            code: "invalid_json",
            message: bodyResult.message,
          },
        },
        400,
      ),
    };
  }

  const parsed = schema.safeParse(bodyResult.value);

  if (!parsed.success) {
    return {
      ok: false,
      response: jsonResponse(
        {
          error: {
            code: "invalid_request",
            message: "Request body failed validation.",
            issues: parsed.error.issues.map((issue) => {
              const path = issue.path.length ? `${issue.path.join(".")}: ` : "";
              return `${path}${issue.message}`;
            }),
          },
        },
        400,
      ),
    };
  }

  return {
    ok: true,
    data: parsed.data,
  };
}

async function readJsonBody(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; message: string }> {
  const text = await request.text();

  if (!text.trim()) {
    return {
      ok: false,
      message: "Request body must be JSON.",
    };
  }

  try {
    return {
      ok: true,
      value: JSON.parse(text) as unknown,
    };
  } catch (error) {
    return {
      ok: false,
      message: `Request body is not valid JSON: ${formatErrorMessage(error)}`,
    };
  }
}

function autopilotErrorResponse(error: unknown): Response {
  if (error instanceof AutopilotNotFoundError) {
    return jsonResponse(
      {
        error: {
          code: "autopilot_not_found",
          message: error.message,
        },
      },
      404,
    );
  }

  if (error instanceof AutopilotConflictError) {
    return jsonResponse(
      {
        error: {
          code: "autopilot_conflict",
          message: error.message,
        },
      },
      409,
    );
  }

  return jsonResponse(
    {
      error: {
        code: "autopilot_failed",
        message: formatErrorMessage(error),
      },
    },
    500,
  );
}

function resolveAutopilotDb(
  options: AutopilotTickRouteOptions | ManualNodeSelectedRouteOptions,
  hasInjectedCommand: boolean,
): PennyDatabase | undefined {
  if (options.db) {
    return options.db;
  }

  if (hasInjectedCommand) {
    return undefined;
  }

  return createPennyDb(options.databaseUrl);
}

function requireAutopilotDb(db: PennyDatabase | undefined): PennyDatabase {
  if (!db) {
    throw new Error("A Penny database is required for autopilot persistence.");
  }

  return db;
}

function dbOption(db: PennyDatabase | undefined): { db?: PennyDatabase } {
  return db ? { db } : {};
}

function methodNotAllowed(message: string): Response {
  return jsonResponse(
    {
      error: {
        code: "method_not_allowed",
        message,
      },
    },
    405,
    { Allow: "POST" },
  );
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

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return String(error);
}
