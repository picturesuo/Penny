import { NextResponse } from "next/server";
import { z } from "zod";
import { buildNotificationDispatchesForUser, listNotificationRecipientIds, recordNotificationDeliveries } from "@/server/notifications";
import { getRequestUserId, normalizeError, reportError } from "@/lib/error-reporting";
import type { Notification } from "@/types/notifications";

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
    const finalUserIds = payload.userId ? [payload.userId] : await listNotificationRecipientIds();
    const results = [];
    let generated = 0;
    let suppressed = 0;

    for (const userId of finalUserIds) {
      const notifications = await buildNotificationDispatchesForUser(userId, now);
      const finalized: Notification[] = notifications.map((notification): Notification => ({
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

    reportError(normalizeError(error), {
      userId: getRequestUserId({ path: new URL(request.url).pathname, headers: request.headers }),
      requestPath: request.url,
      requestMethod: request.method,
      featureId: "notifications-send",
    });

    return NextResponse.json(
      {
        error: "internal_error",
      },
      { status: 500 },
    );
  }
}
