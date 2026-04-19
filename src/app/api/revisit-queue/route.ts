import { NextResponse } from "next/server";
import { prisma } from "@/db/prisma";
import { buildRevisitQueue } from "@/lib/revisit-scheduler";
import { getThoughtMap } from "@/server/thought-map";
import { getRequestUserId, normalizeError, reportError } from "@/lib/error-reporting";

export async function GET(request: Request) {
  try {
    const maps = await prisma.thoughtMap.findMany({
      select: { id: true },
      orderBy: { updatedAt: "desc" },
    });

    const hydratedMaps = await Promise.all(maps.map((map) => getThoughtMap(map.id)));
    const queue = hydratedMaps
      .filter((map): map is NonNullable<typeof map> => map !== null)
      .flatMap((map) => buildRevisitQueue(map))
      .sort((a, b) => {
        const priorityWeight = (priority: "low" | "medium" | "high" | "urgent") =>
          priority === "urgent" ? 4 : priority === "high" ? 3 : priority === "medium" ? 2 : 1;

        return priorityWeight(b.schedule.priority) - priorityWeight(a.schedule.priority) || a.schedule.scheduledFor.getTime() - b.schedule.scheduledFor.getTime();
      })
      .slice(0, 5);

    return NextResponse.json(
      {
        queue,
      },
      { status: 200 },
    );
  } catch (error) {
    reportError(normalizeError(error), {
      userId: getRequestUserId({ path: new URL(request.url).pathname, headers: request.headers }),
      requestPath: request.url,
      requestMethod: request.method,
      featureId: "revisit-queue",
    });

    return NextResponse.json(
      {
        error: "internal_error",
      },
      { status: 500 },
    );
  }
}
