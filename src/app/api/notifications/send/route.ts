import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/db/prisma";
import { getDemoThoughtUserId } from "@/lib/thought-map";
import { buildNotificationDispatchesForUser, recordNotificationDeliveries } from "@/server/notifications";

const sendNotificationsSchema = z.object({
  userId: z.string().min(1).optional(),
  now: z.coerce.date().optional(),
  dryRun: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const text = await request.text();
    const payload = text.trim().length ? sendNotificationsSchema.parse(JSON.parse(text)) : sendNotificationsSchema.parse({});
    const now = payload.now ?? new Date();

    const userIds =
      payload.userId != null
        ? [payload.userId]
        : (await prisma.notificationPreference.findMany({ select: { userId: true }, orderBy: { updatedAt: "desc" } })).map((entry) => entry.userId);

    const effectiveUserIds = userIds.length ? userIds : [getDemoThoughtUserId()];
    const results = [];
    let generated = 0;
    let suppressed = 0;

    for (const userId of effectiveUserIds) {
      const notifications = await buildNotificationDispatchesForUser(userId, now);
      const finalized = notifications.map((notification) => ({
        ...notification,
        sentAt: notification.status === "suppressed" ? null : now,
        status: notification.status === "suppressed" ? "suppressed" : "sent",
      }));

      generated += finalized.filter((notification) => notification.status === "sent").length;
      suppressed += finalized.filter((notification) => notification.status === "suppressed").length;

      if (!payload.dryRun) {
        await recordNotificationDeliveries(finalized);
      }

      results.push({
        userId,
        notifications: finalized,
      });
    }

    return NextResponse.json(
      {
        generated,
        suppressed,
        results,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json(
        {
          error: "invalid_request",
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error: "internal_error",
      },
      { status: 500 },
    );
  }
}
