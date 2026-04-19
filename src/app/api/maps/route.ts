import { NextResponse } from "next/server";
import { getCurrentAuthenticatedUserId } from "@/server/auth";
import { createMap, getMapsForUser } from "@/server/mvp";
import { checkRateLimit } from "@/lib/rate-limiter";
import { logger } from "@/lib/logger";
import { CreateMapSchema, validateBody, ValidationError } from "@/lib/validation/schemas";

export async function GET() {
  try {
    const userId = await getCurrentAuthenticatedUserId();
    const maps = await getMapsForUser(userId);
    return NextResponse.json({ maps }, { status: 200 });
  } catch (error) {
    logger.error("Failed to fetch maps", {
      error: error instanceof Error ? error.message : String(error),
      featureId: "maps-get",
    });
    return NextResponse.json({ error: "Failed to fetch maps" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getCurrentAuthenticatedUserId();
    const rateLimit = checkRateLimit(userId, "api_general");
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait before creating another map." },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)),
          },
        },
      );
    }

    const input = await validateBody(CreateMapSchema)(await request.json());
    const map = await createMap(userId, input);

    logger.info("Map created", {
      userId,
      featureId: "maps-post",
      data: { mapId: map.id },
    });

    return NextResponse.json({ map }, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    logger.error("Failed to create map", {
      error: error instanceof Error ? error.message : String(error),
      featureId: "maps-post",
    });

    return NextResponse.json({ error: "Failed to create map" }, { status: 500 });
  }
}
