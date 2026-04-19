import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/db/prisma";
import { getDemoThoughtUserId } from "@/lib/thought-map";
import {
  buildNotificationDispatches,
  defaultNotificationPreferences,
  normalizeNotificationPreferences,
  parseNotificationPreferences,
  type NotificationBuildContext,
} from "@/lib/notification-scheduler";
import { getThoughtMap } from "@/server/thought-map";
import type { ThoughtMapModel } from "@/types/thought-map";
import type { Notification, NotificationPreferences } from "@/types/notifications";

type NotificationPreferenceRow = {
  userId: string;
  preferencesJson: string;
  timezone: string;
};

type NotificationRecordRow = {
  id: string;
  userId: string;
  notificationType: string;
  channel: string;
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  ctaLabel: string;
  ctaUrl: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  scheduledFor: Date | string;
  sentAt: Date | string | null;
  openedAt: Date | string | null;
  clickedAt: Date | string | null;
  status: string;
};

function coerceDate(value: Date | string | null): Date | null {
  if (value == null) {
    return null;
  }

  return value instanceof Date ? value : new Date(value);
}

async function ensureNotificationTables() {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "NotificationPreference" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL UNIQUE,
      "preferencesJson" TEXT NOT NULL DEFAULT '{}',
      "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `;
  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "NotificationPreference_userId_updatedAt_idx"
    ON "NotificationPreference"("userId", "updatedAt")
  `;
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "NotificationRecord" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "notificationType" TEXT NOT NULL,
      "channel" TEXT NOT NULL,
      "subject" TEXT NOT NULL,
      "bodyText" TEXT NOT NULL,
      "bodyHtml" TEXT,
      "ctaLabel" TEXT NOT NULL,
      "ctaUrl" TEXT NOT NULL,
      "relatedEntityType" TEXT,
      "relatedEntityId" TEXT,
      "scheduledFor" DATETIME NOT NULL,
      "sentAt" DATETIME,
      "openedAt" DATETIME,
      "clickedAt" DATETIME,
      "status" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `;
  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "NotificationRecord_userId_status_scheduledFor_idx"
    ON "NotificationRecord"("userId", "status", "scheduledFor")
  `;
  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "NotificationRecord_userId_notificationType_scheduledFor_idx"
    ON "NotificationRecord"("userId", "notificationType", "scheduledFor")
  `;
  await prisma.$executeRaw`
    CREATE INDEX IF NOT EXISTS "NotificationRecord_relatedEntityType_relatedEntityId_idx"
    ON "NotificationRecord"("relatedEntityType", "relatedEntityId")
  `;
}

function mapNotificationRecord(record: NotificationRecordRow): Notification {
  return {
    id: record.id,
    userId: record.userId,
    notificationType: record.notificationType as Notification["notificationType"],
    channel: record.channel as Notification["channel"],
    subject: record.subject,
    bodyText: record.bodyText,
    bodyHtml: record.bodyHtml,
    ctaLabel: record.ctaLabel,
    ctaUrl: record.ctaUrl,
    relatedEntityType: record.relatedEntityType,
    relatedEntityId: record.relatedEntityId,
    scheduledFor: coerceDate(record.scheduledFor) ?? new Date(),
    sentAt: coerceDate(record.sentAt),
    openedAt: coerceDate(record.openedAt),
    clickedAt: coerceDate(record.clickedAt),
    status: record.status as Notification["status"],
  };
}

function mapNotificationPreference(record: NotificationPreferenceRow): NotificationPreferences {
  return parseNotificationPreferences(record.userId, record.preferencesJson, record.timezone);
}

async function loadThoughtMapsForUser(userId: string): Promise<ThoughtMapModel[]> {
  const ids = await prisma.thoughtMap.findMany({
    where: { userId },
    select: { id: true },
    orderBy: { updatedAt: "desc" },
  });

  const maps = await Promise.all(ids.map((entry) => getThoughtMap(entry.id)));
  return maps.flatMap((map) => (map ? [map] : []));
}

export async function listNotificationRecipientIds() {
  await ensureNotificationTables();

  const recipients = await prisma.$queryRaw<Array<{ userId: string }>>(Prisma.sql`
    SELECT DISTINCT userId
    FROM (
      SELECT "userId" AS userId FROM "ThoughtMap"
      UNION
      SELECT "userId" AS userId FROM "Session"
      UNION
      SELECT "userId" AS userId FROM "MarginFragment"
      UNION
      SELECT "userId" AS userId FROM "NotificationPreference"
      UNION
      SELECT "userId" AS userId FROM "NotificationRecord"
    )
    ORDER BY userId ASC
  `);

  return recipients.map((recipient) => recipient.userId);
}

export async function getNotificationPreferences(userId: string) {
  await ensureNotificationTables();

  const records = await prisma.$queryRaw<NotificationPreferenceRow[]>(Prisma.sql`
    SELECT "userId", "preferencesJson", "timezone"
    FROM "NotificationPreference"
    WHERE "userId" = ${userId}
    LIMIT 1
  `);

  const record = records[0] ?? null;
  if (!record) {
    return defaultNotificationPreferences(userId);
  }

  return mapNotificationPreference(record);
}

export async function saveNotificationPreferences(userId: string, preferences: NotificationPreferences) {
  await ensureNotificationTables();

  const normalized = normalizeNotificationPreferences(userId, preferences);
  const preferencesJson = JSON.stringify(normalized);

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "NotificationPreference" (
      "id",
      "userId",
      "preferencesJson",
      "timezone",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      ${randomUUID()},
      ${userId},
      ${preferencesJson},
      ${normalized.timezone},
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT("userId") DO UPDATE SET
      "preferencesJson" = ${preferencesJson},
      "timezone" = ${normalized.timezone},
      "updatedAt" = CURRENT_TIMESTAMP
  `);

  return getNotificationPreferences(userId);
}

export async function listNotificationRecords(userId?: string) {
  await ensureNotificationTables();

  const records = await prisma.$queryRaw<NotificationRecordRow[]>(Prisma.sql`
    SELECT
      "id",
      "userId",
      "notificationType",
      "channel",
      "subject",
      "bodyText",
      "bodyHtml",
      "ctaLabel",
      "ctaUrl",
      "relatedEntityType",
      "relatedEntityId",
      "scheduledFor",
      "sentAt",
      "openedAt",
      "clickedAt",
      "status"
    FROM "NotificationRecord"
    ${userId ? Prisma.sql`WHERE "userId" = ${userId}` : Prisma.empty}
    ORDER BY "scheduledFor" DESC, "createdAt" DESC
  `);

  return records.map(mapNotificationRecord);
}

export async function recordNotificationDeliveries(notifications: Notification[]) {
  if (!notifications.length) {
    return [];
  }

  await ensureNotificationTables();

  await prisma.$transaction(
    notifications.map((notification) =>
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "NotificationRecord" (
          "id",
          "userId",
          "notificationType",
          "channel",
          "subject",
          "bodyText",
          "bodyHtml",
          "ctaLabel",
          "ctaUrl",
          "relatedEntityType",
          "relatedEntityId",
          "scheduledFor",
          "sentAt",
          "openedAt",
          "clickedAt",
          "status",
          "createdAt",
          "updatedAt"
        )
        VALUES (
          ${notification.id},
          ${notification.userId},
          ${notification.notificationType},
          ${notification.channel},
          ${notification.subject},
          ${notification.bodyText},
          ${notification.bodyHtml},
          ${notification.ctaLabel},
          ${notification.ctaUrl},
          ${notification.relatedEntityType},
          ${notification.relatedEntityId},
          ${notification.scheduledFor},
          ${notification.sentAt},
          ${notification.openedAt},
          ${notification.clickedAt},
          ${notification.status},
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
      `),
    ),
  );

  return notifications;
}

export async function buildNotificationDispatchesForUser(userId: string, now = new Date()) {
  const preferences = await getNotificationPreferences(userId);
  const maps = await loadThoughtMapsForUser(userId);
  const existingNotifications = await listNotificationRecords(userId);
  const activeSessionCount = await prisma.session.count({
    where: {
      userId,
      status: "active",
    },
  });

  const buildContext: NotificationBuildContext = {
    userId,
    userFirstName: "there",
    preferences,
    maps,
    existingNotifications,
    activeSessionCount,
    now,
  };

  return buildNotificationDispatches(buildContext);
}

export async function buildNotificationDispatchesForDemoUser(now = new Date()) {
  return buildNotificationDispatchesForUser(getDemoThoughtUserId(), now);
}
