import { NextResponse } from "next/server";
import { z } from "zod";
import { getNotificationPreferences, saveNotificationPreferences } from "@/server/notifications";
import { getRequestUserId, normalizeError, reportError } from "@/lib/error-reporting";
import { NotificationPreferencesSchema, UserParamsSchema } from "@/lib/validation/schemas";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = UserParamsSchema.parse(await context.params);
  const preferences = await getNotificationPreferences(id);

  return NextResponse.json({ preferences });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = UserParamsSchema.parse(await context.params);
    const payload = NotificationPreferencesSchema.parse(await request.json());
    const preferences = await saveNotificationPreferences(id, {
      userId: id,
      emailEnabled: payload.emailEnabled,
      pushEnabled: payload.pushEnabled,
      inAppEnabled: payload.inAppEnabled,
      revisitQueueDigest: payload.revisitQueueDigest,
      resolutionReminders: payload.resolutionReminders,
      blindSpotDigest: payload.blindSpotDigest,
      featureUnlockAlerts: payload.featureUnlockAlerts,
      sessionStartSuggestion: payload.sessionStartSuggestion,
      customSchedule: payload.customSchedule,
      quietHoursEnabled: payload.quietHoursEnabled,
      quietHoursStart: payload.quietHoursStart,
      quietHoursEnd: payload.quietHoursEnd,
      timezone: payload.timezone,
    });

    return NextResponse.json({ preferences }, { status: 201 });
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

    reportError(normalizeError(error), {
      userId: getRequestUserId({ path: new URL(request.url).pathname, headers: request.headers }),
      requestPath: request.url,
      requestMethod: request.method,
      featureId: "notification-preferences",
    });

    return NextResponse.json(
      {
        error: "internal_error",
      },
      { status: 500 },
    );
  }
}
