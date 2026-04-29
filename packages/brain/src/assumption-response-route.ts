import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { afterMoveEffectsInTransaction } from "./after-move-effects.ts";
import { createPennyDb, type PennyDatabase } from "./db/client.ts";
import { claimVersions, claims } from "./db/schema.ts";
import { createMove } from "./move-payloads.ts";

const AssumptionResponsePathSchema = z.string().uuid();

export const AssumptionResponseRequestSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("confirm"),
      confidence: z.number().int().min(0).max(100).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("reject"),
      confidence: z.number().int().min(0).max(100).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("refine"),
      refinedText: z.string().trim().min(1).max(4_000),
      confidence: z.number().int().min(0).max(100).optional(),
    })
    .strict(),
]);

export type AssumptionResponseRequest = z.infer<typeof AssumptionResponseRequestSchema>;

export type PersistedAssumptionResponse = {
  claim: {
    id: string;
    versionId: string;
    kind: "assumption";
    status: "exploratory" | "committed" | "resolved" | "rejected";
    text: string;
    confidence: number;
  };
  move: {
    id: string;
    kind: "assumption_confirmed" | "assumption_rejected" | "assumption_refined";
    summary: string;
    claimIds: string[];
    edgeIds: string[];
    artifactIds: string[];
  };
  previousVersionId: string;
};

export type AssumptionResponseRouteOptions = {
  db?: PennyDatabase;
  databaseUrl?: string;
  persistResponse?: (
    claimId: string,
    response: AssumptionResponseRequest,
    options: { db?: PennyDatabase },
  ) => Promise<PersistedAssumptionResponse>;
};

export async function handleAssumptionResponseRequest(
  request: Request,
  claimId: string,
  options: AssumptionResponseRouteOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse(
      {
        error: {
          code: "method_not_allowed",
          message: "POST /brain/assumptions/:claimId/respond requires the POST method.",
        },
      },
      405,
      { Allow: "POST" },
    );
  }

  const parsedClaimId = AssumptionResponsePathSchema.safeParse(claimId);

  if (!parsedClaimId.success) {
    return jsonResponse(
      {
        error: {
          code: "invalid_claim_id",
          message: "Assumption response requires a valid claim id.",
        },
      },
      400,
    );
  }

  const bodyResult = await readJsonBody(request);

  if (!bodyResult.ok) {
    return jsonResponse(
      {
        error: {
          code: "invalid_json",
          message: bodyResult.message,
        },
      },
      400,
    );
  }

  const parsedBody = AssumptionResponseRequestSchema.safeParse(bodyResult.value);

  if (!parsedBody.success) {
    return jsonResponse(
      {
        error: {
          code: "invalid_request",
          message: "Request body failed validation.",
          issues: parsedBody.error.issues.map((issue) => {
            const path = issue.path.length ? `${issue.path.join(".")}: ` : "";
            return `${path}${issue.message}`;
          }),
        },
      },
      400,
    );
  }

  const db = resolveRouteDb(options);
  const persistResponse =
    options.persistResponse ??
    ((targetClaimId: string, response: AssumptionResponseRequest, persistOptions: { db?: PennyDatabase }) =>
      persistAssumptionResponse(requireRouteDb(persistOptions.db), targetClaimId, response));

  try {
    const persisted = await persistResponse(parsedClaimId.data, parsedBody.data, dbOption(db));

    return jsonResponse({ data: persisted }, 200);
  } catch (error) {
    if (error instanceof AssumptionResponseNotFoundError) {
      return jsonResponse(
        {
          error: {
            code: "assumption_not_found",
            message: error.message,
          },
        },
        404,
      );
    }

    if (error instanceof AssumptionResponseConflictError) {
      return jsonResponse(
        {
          error: {
            code: "assumption_response_conflict",
            message: error.message,
          },
        },
        409,
      );
    }

    return jsonResponse(
      {
        error: {
          code: "assumption_response_failed",
          message: formatErrorMessage(error),
        },
      },
      500,
    );
  }
}

export class AssumptionResponseNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssumptionResponseNotFoundError";
  }
}

export class AssumptionResponseConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssumptionResponseConflictError";
  }
}

export async function persistAssumptionResponse(
  db: PennyDatabase,
  claimId: string,
  response: AssumptionResponseRequest,
): Promise<PersistedAssumptionResponse> {
  return db.transaction(async (tx) => {
    const [claim] = await tx.select().from(claims).where(eq(claims.id, claimId)).limit(1);

    if (!claim) {
      throw new AssumptionResponseNotFoundError("Assumption claim was not found.");
    }

    if (claim.kind !== "assumption") {
      throw new AssumptionResponseConflictError("Only assumption claims can be confirmed, rejected, or refined.");
    }

    const [currentVersion] = await tx
      .select()
      .from(claimVersions)
      .where(and(eq(claimVersions.claimId, claim.id), eq(claimVersions.isCurrent, true)))
      .orderBy(desc(claimVersions.createdAt))
      .limit(1);

    if (!currentVersion) {
      throw new AssumptionResponseConflictError("Assumption claim has no current version.");
    }

    const next = nextVersionState(currentVersion, response);
    const versionId = randomUUID();
    const moveId = randomUUID();
    const moveKind = moveKindFor(response.action);
    const summary = summaryFor(response.action);
    const validFrom = new Date();

    const move = await createMove(tx, moveKind, {
      id: moveId,
      sessionId: claim.sessionId,
      scope: claim,
      summary,
      payload: {
        action: response.action,
        claimId: claim.id,
        previousVersionId: currentVersion.id,
        currentVersionId: versionId,
        previousStatus: currentVersion.status,
        currentStatus: next.status,
        refined: response.action === "refine",
        claimIds: [claim.id],
        claimVersionIds: [currentVersion.id, versionId],
        edgeIds: [],
      },
    });

    const [version] = await tx
      .insert(claimVersions)
      .values({
        id: versionId,
        claimId: claim.id,
        sourceId: currentVersion.sourceId ?? claim.sourceId,
        moveId: move.id,
        content: next.content,
        status: next.status,
        confidence: next.confidence,
        isCurrent: false,
        validFrom,
      })
      .returning();

    if (!version) {
      throw new AssumptionResponseConflictError("Failed to create assumption response version.");
    }

    await tx
      .update(claimVersions)
      .set({
        isCurrent: false,
        validUntil: validFrom,
        supersededByVersionId: versionId,
      })
      .where(and(eq(claimVersions.claimId, claim.id), eq(claimVersions.isCurrent, true)));

    const [markedCurrentResponseVersion] = await tx
      .update(claimVersions)
      .set({
        isCurrent: true,
      })
      .where(eq(claimVersions.id, version.id))
      .returning();

    if (!markedCurrentResponseVersion) {
      throw new AssumptionResponseConflictError("Failed to mark assumption response version current.");
    }

    await afterMoveEffectsInTransaction(tx, { sessionId: claim.sessionId, moveId: move.id });

    const currentResponseVersion = {
      ...version,
      isCurrent: true,
    };

    return {
      claim: {
        id: claim.id,
        versionId: currentResponseVersion.id,
        kind: "assumption",
        status: currentResponseVersion.status,
        text: currentResponseVersion.content,
        confidence: currentResponseVersion.confidence,
      },
      move: {
        id: move.id,
        kind: move.kind as PersistedAssumptionResponse["move"]["kind"],
        summary: move.summary,
        claimIds: [claim.id],
        edgeIds: [],
        artifactIds: [],
      },
      previousVersionId: currentVersion.id,
    };
  });
}

function nextVersionState(
  currentVersion: typeof claimVersions.$inferSelect,
  response: AssumptionResponseRequest,
): {
  content: string;
  status: "exploratory" | "committed" | "resolved" | "rejected";
  confidence: number;
} {
  switch (response.action) {
    case "confirm":
      return {
        content: currentVersion.content,
        status: "committed",
        confidence: response.confidence ?? currentVersion.confidence,
      };
    case "reject":
      return {
        content: currentVersion.content,
        status: "rejected",
        confidence: response.confidence ?? currentVersion.confidence,
      };
    case "refine":
      return {
        content: response.refinedText,
        status: "exploratory",
        confidence: response.confidence ?? currentVersion.confidence,
      };
  }
}

function moveKindFor(action: AssumptionResponseRequest["action"]): PersistedAssumptionResponse["move"]["kind"] {
  switch (action) {
    case "confirm":
      return "assumption_confirmed";
    case "reject":
      return "assumption_rejected";
    case "refine":
      return "assumption_refined";
  }
}

function summaryFor(action: AssumptionResponseRequest["action"]): string {
  switch (action) {
    case "confirm":
      return "Confirmed an extracted assumption.";
    case "reject":
      return "Rejected an extracted assumption without deleting it.";
    case "refine":
      return "Refined an extracted assumption by creating a new current version.";
  }
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

function resolveRouteDb(options: AssumptionResponseRouteOptions): PennyDatabase | undefined {
  if (options.db) {
    return options.db;
  }

  if (options.persistResponse) {
    return undefined;
  }

  return createPennyDb(options.databaseUrl);
}

function requireRouteDb(db: PennyDatabase | undefined): PennyDatabase {
  if (!db) {
    throw new Error("A Penny database is required for assumption response persistence.");
  }

  return db;
}

function dbOption(db: PennyDatabase | undefined): { db?: PennyDatabase } {
  return db ? { db } : {};
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
