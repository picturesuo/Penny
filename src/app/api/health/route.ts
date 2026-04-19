import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    await db.execute("SELECT 1");
    logger.info("health_check_ok", {
      featureId: "health",
      data: { database: "connected" },
    });

    return NextResponse.json({
      status: "healthy",
      database: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("health_check_failed", {
      featureId: "health",
      error: error instanceof Error ? error.name : "UnknownError",
      data: {
        database: "disconnected",
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });

    return NextResponse.json(
      {
        status: "unhealthy",
        database: "disconnected",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
