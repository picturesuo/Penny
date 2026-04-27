import { asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { createPennyDb, type PennyDatabase } from "./db/client.ts";
import { artifacts, claimEdges, claimVersions, claims, moves, sessions } from "./db/schema.ts";

export const ArtifactRequestSchema = z
  .object({
    sessionId: z.string().uuid(),
  })
  .strict();

export type ArtifactRequest = z.infer<typeof ArtifactRequestSchema>;

type ClaimRow = typeof claims.$inferSelect;
type ClaimVersionRow = typeof claimVersions.$inferSelect;
type EdgeRow = typeof claimEdges.$inferSelect;
type MoveRow = typeof moves.$inferSelect;
type SessionRow = typeof sessions.$inferSelect;
type ArtifactRow = typeof artifacts.$inferSelect;

export type SessionArtifactState = {
  session: SessionRow;
  claims: ClaimRow[];
  claimVersions: ClaimVersionRow[];
  edges: EdgeRow[];
  moves: MoveRow[];
};

export type CompiledArtifactPayload = {
  sessionId: string;
  generatedFrom: {
    claimCount: number;
    claimVersionCount: number;
    edgeCount: number;
    moveCount: number;
    challengeCount: number;
    learnedConceptCount: number;
  };
  ideaMap: {
    claims: ArtifactClaim[];
    edges: ArtifactEdge[];
  };
  challengeBrief: {
    challenges: ArtifactChallenge[];
    unresolvedRisks: ArtifactRisk[];
    whatChanged: ArtifactChange[];
    recommendedNextMove: string;
  };
  learnedConcepts: ArtifactLearnedConcept[];
};

export type PersistedArtifact = {
  artifact: {
    id: string;
    kind: "idea_map_challenge_brief";
    title: string;
    summary: string;
    payload: CompiledArtifactPayload;
    createdAt: string;
  };
  move: {
    id: string;
    kind: "artifact_created";
    summary: string;
    claimIds: string[];
    edgeIds: string[];
    artifactIds: string[];
  };
};

export type ArtifactRouteOptions = {
  db?: PennyDatabase;
  databaseUrl?: string;
  createArtifact?: (input: ArtifactRequest, options: { db?: PennyDatabase }) => Promise<PersistedArtifact>;
};

type ArtifactDraft = {
  title: string;
  summary: string;
  payload: CompiledArtifactPayload;
  claimIds: string[];
  edgeIds: string[];
};

type ArtifactClaim = {
  id: string;
  kind: ClaimRow["kind"];
  status: ClaimVersionRow["status"];
  text: string;
  confidence: number;
  currentVersionId: string;
  versions: Array<{
    id: string;
    content: string;
    confidence: number;
    status: ClaimVersionRow["status"];
    isCurrent: boolean;
    createdAt: string;
  }>;
};

type ArtifactEdge = {
  id: string;
  fromClaimId: string;
  toClaimId: string;
  kind: EdgeRow["kind"];
  status: EdgeRow["status"];
  label: string | null;
};

type ArtifactChallenge = {
  edgeId: string;
  kind: "challenges" | "contradicts";
  status: EdgeRow["status"];
  failureType: string | null;
  strength: string | null;
  targetClaimId: string;
  target: string;
  critiqueClaimId: string;
  critique: string;
};

type ArtifactRisk = {
  kind: "challenge" | "assumption";
  claimId: string;
  edgeId: string | null;
  status: string;
  text: string;
  reason: string;
};

type ArtifactChange = {
  moveId: string;
  kind: MoveRow["kind"];
  summary: string;
  claimIds: string[];
  edgeIds: string[];
  createdAt: string;
};

type ArtifactLearnedConcept = {
  claimId: string;
  versionId: string;
  term: string;
  explanation: string;
  teachesClaimIds: string[];
  edgeIds: string[];
};

export async function handleArtifactRequest(
  request: Request,
  options: ArtifactRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowed("POST /brain/artifact requires the POST method.");
  }

  const parsed = await parseJsonRequest(request, ArtifactRequestSchema);

  if (!parsed.ok) {
    return parsed.response;
  }

  const db = resolveArtifactDb(options, Boolean(options.createArtifact));
  const createArtifact =
    options.createArtifact ??
    ((input: ArtifactRequest, createOptions: { db?: PennyDatabase }) =>
      persistSessionArtifact(requireArtifactDb(createOptions.db), input));

  try {
    return jsonResponse({ data: await createArtifact(parsed.data, dbOption(db)) }, 201);
  } catch (error) {
    return artifactErrorResponse(error);
  }
}

export class ArtifactNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArtifactNotFoundError";
  }
}

export class ArtifactConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArtifactConflictError";
  }
}

export async function persistSessionArtifact(db: PennyDatabase, input: ArtifactRequest): Promise<PersistedArtifact> {
  return db.transaction(async (tx) => {
    const state = await loadSessionArtifactState(tx, input.sessionId);
    const draft = buildArtifactDraft(state);
    const [artifact] = await tx
      .insert(artifacts)
      .values({
        sessionId: input.sessionId,
        kind: "idea_map_challenge_brief",
        title: draft.title,
        summary: draft.summary,
        payload: draft.payload,
      })
      .returning();

    if (!artifact) {
      throw new ArtifactConflictError("Failed to create Idea Map + Challenge Brief artifact.");
    }

    const [move] = await tx
      .insert(moves)
      .values({
        sessionId: input.sessionId,
        kind: "artifact_created",
        summary: "Compiled the Idea Map + Challenge Brief from current session state.",
        payload: {
          artifactId: artifact.id,
          artifactIds: [artifact.id],
          claimIds: draft.claimIds,
          edgeIds: draft.edgeIds,
          unresolvedRiskCount: draft.payload.challengeBrief.unresolvedRisks.length,
          recommendedNextMove: draft.payload.challengeBrief.recommendedNextMove,
        },
      })
      .returning();

    if (!move) {
      throw new ArtifactConflictError("Failed to create artifact_created move.");
    }

    return artifactResponse(artifact, move, draft);
  });
}

export function buildArtifactDraft(state: SessionArtifactState): ArtifactDraft {
  if (state.claims.length === 0) {
    throw new ArtifactConflictError("Cannot compile an artifact for a session without claims.");
  }

  const versionsByClaimId = groupVersions(state.claimVersions);
  const currentVersions = new Map<string, ClaimVersionRow>();
  const claimSnapshots = state.claims.map((claim) => {
    const versions = versionsByClaimId.get(claim.id) ?? [];
    const currentVersion = currentVersionFor(claim, versions);
    currentVersions.set(claim.id, currentVersion);

    return artifactClaim(claim, currentVersion, versions);
  });
  const claimsById = new Map(state.claims.map((claim) => [claim.id, claim]));
  const textByClaimId = new Map(claimSnapshots.map((claim) => [claim.id, claim.text]));
  const challengeEdges = state.edges.filter((edge) => edge.kind === "challenges" || edge.kind === "contradicts");
  const teachesEdges = state.edges.filter((edge) => edge.kind === "teaches");
  const movesByChallengeEdgeId = new Map(
    state.moves
      .map((move) => [stringPayloadValue(move.payload, "challengeEdgeId"), move] as const)
      .filter((entry): entry is [string, MoveRow] => Boolean(entry[0])),
  );
  const challenges = challengeEdges.map((edge) =>
    artifactChallenge(edge, textByClaimId, movesByChallengeEdgeId.get(edge.id)),
  );
  const learnedConcepts = state.claims
    .filter((claim) => claim.kind === "concept")
    .map((claim) => artifactLearnedConcept(claim, currentVersions, teachesEdges))
    .filter((concept): concept is ArtifactLearnedConcept => Boolean(concept));
  const unresolvedRisks = buildUnresolvedRisks(state.claims, state.edges, challenges, textByClaimId);
  const whatChanged = state.moves.map(artifactChange);
  const recommendedNextMove = recommendNextMove(unresolvedRisks, claimSnapshots, learnedConcepts);
  const payload: CompiledArtifactPayload = {
    sessionId: state.session.id,
    generatedFrom: {
      claimCount: state.claims.length,
      claimVersionCount: state.claimVersions.length,
      edgeCount: state.edges.length,
      moveCount: state.moves.length,
      challengeCount: challenges.length,
      learnedConceptCount: learnedConcepts.length,
    },
    ideaMap: {
      claims: claimSnapshots,
      edges: state.edges.map(artifactEdge),
    },
    challengeBrief: {
      challenges,
      unresolvedRisks,
      whatChanged,
      recommendedNextMove,
    },
    learnedConcepts,
  };
  const title = "Idea Map + Challenge Brief";
  const summary = artifactSummary(claimSnapshots, unresolvedRisks, learnedConcepts, recommendedNextMove);

  return {
    title,
    summary,
    payload,
    claimIds: state.claims.map((claim) => claim.id),
    edgeIds: state.edges.map((edge) => edge.id),
  };
}

type ArtifactTransaction = Parameters<Parameters<PennyDatabase["transaction"]>[0]>[0];

async function loadSessionArtifactState(tx: ArtifactTransaction, sessionId: string): Promise<SessionArtifactState> {
  const [session] = await tx.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);

  if (!session) {
    throw new ArtifactNotFoundError("Session was not found.");
  }

  const sessionClaims = await tx.select().from(claims).where(eq(claims.sessionId, sessionId)).orderBy(asc(claims.createdAt));
  const sessionClaimVersions =
    sessionClaims.length > 0
      ? await tx
          .select()
          .from(claimVersions)
          .where(inArray(claimVersions.claimId, sessionClaims.map((claim) => claim.id)))
          .orderBy(asc(claimVersions.createdAt))
      : [];
  const sessionEdges = await tx
    .select()
    .from(claimEdges)
    .where(eq(claimEdges.sessionId, sessionId))
    .orderBy(asc(claimEdges.createdAt));
  const sessionMoves = await tx.select().from(moves).where(eq(moves.sessionId, sessionId)).orderBy(asc(moves.createdAt));

  return {
    session,
    claims: sessionClaims,
    claimVersions: sessionClaimVersions,
    edges: sessionEdges,
    moves: sessionMoves,
  };
}

function groupVersions(versions: ClaimVersionRow[]): Map<string, ClaimVersionRow[]> {
  const grouped = new Map<string, ClaimVersionRow[]>();

  for (const version of versions) {
    const claimVersionsForClaim = grouped.get(version.claimId) ?? [];
    claimVersionsForClaim.push(version);
    grouped.set(version.claimId, claimVersionsForClaim);
  }

  return grouped;
}

function currentVersionFor(claim: ClaimRow, versions: ClaimVersionRow[]): ClaimVersionRow {
  const current = [...versions].reverse().find((version) => version.isCurrent);

  if (current) {
    return current;
  }

  const latest = versions.at(-1);

  if (latest) {
    return latest;
  }

  throw new ArtifactConflictError(`Claim ${claim.id} has no ClaimVersion.`);
}

function artifactClaim(
  claim: ClaimRow,
  currentVersion: ClaimVersionRow,
  versions: ClaimVersionRow[],
): ArtifactClaim {
  return {
    id: claim.id,
    kind: claim.kind,
    status: currentVersion.status,
    text: currentVersion.content,
    confidence: currentVersion.confidence,
    currentVersionId: currentVersion.id,
    versions: versions.map((version) => ({
      id: version.id,
      content: version.content,
      confidence: version.confidence,
      status: version.status,
      isCurrent: version.isCurrent,
      createdAt: version.createdAt.toISOString(),
    })),
  };
}

function artifactEdge(edge: EdgeRow): ArtifactEdge {
  return {
    id: edge.id,
    fromClaimId: edge.fromClaimId,
    toClaimId: edge.toClaimId,
    kind: edge.kind,
    status: edge.status,
    label: edge.label,
  };
}

function artifactChallenge(
  edge: EdgeRow,
  textByClaimId: Map<string, string>,
  move: MoveRow | undefined,
): ArtifactChallenge {
  if (edge.kind !== "challenges" && edge.kind !== "contradicts") {
    throw new ArtifactConflictError("Expected challenge or contradiction edge.");
  }

  return {
    edgeId: edge.id,
    kind: edge.kind,
    status: edge.status,
    failureType: edge.label,
    strength: stringPayloadValue(move?.payload, "strength"),
    targetClaimId: edge.toClaimId,
    target: textByClaimId.get(edge.toClaimId) ?? "Unknown target claim.",
    critiqueClaimId: edge.fromClaimId,
    critique: textByClaimId.get(edge.fromClaimId) ?? "Unknown critique claim.",
  };
}

function artifactLearnedConcept(
  claim: ClaimRow,
  currentVersions: Map<string, ClaimVersionRow>,
  teachesEdges: EdgeRow[],
): ArtifactLearnedConcept | null {
  const version = currentVersions.get(claim.id);

  if (!version) {
    return null;
  }

  const conceptEdges = teachesEdges.filter((edge) => edge.fromClaimId === claim.id || edge.toClaimId === claim.id);
  const teachesClaimIds = conceptEdges.map((edge) => (edge.fromClaimId === claim.id ? edge.toClaimId : edge.fromClaimId));

  return {
    claimId: claim.id,
    versionId: version.id,
    term: claim.text,
    explanation: version.content,
    teachesClaimIds,
    edgeIds: conceptEdges.map((edge) => edge.id),
  };
}

function buildUnresolvedRisks(
  sessionClaims: ClaimRow[],
  edges: EdgeRow[],
  challenges: ArtifactChallenge[],
  textByClaimId: Map<string, string>,
): ArtifactRisk[] {
  const challengeRisks = challenges
    .filter((challenge) => challenge.status === "active" || challenge.status === "acknowledged_vulnerability")
    .map((challenge) => ({
      kind: "challenge" as const,
      claimId: challenge.targetClaimId,
      edgeId: challenge.edgeId,
      status: challenge.status,
      text: challenge.critique,
      reason:
        challenge.status === "acknowledged_vulnerability"
          ? "Acknowledged challenge remains a vulnerability."
          : "Active challenge has not been defended, revised, or absorbed.",
    }));
  const challengedClaimIds = new Set(challengeRisks.map((risk) => risk.claimId));
  const assumptionClaimIds = new Set(sessionClaims.filter((claim) => claim.kind === "assumption").map((claim) => claim.id));
  const assumptionRisks = edges
    .filter((edge) => edge.kind === "depends_on" && assumptionClaimIds.has(edge.toClaimId) && !challengedClaimIds.has(edge.toClaimId))
    .slice(0, 3)
    .map((edge) => ({
      kind: "assumption" as const,
      claimId: edge.toClaimId,
      edgeId: edge.id,
      status: edge.status,
      text: textByClaimId.get(edge.toClaimId) ?? "Unknown assumption.",
      reason: "Dependency assumption still needs confirmation, rejection, or refinement.",
    }));

  return [...challengeRisks, ...assumptionRisks];
}

function artifactChange(move: MoveRow): ArtifactChange {
  return {
    moveId: move.id,
    kind: move.kind,
    summary: move.summary,
    claimIds: stringArrayPayloadValue(move.payload, "claimIds"),
    edgeIds: stringArrayPayloadValue(move.payload, "edgeIds"),
    createdAt: move.createdAt.toISOString(),
  };
}

function recommendNextMove(
  risks: ArtifactRisk[],
  claims: ArtifactClaim[],
  learnedConcepts: ArtifactLearnedConcept[],
): string {
  const challengeRisk = risks.find((risk) => risk.kind === "challenge");

  if (challengeRisk) {
    return `Respond to the unresolved challenge on "${clipText(challengeRisk.text, 120)}" with Defend, Revise, or Absorb.`;
  }

  const assumptionRisk = risks.find((risk) => risk.kind === "assumption");

  if (assumptionRisk) {
    return `Confirm, reject, or refine the assumption "${clipText(assumptionRisk.text, 120)}".`;
  }

  if (learnedConcepts.length === 0) {
    const target = claims.find((claim) => claim.kind === "assumption") ?? claims[0];

    return `Use Makes Cents on a term inside "${clipText(target?.text ?? "the current claim", 120)}" before the next challenge.`;
  }

  const weakestClaim = [...claims].sort((left, right) => left.confidence - right.confidence)[0];

  return `Issue the next challenge against "${clipText(weakestClaim?.text ?? "the weakest claim", 120)}".`;
}

function artifactSummary(
  claims: ArtifactClaim[],
  risks: ArtifactRisk[],
  learnedConcepts: ArtifactLearnedConcept[],
  recommendedNextMove: string,
): string {
  return `${claims.length} claims, ${risks.length} unresolved risks, ${learnedConcepts.length} learned concepts. Next: ${recommendedNextMove}`;
}

function artifactResponse(artifact: ArtifactRow, move: MoveRow, draft: ArtifactDraft): PersistedArtifact {
  if (artifact.kind !== "idea_map_challenge_brief") {
    throw new ArtifactConflictError("Expected Idea Map + Challenge Brief artifact.");
  }

  return {
    artifact: {
      id: artifact.id,
      kind: artifact.kind,
      title: artifact.title,
      summary: artifact.summary,
      payload: draft.payload,
      createdAt: artifact.createdAt.toISOString(),
    },
    move: {
      id: move.id,
      kind: "artifact_created",
      summary: move.summary,
      claimIds: draft.claimIds,
      edgeIds: draft.edgeIds,
      artifactIds: [artifact.id],
    },
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

  return { ok: true, data: parsed.data };
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

function artifactErrorResponse(error: unknown): Response {
  if (error instanceof ArtifactNotFoundError) {
    return jsonResponse(
      {
        error: {
          code: "artifact_session_not_found",
          message: error.message,
        },
      },
      404,
    );
  }

  if (error instanceof ArtifactConflictError) {
    return jsonResponse(
      {
        error: {
          code: "artifact_conflict",
          message: error.message,
        },
      },
      409,
    );
  }

  return jsonResponse(
    {
      error: {
        code: "artifact_failed",
        message: formatErrorMessage(error),
      },
    },
    500,
  );
}

function resolveArtifactDb(
  options: { db?: PennyDatabase; databaseUrl?: string },
  hasInjectedPersistence: boolean,
): PennyDatabase | undefined {
  if (options.db) {
    return options.db;
  }

  if (hasInjectedPersistence) {
    return undefined;
  }

  return createPennyDb(options.databaseUrl);
}

function requireArtifactDb(db: PennyDatabase | undefined): PennyDatabase {
  if (!db) {
    throw new Error("A Penny database is required for POST /brain/artifact.");
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

function stringPayloadValue(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const value = (payload as Record<string, unknown>)[key];

  return typeof value === "string" ? value : null;
}

function stringArrayPayloadValue(payload: unknown, key: string): string[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const value = (payload as Record<string, unknown>)[key];

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function clipText(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/g, " ").trim();

  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength - 1).trimEnd()}.`;
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return String(error);
}
