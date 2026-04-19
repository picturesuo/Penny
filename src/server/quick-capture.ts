import { randomUUID } from "node:crypto";
import { prisma } from "@/db/prisma";
import { DEMO_USER_ID, cleanSentence } from "@/lib/penny";
import {
  parseQuickCaptureContextSnapshot,
  type QuickCapture,
  type QuickCaptureContextSnapshot,
  type QuickCaptureCreateInput,
  type QuickCaptureUpdateInput,
} from "@/types/quick-capture";

type QuickCaptureRow = {
  id: string;
  userId: string;
  sourceSessionId: string | null;
  sourceMapId: string | null;
  sphere: string;
  content: string;
  contextSnapshot: string;
  status: string;
  priority: number;
  surfaceCount: number;
  lastSurfacedAt: Date | null;
  promotedAt: Date | null;
  archivedAt: Date | null;
  mergedInto: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toDate(value: string | Date | null | undefined) {
  if (value == null) {
    return null;
  }

  return value instanceof Date ? value : new Date(value);
}

function buildContextSnapshot(
  currentSphere: string,
  params: Partial<QuickCaptureContextSnapshot> & { captureSource?: QuickCaptureContextSnapshot["captureSource"] },
) {
  return JSON.stringify({
    currentStage: params.currentStage ?? "dashboard",
    currentFocus: params.currentFocus ?? "",
    currentSphere,
    currentContext: params.currentContext ?? "",
    currentResponse: params.currentResponse ?? null,
    recentSessionMinutes: params.recentSessionMinutes ?? null,
    sourceSessionId: params.sourceSessionId ?? null,
    sourceMapId: params.sourceMapId ?? null,
    captureSource: params.captureSource ?? "web_shortcut",
    processedAt: params.processedAt ?? null,
    processedIntoClaimId: params.processedIntoClaimId ?? null,
    processedIntoMapId: params.processedIntoMapId ?? null,
    dismissed: params.dismissed ?? false,
    dismissedAt: params.dismissedAt ?? null,
    extractedStructureKind: params.extractedStructureKind ?? null,
    extractedDomain: params.extractedDomain ?? null,
    extractedConfidence: params.extractedConfidence ?? null,
    extractionConfidence: params.extractionConfidence ?? null,
  });
}

function mapQuickCapture(row: QuickCaptureRow): QuickCapture {
  const snapshot = parseQuickCaptureContextSnapshot(row.contextSnapshot);

  return {
    id: row.id,
    userId: row.userId,
    sourceSessionId: row.sourceSessionId,
    sourceMapId: row.sourceMapId,
    sphere: row.sphere,
    content: row.content,
    contextSnapshot: snapshot,
    status: row.status as QuickCapture["status"],
    priority: row.priority,
    surfaceCount: row.surfaceCount,
    lastSurfacedAt: row.lastSurfacedAt,
    promotedAt: row.promotedAt,
    archivedAt: row.archivedAt,
    mergedInto: row.mergedInto,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    rawText: row.content,
    captureSource: snapshot.captureSource ?? "web_shortcut",
    processedAt: toDate(snapshot.processedAt) ?? (row.status !== "floating" ? row.updatedAt : null),
    processedIntoClaimId: snapshot.processedIntoClaimId ?? null,
    processedIntoMapId: snapshot.processedIntoMapId ?? row.sourceMapId ?? null,
    dismissed: snapshot.dismissed ?? row.status === "archived",
    dismissedAt: toDate(snapshot.dismissedAt) ?? row.archivedAt,
    extractedStructureKind: snapshot.extractedStructureKind ?? null,
    extractedDomain: snapshot.extractedDomain ?? null,
    extractedConfidence: snapshot.extractedConfidence ?? null,
    extractionConfidence: snapshot.extractionConfidence ?? null,
  };
}

async function readRows(userId: string) {
  return prisma.marginFragment.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }],
  });
}

export async function listQuickCaptures(userId = DEMO_USER_ID): Promise<QuickCapture[]> {
  const rows = await readRows(userId);
  return rows.map((row) => mapQuickCapture(row));
}

export async function createQuickCapture(params: QuickCaptureCreateInput): Promise<QuickCapture> {
  const userId = params.userId ?? DEMO_USER_ID;
  const rawText = cleanSentence(params.rawText);

  if (!rawText) {
    throw new Error("Quick capture text is required");
  }

  const sphere = cleanSentence(params.sphere ?? "work") || "work";
  const created = await prisma.marginFragment.create({
    data: {
      userId,
      sourceSessionId: params.sourceSessionId ?? null,
      sourceMapId: params.sourceMapId ?? null,
      sphere,
      content: rawText,
      contextSnapshot: buildContextSnapshot(sphere, {
        captureSource: params.captureSource ?? "web_shortcut",
        sourceSessionId: params.sourceSessionId ?? null,
        sourceMapId: params.sourceMapId ?? null,
        currentStage: params.currentStage ?? "dashboard",
        currentFocus: params.currentFocus ?? rawText.slice(0, 120),
        currentContext: params.currentContext ?? rawText,
        currentResponse: params.currentResponse ?? null,
        recentSessionMinutes: params.recentSessionMinutes ?? null,
        extractedStructureKind: params.extractedStructureKind ?? null,
        extractedDomain: params.extractedDomain ?? null,
        extractedConfidence: params.extractedConfidence ?? null,
        extractionConfidence: params.extractionConfidence ?? null,
      }),
      status: "floating",
      priority: 0.55,
      surfaceCount: 0,
    },
  });

  return mapQuickCapture(created);
}

export async function updateQuickCapture(params: QuickCaptureUpdateInput): Promise<QuickCapture> {
  const existing = await prisma.marginFragment.findUnique({
    where: { id: params.captureId },
  });

  if (!existing) {
    throw new Error("Quick capture not found");
  }

  if (params.userId && existing.userId !== params.userId) {
    throw new Error("Quick capture not found");
  }

  const currentSnapshot = parseQuickCaptureContextSnapshot(existing.contextSnapshot);
  const nextStatus = params.status ?? existing.status;
  const now = new Date();
  const nextSnapshot = buildContextSnapshot(existing.sphere, {
    ...currentSnapshot,
    processedAt:
      nextStatus === "floating"
        ? currentSnapshot.processedAt ?? null
        : currentSnapshot.processedAt ?? now.toISOString(),
    processedIntoClaimId: params.processedIntoClaimId ?? currentSnapshot.processedIntoClaimId ?? null,
    processedIntoMapId: params.processedIntoMapId ?? currentSnapshot.processedIntoMapId ?? existing.sourceMapId ?? null,
    dismissed: nextStatus === "archived" ? true : currentSnapshot.dismissed ?? false,
    dismissedAt: nextStatus === "archived" ? currentSnapshot.dismissedAt ?? now.toISOString() : currentSnapshot.dismissedAt ?? null,
  });

  const updated = await prisma.marginFragment.update({
    where: { id: params.captureId },
    data: {
      status: nextStatus,
      lastSurfacedAt: nextStatus === "surfaced" ? now : existing.lastSurfacedAt,
      archivedAt: nextStatus === "archived" ? now : existing.archivedAt,
      surfaceCount: nextStatus === "surfaced" ? { increment: 1 } : undefined,
      contextSnapshot: nextSnapshot,
    },
  });

  return mapQuickCapture(updated);
}
