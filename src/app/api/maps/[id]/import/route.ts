import { NextResponse } from "next/server";
import { z } from "zod";
import { extractImportSource, extractTextFromHtml } from "@/lib/claim-extractor";
import { getCurrentAuthenticatedUserId } from "@/server/auth";
import { getThoughtMap, recordImportReview, recordImportSource } from "@/server/thought-map";
import { ImportSourceType } from "@/types/thought-map";

const sourceTypeSchema = z.enum(["url", "text_paste", "document"]);

const extractedClaimDecisionSchema = z.enum(["accepted", "rejected", "edited"]);

const sourceSubmissionSchema = z.object({
  mapId: z.string().min(1),
  sourceType: sourceTypeSchema,
  sourceUrl: z.string().trim().url().nullable().optional().default(null),
  sourceTitle: z.string().trim().max(240).nullable().optional().default(null),
  sourceContent: z.string().max(200000).optional().default(""),
});

const reviewedClaimSchema = z.object({
  id: z.string().min(1),
  userDecision: extractedClaimDecisionSchema,
  editedText: z.string().trim().max(4000).nullable().optional().default(null),
});

const reviewSubmissionSchema = z.object({
  mapId: z.string().min(1),
  importSourceId: z.string().min(1),
  extractedClaims: z.array(reviewedClaimSchema).min(1),
});

function isImportSourceType(value: string): value is ImportSourceType {
  return value === "url" || value === "text_paste" || value === "document";
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: mapId } = await params;
    const json = await request.json();

    if (json && typeof json === "object" && "importSourceId" in json) {
      const input = reviewSubmissionSchema.parse(json);
      if (input.mapId !== mapId) {
        return NextResponse.json({ error: "route_mismatch" }, { status: 400 });
      }

      const map = await getThoughtMap(input.mapId);

      if (!map) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }

      const source = map.importSources.find((entry) => entry.id === input.importSourceId);
      if (!source) {
        return NextResponse.json({ error: "import_source_not_found" }, { status: 404 });
      }

      if (source.acceptedClaimIds.length > 0) {
        return NextResponse.json({ error: "import_already_committed" }, { status: 409 });
      }

      const reviewedClaims = input.extractedClaims.map((claim) => {
        const original = source.extractedClaims.find((entry) => entry.id === claim.id);
        if (!original) {
          throw new Error(`Unknown extracted claim: ${claim.id}`);
        }

        return {
          ...original,
          userDecision: claim.userDecision,
          editedText: claim.userDecision === "edited" ? claim.editedText?.trim() || original.extractedText : null,
          resultingClaimId: null,
        };
      });

      const result = await recordImportReview({
        mapId: input.mapId,
        importSource: {
          ...source,
          extractedClaims: reviewedClaims,
        },
      });

      return NextResponse.json({ importSource: result.importSource, map: result.map }, { status: 200 });
    }

    const input = sourceSubmissionSchema.parse(json);
    if (input.mapId !== mapId) {
      return NextResponse.json({ error: "route_mismatch" }, { status: 400 });
    }

    const userId = await getCurrentAuthenticatedUserId();
    const map = await getThoughtMap(input.mapId);

    if (!map) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    let sourceContent = input.sourceContent.trim();
    const sourceUrl = input.sourceUrl ?? null;
    let sourceTitle = input.sourceTitle ?? null;

    if (input.sourceType === "url") {
      if (!sourceUrl) {
        return NextResponse.json({ error: "source_url_required" }, { status: 400 });
      }

      const response = await fetch(sourceUrl, {
        headers: {
          "user-agent": "Penny Importer",
          accept: "text/html, text/plain;q=0.9, */*;q=0.8",
        },
      });

      if (!response.ok) {
        return NextResponse.json({ error: "url_fetch_failed" }, { status: 400 });
      }

      const contentType = response.headers.get("content-type") ?? "";
      const text = await response.text();
      sourceContent = contentType.includes("html") ? extractTextFromHtml(text) : text.trim();
      sourceTitle = sourceTitle ?? new URL(sourceUrl).hostname.replace(/^www\./, "");
    }

    if (!sourceContent.trim()) {
      return NextResponse.json({ error: "source_content_required" }, { status: 400 });
    }

    const importSource = extractImportSource({
      mapId: input.mapId,
      userId,
      sourceType: isImportSourceType(input.sourceType) ? input.sourceType : "text_paste",
      sourceUrl,
      sourceTitle,
      sourceContent,
      importedAt: new Date(),
    });

    await recordImportSource(importSource);

    return NextResponse.json({ importSource }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "invalid_request",
          details: error.flatten(),
        },
        { status: 400 },
      );
    }

    if (error instanceof Error && error.message.startsWith("Unknown extracted claim:")) {
      return NextResponse.json({ error: "invalid_request", message: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
