import { buildBlindSpotMap, buildCalibrationDashboard, buildMemoryTimeDashboard, derivePennyShapes } from "@/lib/penny-insights";
import { buildBlindSpotDigestEmail, buildRevisitQueueEmail, buildResolutionDueEmail, type RevisitQueueEmailItem, type ResolutionReminderClaim } from "@/lib/notification-templates";
import { buildRevisitQueue } from "@/lib/revisit-scheduler";
import { randomUUID } from "node:crypto";
import type { ThoughtMapModel } from "@/types/thought-map";
import type {
  EmailTemplate,
  Notification,
  NotificationChannel,
  NotificationPreferences,
  NotificationSchedule,
  NotificationStatus,
  NotificationType,
} from "@/types/notifications";

export const DEFAULT_NOTIFICATION_TIMEZONE = "America/New_York";

export function defaultNotificationPreferences(userId: string, timezone = DEFAULT_NOTIFICATION_TIMEZONE): NotificationPreferences {
  return {
    userId,
    emailEnabled: true,
    pushEnabled: false,
    inAppEnabled: true,
    revisitQueueDigest: "daily",
    resolutionReminders: "always",
    blindSpotDigest: "weekly",
    featureUnlockAlerts: true,
    sessionStartSuggestion: "weekday_mornings",
    customSchedule: null,
    quietHoursEnabled: false,
    quietHoursStart: "22:00",
    quietHoursEnd: "08:00",
    timezone,
  };
}

export function normalizeNotificationPreferences(
  userId: string,
  preferences: Partial<NotificationPreferences> | null | undefined,
  timezoneFallback = DEFAULT_NOTIFICATION_TIMEZONE,
): NotificationPreferences {
  const defaults = defaultNotificationPreferences(userId, preferences?.timezone ?? timezoneFallback);

  return {
    userId,
    emailEnabled: preferences?.emailEnabled ?? defaults.emailEnabled,
    pushEnabled: preferences?.pushEnabled ?? defaults.pushEnabled,
    inAppEnabled: preferences?.inAppEnabled ?? defaults.inAppEnabled,
    revisitQueueDigest: preferences?.revisitQueueDigest ?? defaults.revisitQueueDigest,
    resolutionReminders: preferences?.resolutionReminders ?? defaults.resolutionReminders,
    blindSpotDigest: preferences?.blindSpotDigest ?? defaults.blindSpotDigest,
    featureUnlockAlerts: preferences?.featureUnlockAlerts ?? defaults.featureUnlockAlerts,
    sessionStartSuggestion: preferences?.sessionStartSuggestion ?? defaults.sessionStartSuggestion,
    customSchedule: preferences?.customSchedule ?? defaults.customSchedule,
    quietHoursEnabled: preferences?.quietHoursEnabled ?? defaults.quietHoursEnabled,
    quietHoursStart: preferences?.quietHoursStart ?? defaults.quietHoursStart,
    quietHoursEnd: preferences?.quietHoursEnd ?? defaults.quietHoursEnd,
    timezone: preferences?.timezone ?? defaults.timezone,
  };
}

export function parseNotificationPreferences(userId: string, raw: string | null | undefined, timezoneFallback = DEFAULT_NOTIFICATION_TIMEZONE) {
  if (!raw) {
    return defaultNotificationPreferences(userId, timezoneFallback);
  }

  try {
    const parsed = JSON.parse(raw) as Partial<NotificationPreferences>;
    return normalizeNotificationPreferences(userId, parsed, timezoneFallback);
  } catch {
    return defaultNotificationPreferences(userId, timezoneFallback);
  }
}

function getLocalDateParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const valueFor = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const weekday = valueFor("weekday");
  const hour = Number.parseInt(valueFor("hour"), 10);
  const minute = Number.parseInt(valueFor("minute"), 10);

  return {
    weekday,
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

function minutesSinceMidnight(date: Date, timeZone: string) {
  const { hour, minute } = getLocalDateParts(date, timeZone);
  return hour * 60 + minute;
}

function parseTimeOfDay(value: string) {
  const [hourPart, minutePart] = value.split(":");
  const hour = Number.parseInt(hourPart ?? "0", 10);
  const minute = Number.parseInt(minutePart ?? "0", 10);
  return {
    hour: Number.isFinite(hour) ? Math.max(0, Math.min(23, hour)) : 0,
    minute: Number.isFinite(minute) ? Math.max(0, Math.min(59, minute)) : 0,
  };
}

function weekdayIndex(weekday: string) {
  switch (weekday) {
    case "Sun":
      return 0;
    case "Mon":
      return 1;
    case "Tue":
      return 2;
    case "Wed":
      return 3;
    case "Thu":
      return 4;
    case "Fri":
      return 5;
    case "Sat":
      return 6;
    default:
      return 0;
  }
}

function isQuietHours(now: Date, preferences: NotificationPreferences) {
  if (!preferences.quietHoursEnabled) {
    return false;
  }

  const currentMinutes = minutesSinceMidnight(now, preferences.timezone);
  const start = parseTimeOfDay(preferences.quietHoursStart);
  const end = parseTimeOfDay(preferences.quietHoursEnd);
  const startMinutes = start.hour * 60 + start.minute;
  const endMinutes = end.hour * 60 + end.minute;

  if (startMinutes === endMinutes) {
    return true;
  }

  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

function matchesCustomSchedule(now: Date, schedule: NotificationSchedule | null, timeZone: string) {
  if (!schedule || !schedule.daysOfWeek.length) {
    return false;
  }

  const { weekday, hour, minute } = getLocalDateParts(now, timeZone);
  return schedule.daysOfWeek.includes(weekdayIndex(weekday)) && schedule.timeOfDay === `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
}

function cadenceDays(cadence: NotificationPreferences["revisitQueueDigest"] | NotificationPreferences["blindSpotDigest"]) {
  switch (cadence) {
    case "every_3_days":
      return 3;
    case "biweekly":
      return 14;
    case "weekly":
      return 7;
    case "daily":
      return 1;
    default:
      return null;
  }
}

function daysSince(date: Date, now: Date) {
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
}

function hoursSince(date: Date, now: Date) {
  return (now.getTime() - date.getTime()) / (1000 * 60 * 60);
}

function enabledChannels(preferences: NotificationPreferences): NotificationChannel[] {
  const channels: NotificationChannel[] = [];

  if (preferences.emailEnabled) channels.push("email");
  if (preferences.inAppEnabled) channels.push("in_app");
  if (preferences.pushEnabled) channels.push("push");

  return channels;
}

function lastSentNotification(
  existingNotifications: Notification[],
  notificationType: NotificationType,
  relatedEntityId?: string | null,
) {
  return existingNotifications
    .filter((notification) => notification.notificationType === notificationType)
    .filter((notification) => relatedEntityId == null || notification.relatedEntityId === relatedEntityId)
    .sort((a, b) => (b.sentAt?.getTime() ?? b.scheduledFor.getTime()) - (a.sentAt?.getTime() ?? a.scheduledFor.getTime()))[0] ?? null;
}

function shouldSendCadence(
  existingNotifications: Notification[],
  notificationType: NotificationType,
  cadence: "daily" | "every_3_days" | "weekly" | "biweekly",
  now: Date,
  relatedEntityId?: string | null,
) {
  const lastSent = lastSentNotification(existingNotifications, notificationType, relatedEntityId);
  if (!lastSent) {
    return true;
  }

  const threshold = cadenceDays(cadence);
  if (threshold == null) {
    return true;
  }

  return daysSince(lastSent.sentAt ?? lastSent.scheduledFor, now) >= threshold;
}

function shouldSendResolutionReminder(
  existingNotifications: Notification[],
  notificationType: NotificationType,
  claimId: string,
  now: Date,
) {
  const lastSent = lastSentNotification(existingNotifications, notificationType, claimId);
  if (!lastSent) {
    return true;
  }

  return hoursSince(lastSent.sentAt ?? lastSent.scheduledFor, now) >= 20;
}

function notificationTemplateToDraft(params: {
  userId: string;
  notificationType: NotificationType;
  channel: NotificationChannel;
  template: EmailTemplate;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  scheduledFor: Date;
  status: NotificationStatus;
}): Notification {
  return {
    id: randomUUID(),
    userId: params.userId,
    notificationType: params.notificationType,
    channel: params.channel,
    subject: params.template.subject,
    bodyText: params.template.bodyText,
    bodyHtml: params.template.bodyHtml,
    ctaLabel: params.template.ctaLabel,
    ctaUrl: params.template.ctaUrl,
    relatedEntityType: params.relatedEntityType,
    relatedEntityId: params.relatedEntityId,
    scheduledFor: params.scheduledFor,
    sentAt: null,
    openedAt: null,
    clickedAt: null,
    status: params.status,
  };
}

function buildFeatureUnlockedTemplate(userFirstName: string, unlockedCount: number): EmailTemplate {
  return {
    subject: "Penny notifications are on",
    preview: "Penny can now keep nudging you outside the app.",
    bodyText: [
      `${userFirstName},`,
      `Notifications are enabled and Penny can now nudge you when claims, blind spots, and reminders need attention.`,
      `You already have ${unlockedCount} map${unlockedCount === 1 ? "" : "s"} in the graph.`,
      "Open the dashboard to review the active queues.",
    ].join("\n"),
    bodyHtml: `
      <p>${userFirstName},</p>
      <p>Notifications are enabled and Penny can now nudge you when claims, blind spots, and reminders need attention.</p>
      <p>You already have ${unlockedCount} map${unlockedCount === 1 ? "" : "s"} in the graph.</p>
      <p><a href="/app" style="display:inline-block;border-radius:999px;background:#22272e;color:#fff;padding:10px 16px;text-decoration:none;font-size:13px;font-weight:600;">Open the dashboard</a></p>
    `,
    ctaLabel: "Open dashboard",
    ctaUrl: "/app",
  };
}

function buildSessionStartTemplate(userFirstName: string, activeSessionCount: number): EmailTemplate {
  return {
    subject: "Start a focused Penny session",
    preview: activeSessionCount > 0 ? "You already have an active session in progress." : "A morning session could keep the day anchored.",
    bodyText: [
      `${userFirstName},`,
      activeSessionCount > 0
        ? `You already have ${activeSessionCount} active session${activeSessionCount === 1 ? "" : "s"}.`
        : "This looks like a good moment to start a focused session and keep the day anchored.",
      "Open Penny and start with one claim, one question, or one decision.",
    ].join("\n"),
    bodyHtml: `
      <p>${userFirstName},</p>
      <p>${activeSessionCount > 0 ? `You already have ${activeSessionCount} active session${activeSessionCount === 1 ? "" : "s"}.` : "This looks like a good moment to start a focused session and keep the day anchored."}</p>
      <p>Open Penny and start with one claim, one question, or one decision.</p>
      <p><a href="/app/new" style="display:inline-block;border-radius:999px;background:#22272e;color:#fff;padding:10px 16px;text-decoration:none;font-size:13px;font-weight:600;">Start a session</a></p>
    `,
    ctaLabel: "Start a session",
    ctaUrl: "/app/new",
  };
}

function buildCalibrationMilestoneTemplate(userFirstName: string, resolvedClaims: number, averageBrierScore: number | null): EmailTemplate {
  return {
    subject: "Calibration milestone reached",
    preview: `${resolvedClaims} resolved claims are now in the calibration loop.`,
    bodyText: [
      `${userFirstName},`,
      `You have ${resolvedClaims} resolved claim${resolvedClaims === 1 ? "" : "s"} feeding the calibration loop.`,
      averageBrierScore != null ? `Average Brier score across the resolved set: ${averageBrierScore.toFixed(3)}.` : "There is enough structure here to keep the calibration loop active.",
      "Open the dashboard to review the live coaching surfaces.",
    ].join("\n"),
    bodyHtml: `
      <p>${userFirstName},</p>
      <p>You have ${resolvedClaims} resolved claim${resolvedClaims === 1 ? "" : "s"} feeding the calibration loop.</p>
      ${averageBrierScore != null ? `<p>Average Brier score across the resolved set: ${averageBrierScore.toFixed(3)}.</p>` : ""}
      <p><a href="/app" style="display:inline-block;border-radius:999px;background:#22272e;color:#fff;padding:10px 16px;text-decoration:none;font-size:13px;font-weight:600;">Open the dashboard</a></p>
    `,
    ctaLabel: "Open dashboard",
    ctaUrl: "/app",
  };
}

function buildMapStalenessTemplate(userFirstName: string, staleCount: number, oldestTitle: string): EmailTemplate {
  return {
    subject: "Some maps have gone stale",
    preview: oldestTitle,
    bodyText: [
      `${userFirstName},`,
      `${staleCount} map${staleCount === 1 ? "" : "s"} have not been updated recently enough to trust the current shape.`,
      `The oldest stale map is ${oldestTitle}.`,
      "Open the dashboard to revisit the queue.",
    ].join("\n"),
    bodyHtml: `
      <p>${userFirstName},</p>
      <p>${staleCount} map${staleCount === 1 ? "" : "s"} have not been updated recently enough to trust the current shape.</p>
      <p>The oldest stale map is <strong>${oldestTitle}</strong>.</p>
      <p><a href="/app" style="display:inline-block;border-radius:999px;background:#22272e;color:#fff;padding:10px 16px;text-decoration:none;font-size:13px;font-weight:600;">Revisit the dashboard</a></p>
    `,
    ctaLabel: "Revisit dashboard",
    ctaUrl: "/app",
  };
}

function buildBiographyChapterTemplate(userFirstName: string, updatedCount: number): EmailTemplate {
  return {
    subject: "A new chapter in your thinking is ready",
    preview: `${updatedCount} recent belief updates are ready for reflection.`,
    bodyText: [
      `${userFirstName},`,
      `A new chapter is ready: ${updatedCount} belief digest${updatedCount === 1 ? "" : "s"} are waiting for reflection.`,
      "Open the memory and time surface to trace what changed.",
    ].join("\n"),
    bodyHtml: `
      <p>${userFirstName},</p>
      <p>A new chapter is ready: ${updatedCount} belief digest${updatedCount === 1 ? "" : "s"} are waiting for reflection.</p>
      <p><a href="/app#memory-time" style="display:inline-block;border-radius:999px;background:#22272e;color:#fff;padding:10px 16px;text-decoration:none;font-size:13px;font-weight:600;">Review the chapter</a></p>
    `,
    ctaLabel: "Review chapter",
    ctaUrl: "/app#memory-time",
  };
}

function buildShapeConfirmedTemplate(userFirstName: string, shapeLabel: string): EmailTemplate {
  return {
    subject: `A shape is getting clearer: ${shapeLabel}`,
    preview: `Penny found a newly stable pattern: ${shapeLabel}.`,
    bodyText: [
      `${userFirstName},`,
      `Penny found a newly stable pattern: ${shapeLabel}.`,
      "Open the dashboard to see how the shape is changing the lens.",
    ].join("\n"),
    bodyHtml: `
      <p>${userFirstName},</p>
      <p>Penny found a newly stable pattern: <strong>${shapeLabel}</strong>.</p>
      <p><a href="/app" style="display:inline-block;border-radius:999px;background:#22272e;color:#fff;padding:10px 16px;text-decoration:none;font-size:13px;font-weight:600;">Open the dashboard</a></p>
    `,
    ctaLabel: "Open dashboard",
    ctaUrl: "/app",
  };
}

function buildArtifactDriftTemplate(userFirstName: string, title: string): EmailTemplate {
  return {
    subject: "Artifact drift detected",
    preview: title,
    bodyText: [
      `${userFirstName},`,
      `The artifact "${title}" is drifting away from its supporting claims.`,
      "Open the map to review the load-bearing structure.",
    ].join("\n"),
    bodyHtml: `
      <p>${userFirstName},</p>
      <p>The artifact <strong>${title}</strong> is drifting away from its supporting claims.</p>
      <p><a href="/app" style="display:inline-block;border-radius:999px;background:#22272e;color:#fff;padding:10px 16px;text-decoration:none;font-size:13px;font-weight:600;">Review the artifact</a></p>
    `,
    ctaLabel: "Review artifact",
    ctaUrl: "/app",
  };
}

function buildFeatureTypeNotification(
  params: {
    userId: string;
    notificationType: NotificationType;
    template: EmailTemplate;
    relatedEntityType: string | null;
    relatedEntityId: string | null;
    channels: NotificationChannel[];
    scheduledFor: Date;
    status: NotificationStatus;
  },
) {
  return params.channels.map((channel) =>
    notificationTemplateToDraft({
      userId: params.userId,
      notificationType: params.notificationType,
      channel,
      template: params.template,
      relatedEntityType: params.relatedEntityType,
      relatedEntityId: params.relatedEntityId,
      scheduledFor: params.scheduledFor,
      status: params.status,
    }),
  );
}

function buildResolutionReminderNotifications(params: {
  userId: string;
  claim: ResolutionReminderClaim;
  userFirstName: string;
  daysUntilDue: number;
  channels: NotificationChannel[];
  scheduledFor: Date;
  status: NotificationStatus;
}) {
  const notificationType = params.daysUntilDue <= 0 ? "resolution_overdue" : "resolution_due_tomorrow";
  const template = buildResolutionDueEmail(params.claim, params.userFirstName, params.daysUntilDue);

  return params.channels.map((channel) =>
    notificationTemplateToDraft({
      userId: params.userId,
      notificationType,
      channel,
      template,
      relatedEntityType: "claim",
      relatedEntityId: params.claim.id,
      scheduledFor: params.scheduledFor,
      status: params.status,
    }),
  );
}

function buildRevisitDigestNotifications(params: {
  userId: string;
  userFirstName: string;
  items: RevisitQueueEmailItem[];
  channels: NotificationChannel[];
  scheduledFor: Date;
  status: NotificationStatus;
}) {
  const template = buildRevisitQueueEmail(params.userId, params.items, params.userFirstName);
  return params.channels.map((channel) =>
    notificationTemplateToDraft({
      userId: params.userId,
      notificationType: "revisit_queue_digest",
      channel,
      template,
      relatedEntityType: "revisit_queue",
      relatedEntityId: null,
      scheduledFor: params.scheduledFor,
      status: params.status,
    }),
  );
}

function buildBlindSpotDigestNotifications(params: {
  userId: string;
  userFirstName: string;
  blindSpotMap: ReturnType<typeof buildBlindSpotMap>;
  channels: NotificationChannel[];
  scheduledFor: Date;
  status: NotificationStatus;
}) {
  const template = buildBlindSpotDigestEmail(params.blindSpotMap, params.userFirstName);
  return params.channels.map((channel) =>
    notificationTemplateToDraft({
      userId: params.userId,
      notificationType: "blind_spot_weekly",
      channel,
      template,
      relatedEntityType: "blind_spot_map",
      relatedEntityId: params.userId,
      scheduledFor: params.scheduledFor,
      status: params.status,
    }),
  );
}

function buildSessionSuggestionNotifications(params: {
  userId: string;
  userFirstName: string;
  activeSessionCount: number;
  channels: NotificationChannel[];
  scheduledFor: Date;
  status: NotificationStatus;
}) {
  const template = buildSessionStartTemplate(params.userFirstName, params.activeSessionCount);
  return params.channels.map((channel) =>
    notificationTemplateToDraft({
      userId: params.userId,
      notificationType: "session_start_suggestion",
      channel,
      template,
      relatedEntityType: "session",
      relatedEntityId: null,
      scheduledFor: params.scheduledFor,
      status: params.status,
    }),
  );
}

export interface NotificationBuildContext {
  userId: string;
  userFirstName?: string;
  preferences: NotificationPreferences;
  maps: ThoughtMapModel[];
  existingNotifications?: Notification[];
  activeSessionCount?: number;
  now?: Date;
}

export function buildNotificationDispatches(context: NotificationBuildContext) {
  const now = context.now ?? new Date();
  const existingNotifications = context.existingNotifications ?? [];
  const userFirstName = context.userFirstName ?? "there";
  const channels = enabledChannels(context.preferences);

  if (!channels.length) {
    return [] as Notification[];
  }

  const quietHours = isQuietHours(now, context.preferences);
  const status: NotificationStatus = quietHours ? "suppressed" : "scheduled";
  const notifications: Notification[] = [];
  const calibration = buildCalibrationDashboard(context.maps);
  const memoryTime = buildMemoryTimeDashboard(context.maps);
  const blindSpotMap = buildBlindSpotMap(context.maps, context.userId);
  const allNodes = context.maps.flatMap((map) => map.nodes);
  const shapes = derivePennyShapes(allNodes).sort((a, b) => b.confidence - a.confidence);
  const revisitQueueItems = context.maps.flatMap((map) =>
    buildRevisitQueue(map).slice(0, 3).map(
      (item): RevisitQueueEmailItem => ({
        claimId: item.claim.id,
        mapId: item.schedule.mapId,
        claimText: item.claim.content,
        currentConfidence: Math.round(item.claim.scores?.confidence ?? 0),
        schedulingReason: {
          description: item.schedule.schedulingReason.description,
        },
      }),
    ),
  );

  if (
    context.preferences.revisitQueueDigest !== "off" &&
    revisitQueueItems.length &&
    shouldSendCadence(existingNotifications, "revisit_queue_digest", context.preferences.revisitQueueDigest, now)
  ) {
    notifications.push(
      ...buildRevisitDigestNotifications({
        userId: context.userId,
        userFirstName,
        items: revisitQueueItems.slice(0, 3),
        channels,
        scheduledFor: now,
        status,
      }),
    );
  }

  const dueResolutionClaims = calibration.privateBets
    .map((bet) => ({
      id: bet.mapId,
      mapId: bet.mapId,
      claimText: bet.title,
      confidence: bet.confidence,
      resolutionDate: bet.resolutionDate,
      status: bet.status,
    }))
    .filter((claim) => {
      const resolutionDate = new Date(claim.resolutionDate);
      if (Number.isNaN(resolutionDate.getTime())) {
        return false;
      }

      const daysUntilDue = daysSince(now, resolutionDate);
      return daysUntilDue <= 1;
    })
    .sort((a, b) => new Date(a.resolutionDate).getTime() - new Date(b.resolutionDate).getTime())
    .slice(0, 3);

  for (const claim of dueResolutionClaims) {
    const resolutionDate = new Date(claim.resolutionDate);
    const daysUntilDue = daysSince(now, resolutionDate);
    const reminderType: NotificationType = daysUntilDue < 0 ? "resolution_overdue" : "resolution_due_tomorrow";

    if (context.preferences.resolutionReminders === "off") {
      continue;
    }

    if (context.preferences.resolutionReminders === "high_stakes_only" && !calibration.privateBets.find((bet) => bet.mapId === claim.id && bet.stakes.length > 0)) {
      continue;
    }

    if (!shouldSendResolutionReminder(existingNotifications, reminderType, claim.id, now)) {
      continue;
    }

    notifications.push(
      ...buildResolutionReminderNotifications({
        userId: context.userId,
        claim,
        userFirstName,
        daysUntilDue,
        channels,
        scheduledFor: now,
        status,
      }),
    );
  }

  if (
    context.preferences.blindSpotDigest !== "off" &&
    (context.preferences.blindSpotDigest === "weekly" || context.preferences.blindSpotDigest === "biweekly") &&
    shouldSendCadence(existingNotifications, "blind_spot_weekly", context.preferences.blindSpotDigest, now)
  ) {
    notifications.push(
      ...buildBlindSpotDigestNotifications({
        userId: context.userId,
        userFirstName,
        blindSpotMap,
        channels,
        scheduledFor: now,
        status,
      }),
    );
  }

  if (context.preferences.featureUnlockAlerts && !lastSentNotification(existingNotifications, "feature_unlocked")) {
    notifications.push(
      ...buildFeatureTypeNotification({
        userId: context.userId,
        notificationType: "feature_unlocked",
        template: buildFeatureUnlockedTemplate(userFirstName, context.maps.length),
        relatedEntityType: "user",
        relatedEntityId: context.userId,
        channels,
        scheduledFor: now,
        status,
      }),
    );
  }

  if (
    context.preferences.sessionStartSuggestion !== "off" &&
    (context.activeSessionCount ?? 0) === 0 &&
    !lastSentNotification(existingNotifications, "session_start_suggestion")
  ) {
    const isWeekdayMorning = (() => {
      const { weekday, hour } = getLocalDateParts(now, context.preferences.timezone);
      return weekdayIndex(weekday) >= 1 && weekdayIndex(weekday) <= 5 && hour >= 7 && hour < 11;
    })();

    const customMatches = context.preferences.sessionStartSuggestion === "custom" && matchesCustomSchedule(now, context.preferences.customSchedule, context.preferences.timezone);
    const weekdayMorningAllowed = context.preferences.sessionStartSuggestion === "weekday_mornings" && isWeekdayMorning;

    if (customMatches || weekdayMorningAllowed) {
      notifications.push(
        ...buildSessionSuggestionNotifications({
          userId: context.userId,
          userFirstName,
          activeSessionCount: context.activeSessionCount ?? 0,
          channels,
          scheduledFor: now,
          status,
        }),
      );
    }
  }

  if (calibration.resolvedClaims.length >= 3 && !lastSentNotification(existingNotifications, "calibration_milestone")) {
    const averageBrierScore = memoryTime.predictionRetrospectives.length
      ? memoryTime.predictionRetrospectives.reduce((sum, item) => sum + (item.brierScore ?? 0), 0) / memoryTime.predictionRetrospectives.length
      : null;

    notifications.push(
      ...buildFeatureTypeNotification({
        userId: context.userId,
        notificationType: "calibration_milestone",
        template: buildCalibrationMilestoneTemplate(userFirstName, calibration.resolvedClaims.length, averageBrierScore),
        relatedEntityType: "calibration",
        relatedEntityId: context.userId,
        channels,
        scheduledFor: now,
        status,
      }),
    );
  }

  const staleMaps = context.maps
    .filter((map) => daysSince(map.updatedAt, now) >= 14)
    .sort((a, b) => daysSince(b.updatedAt, now) - daysSince(a.updatedAt, now));

  if (staleMaps.length && !lastSentNotification(existingNotifications, "map_staleness_alert")) {
    notifications.push(
      ...buildFeatureTypeNotification({
        userId: context.userId,
        notificationType: "map_staleness_alert",
        template: buildMapStalenessTemplate(userFirstName, staleMaps.length, staleMaps[0]?.title ?? "an older map"),
        relatedEntityType: "map",
        relatedEntityId: staleMaps[0]?.id ?? null,
        channels,
        scheduledFor: now,
        status,
      }),
    );
  }

  if (memoryTime.beliefDigests.length >= 1 && !lastSentNotification(existingNotifications, "biography_chapter_ready")) {
    notifications.push(
      ...buildFeatureTypeNotification({
        userId: context.userId,
        notificationType: "biography_chapter_ready",
        template: buildBiographyChapterTemplate(userFirstName, memoryTime.beliefDigests.length),
        relatedEntityType: "memory_time",
        relatedEntityId: context.userId,
        channels,
        scheduledFor: now,
        status,
      }),
    );
  }

  if (shapes.length && shapes[0]!.confidence >= 90 && !lastSentNotification(existingNotifications, "shape_newly_confirmed")) {
    notifications.push(
      ...buildFeatureTypeNotification({
        userId: context.userId,
        notificationType: "shape_newly_confirmed",
        template: buildShapeConfirmedTemplate(userFirstName, shapes[0]!.label),
        relatedEntityType: "shape",
        relatedEntityId: shapes[0]!.id,
        channels,
        scheduledFor: now,
        status,
      }),
    );
  }

  const driftedArtifact = memoryTime.decisionInfluence[0];
  if (driftedArtifact && !lastSentNotification(existingNotifications, "artifact_drift_detected", driftedArtifact.mapId)) {
    notifications.push(
      ...buildFeatureTypeNotification({
        userId: context.userId,
        notificationType: "artifact_drift_detected",
        template: buildArtifactDriftTemplate(userFirstName, driftedArtifact.title),
        relatedEntityType: "artifact",
        relatedEntityId: driftedArtifact.mapId,
        channels,
        scheduledFor: now,
        status,
      }),
    );
  }

  return notifications;
}

export function notificationStatusForDelivery(notification: Notification) {
  return notification.status === "suppressed" ? "suppressed" : "sent";
}
