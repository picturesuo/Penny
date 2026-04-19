import { NextResponse } from "next/server";
import { z } from "zod";
import { getNotificationPreferences, saveNotificationPreferences } from "@/server/notifications";

const scheduleSchema = z.object({
  daysOfWeek: z.array(z.number().int().min(0).max(6)).default([]),
  timeOfDay: z.string().regex(/^\d{2}:\d{2}$/),
});

const notificationPreferencesSchema = z.object({
  emailEnabled: z.boolean(),
  pushEnabled: z.boolean(),
  inAppEnabled: z.boolean(),
  revisitQueueDigest: z.enum(["daily", "every_3_days", "weekly", "off"]),
  resolutionReminders: z.enum(["always", "high_stakes_only", "off"]),
  blindSpotDigest: z.enum(["weekly", "biweekly", "off"]),
  featureUnlockAlerts: z.boolean(),
  sessionStartSuggestion: z.enum(["weekday_mornings", "custom", "off"]),
  customSchedule: scheduleSchema.nullable(),
  quietHoursEnabled: z.boolean(),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/),
  timezone: z.string().min(1),
});

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const preferences = await getNotificationPreferences(id);

  return NextResponse.json({ preferences });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const payload = notificationPreferencesSchema.parse(await request.json());
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

    return NextResponse.json(
      {
        error: "internal_error",
      },
      { status: 500 },
    );
  }
}
