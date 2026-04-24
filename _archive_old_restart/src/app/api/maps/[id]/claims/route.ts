import { NextResponse } from "next/server";
import { getCurrentAuthenticatedUserId } from "@/server/auth";
import { createClaim, getClaimsForMap, getMap, recordMove } from "@/server/mvp";
import { track } from "@/lib/analytics";
import { checkRateLimit } from "@/lib/rate-limiter";
import { logger } from "@/lib/logger";
import { classifyCalibrationDomain } from "@/lib/calibration";
import {
  CreateClaimSchema,
  MapParamsSchema,
  validateBody,
  ValidationError,
} from "@/lib/validation/schemas";
import { recordConfidenceOverride } from "@/server/thought-map";
import { z } from "zod";

const claimCaptureSchema = CreateClaimSchema.extend({
  note: z.string().max(500).nullable().optional(),
});

function formatClaimCaptureNote(params: {
  provenance: string;
  context: string;
  dependencyClaims: Array<{ id: string; content: string }>;
}) {
  const lines = [
    "## Claim capture",
    `- Provenance: ${params.provenance}`,
    `- Context: ${params.context}`,
    `- Dependencies: ${
      params.dependencyClaims.length
        ? params.dependencyClaims.map((claim) => claim.content).join(" | ")
        : "none linked"
    }`,
  ];

  return lines.join("\n");
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = MapParamsSchema.parse(await context.params);
    const userId = await getCurrentAuthenticatedUserId();

    const map = await getMap(id, userId);
    if (!map) {
      return NextResponse.json({ error: "Map not found" }, { status: 404 });
    }

    const claims = await getClaimsForMap(id, userId);
    return NextResponse.json({ claims }, { status: 200 });
  } catch (error) {
    if (error instanceof Error && /not found/i.test(error.message)) {
      return NextResponse.json({ error: "Map not found" }, { status: 404 });
    }

    logger.error("Failed to fetch claims", {
      error: error instanceof Error ? error.message : String(error),
      featureId: "claims-get",
    });
    return NextResponse.json({ error: "Failed to fetch claims" }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = MapParamsSchema.parse(await context.params);
    const userId = await getCurrentAuthenticatedUserId();

    const rateLimit = checkRateLimit(userId, "api_general");
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait before creating another claim." },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)),
          },
        },
      );
    }

    const map = await getMap(id, userId);
    if (!map) {
      return NextResponse.json({ error: "Map not found" }, { status: 404 });
    }

    const input = await validateBody(claimCaptureSchema)(await request.json());
    const dependencyIds = [...new Set(input.dependencyClaimIds)];
    const dependencyClaims = map.nodes.filter(
      (node) => node.kind !== "root" && dependencyIds.includes(node.id),
    );

    if (dependencyClaims.length !== dependencyIds.length) {
      throw new ValidationError("dependencyClaimIds: Every dependency must be an existing claim on this map.");
    }

    const claim = await createClaim(userId, id, {
      content: input.text,
      note: formatClaimCaptureNote({
        provenance: input.provenance,
        context: input.context,
        dependencyClaims: dependencyClaims.map((node) => ({
          id: node.id,
          content: node.content,
        })),
      }),
      kind: "core_claim",
      nodeStatus: "active",
      structureKind: "assertion",
    });

    await recordMove({
      mapId: id,
      nodeId: claim.id,
      eventType: "move_applied",
      payload: {
        action: "claim_created",
        claimId: claim.id,
        confidence: input.confidence,
        provenance: input.provenance,
        context: input.context,
        stakes: input.stakes,
        dependencyClaimIds: dependencyIds,
        dependencyClaims: dependencyClaims.map((node) => ({
          id: node.id,
          content: node.content,
        })),
      },
    });

    await recordConfidenceOverride({
      mapId: id,
      sourceNodeId: claim.id,
      targetNodeId: claim.id,
      mode: input.confidence >= 50 ? "hold" : "reduce",
      reasoning: `Initial capture at ${input.confidence}% confidence. ${input.provenance}. Context: ${input.context}.${dependencyClaims.length > 0 ? ` Dependencies: ${dependencyClaims.map((node) => node.content).join(", ")}.` : ""}${input.stakes.length > 0 ? ` Stakes: ${input.stakes.join(", ")}.` : ""}`,
    });

    void track(
      {
        event: "claim_created",
        properties: {
          claimId: claim.id,
          mapId: id,
          domain: classifyCalibrationDomain(input.text),
        },
      },
      userId,
    );

    logger.info("Claim created", {
      userId,
      featureId: "claims-post",
      data: { mapId: id, claimId: claim.id },
    });

    return NextResponse.json({ claim }, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof Error && /not found/i.test(error.message)) {
      return NextResponse.json({ error: "Map not found" }, { status: 404 });
    }

    logger.error("Failed to create claim", {
      error: error instanceof Error ? error.message : String(error),
      featureId: "claims-post",
    });

    return NextResponse.json({ error: "Failed to create claim" }, { status: 500 });
  }
}
