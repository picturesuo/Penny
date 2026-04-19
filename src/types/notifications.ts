export const NOTIFICATION_CHANNELS = ["email", "in_app", "push"] as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_TYPES = [
  "revisit_queue_digest",
  "resolution_due_tomorrow",
  "resolution_overdue",
  "blind_spot_weekly",
  "feature_unlocked",
  "biography_chapter_ready",
  "shape_newly_confirmed",
  "session_start_suggestion",
  "calibration_milestone",
  "map_staleness_alert",
  "artifact_drift_detected",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_STATUSES = ["scheduled", "sent", "opened", "clicked", "failed", "suppressed"] as const;

export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export type NotificationSchedule = {
  daysOfWeek: number[];
  timeOfDay: string;
};

export type NotificationPreferences = {
  userId: string;
  emailEnabled: boolean;
  pushEnabled: boolean;
  inAppEnabled: boolean;
  revisitQueueDigest: "daily" | "every_3_days" | "weekly" | "off";
  resolutionReminders: "always" | "high_stakes_only" | "off";
  blindSpotDigest: "weekly" | "biweekly" | "off";
  featureUnlockAlerts: boolean;
  sessionStartSuggestion: "weekday_mornings" | "custom" | "off";
  customSchedule: NotificationSchedule | null;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  timezone: string;
};

export type Notification = {
  id: string;
  userId: string;
  notificationType: NotificationType;
  channel: NotificationChannel;
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  ctaLabel: string;
  ctaUrl: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  scheduledFor: Date;
  sentAt: Date | null;
  openedAt: Date | null;
  clickedAt: Date | null;
  status: NotificationStatus;
};

export type EmailTemplate = {
  subject: string;
  preview: string;
  bodyText: string;
  bodyHtml: string | null;
  ctaLabel: string;
  ctaUrl: string;
};
