import { prisma } from "@/db/prisma";
import {
  buildLessonSearchIndex,
  buildLessonTags,
  findRelevantLessons as findRelevantLessonsFromLibrary,
  inferLessonType,
  makeLessonId,
} from "@/lib/lesson-library";
import { captureSnapshotForMap } from "@/lib/penny-insights";
import { classifyCalibrationDomain } from "@/lib/calibration";
import { getThoughtMap } from "@/server/thought-map";
import type { Lesson, LessonApplicationEvent, LessonLibrary, LessonSourceType } from "@/types/lesson-library";
import type {
  ClaimResolutionType,
  ThoughtMapEvent,
  ThoughtMapModel,
} from "@/types/thought-map";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function parseDate(value: unknown, fallback: Date) {
  return typeof value === "string" || value instanceof Date ? new Date(value) : fallback;
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function sourceEventBaseId(sourceId: string) {
  return sourceId.split(":")[0] ?? sourceId;
}

function buildResolutionLessonText(params: {
  claimText: string;
  resolutionType: ClaimResolutionType;
  actualOutcome: string;
  brierScore: number;
}) {
  const scorePhrase =
    params.brierScore >= 0.25
      ? "The calibration miss was large enough to warrant a hard rule."
      : params.brierScore >= 0.1
        ? "The calibration miss was real but still close enough to refine rather than reset."
        : "The calibration stayed tight enough to confirm the basic update rhythm.";

  return normalizeText(
    `Resolution lesson for "${params.claimText}": the claim resolved as ${params.resolutionType.replaceAll("_", " ")}. ${scorePhrase} Outcome: ${params.actualOutcome}.`,
  );
}

function buildPostMortemLessonText(params: { claimText: string; whatToDoNextTime: string; whatWasMissed: string }) {
  return normalizeText(
    `Post-mortem lesson for "${params.claimText}": ${params.whatToDoNextTime || params.whatWasMissed}`,
  );
}

function buildCounterfactualLessonText(params: { claimText: string; keyInsight: string }) {
  return normalizeText(`Counterfactual lesson for "${params.claimText}": ${params.keyInsight}`);
}

function buildConcessionLessonText(params: { claimText: string; concessionText: string; critiqueText: string }) {
  return normalizeText(
    `Concession lesson for "${params.claimText}": after critique "${params.critiqueText}", the response conceded "${params.concessionText}".`,
  );
}

function createLesson(params: {
  userId: string;
  lessonText: string;
  sourceType: LessonSourceType;
  sourceId: string;
  domain: string | null;
  claimType: string | null;
  confidenceInLesson: number;
}) {
  const lessonType = inferLessonType({
    lessonText: params.lessonText,
    domain: params.domain,
    claimType: params.claimType,
    sourceType: params.sourceType,
  });
  return {
    id: makeLessonId(params.sourceType, params.sourceId),
    userId: params.userId,
    lessonText: params.lessonText,
    lessonType,
    domain: params.domain,
    claimType: params.claimType,
    sourceType: params.sourceType,
    sourceId: params.sourceId,
    tags: buildLessonTags({
      lessonText: params.lessonText,
      lessonType,
      domain: params.domain,
      claimType: params.claimType,
      sourceType: params.sourceType,
    }),
    confidenceInLesson: Math.max(0, Math.min(1, params.confidenceInLesson)),
    hasBeenApplied: false,
    applicationCount: 0,
    applicationEvents: [],
    createdAt: new Date(),
    lastSurfacedAt: null,
    userEditedText: null,
  } satisfies Lesson;
}

type ParsedClaimResolution = {
  id: string;
  claimId: string;
  mapId: string;
  resolutionDate: Date;
  resolutionType: ClaimResolutionType;
  actualOutcome: string;
  predictedConfidenceAtResolution: number;
  brierScore: number;
  logScore: number;
  lessonsCaptured: string[];
  postMortem: {
    whatHappened: string;
    whatWasMissed: string;
    whatToDoNextTime: string;
  } | null;
  counterfactualAnalysis: {
    keyInsight: string;
  } | null;
};

function parseClaimResolutionEvent(event: ThoughtMapEvent): ParsedClaimResolution | null {
  if (event.eventType !== "claim_resolution" || !isRecord(event.payload)) {
    return null;
  }

  const payload = event.payload;
  const resolutionType =
    payload.resolutionType === "confirmed" ||
    payload.resolutionType === "disconfirmed" ||
    payload.resolutionType === "partially_confirmed" ||
    payload.resolutionType === "inconclusive" ||
    payload.resolutionType === "reframed" ||
    payload.resolutionType === "superseded"
      ? payload.resolutionType
      : null;

  if (!resolutionType) {
    return null;
  }

  const actualOutcome = typeof payload.actualOutcome === "string" ? payload.actualOutcome.trim() : "";
  const claimId = typeof payload.claimId === "string" ? payload.claimId : event.nodeId ?? "";
  const mapId = typeof payload.mapId === "string" ? payload.mapId : event.mapId;

  if (!actualOutcome || !claimId || !mapId) {
    return null;
  }

  return {
    id: typeof payload.id === "string" ? payload.id : event.id,
    claimId,
    mapId,
    resolutionDate: parseDate(payload.resolutionDate, event.createdAt),
    resolutionType,
    actualOutcome,
    predictedConfidenceAtResolution:
      typeof payload.predictedConfidenceAtResolution === "number" ? payload.predictedConfidenceAtResolution : 0,
    brierScore: typeof payload.brierScore === "number" ? payload.brierScore : 0,
    logScore: typeof payload.logScore === "number" ? payload.logScore : 0,
    lessonsCaptured: Array.isArray(payload.lessonsCaptured)
      ? payload.lessonsCaptured.filter((item): item is string => typeof item === "string")
      : [],
    postMortem: isRecord(payload.postMortem)
      ? {
          whatHappened: typeof payload.postMortem.whatHappened === "string" ? payload.postMortem.whatHappened : "",
          whatWasMissed: typeof payload.postMortem.whatWasMissed === "string" ? payload.postMortem.whatWasMissed : "",
          whatToDoNextTime: typeof payload.postMortem.whatToDoNextTime === "string" ? payload.postMortem.whatToDoNextTime : "",
        }
      : null,
    counterfactualAnalysis:
      isRecord(payload.counterfactualAnalysis) && typeof payload.counterfactualAnalysis.keyInsight === "string"
        ? { keyInsight: payload.counterfactualAnalysis.keyInsight }
        : null,
  };
}

function parseCounterfactualLesson(payload: Record<string, unknown> | null, claimText: string) {
  if (!payload) {
    return null;
  }

  const keyInsight = typeof payload.keyInsight === "string" ? payload.keyInsight.trim() : "";
  if (!keyInsight) {
    return null;
  }

  return buildCounterfactualLessonText({ claimText, keyInsight });
}

function parseDialecticLesson(event: ThoughtMapEvent, map: ThoughtMapModel) {
  if (event.eventType !== "dialectic_round" || !isRecord(event.payload)) {
    return null;
  }

  const payload = event.payload;
  const round = payload.dialecticRound && isRecord(payload.dialecticRound) ? (payload.dialecticRound as Record<string, unknown>) : null;
  const classification = isRecord(payload.responseClassification)
    ? (payload.responseClassification as Record<string, unknown>)
    : null;
  const classificationType =
    classification?.type === "concession" ||
    classification?.type === "partial_concession" ||
    classification?.type === "defense" ||
    classification?.type === "dismissal" ||
    classification?.type === "reframe" ||
    classification?.type === "evidence_addition"
      ? classification.type
      : null;

  if (classificationType !== "concession" && classificationType !== "partial_concession") {
    return null;
  }

  const critiqueStrength = typeof payload.critiqueStrength === "string" ? payload.critiqueStrength : round?.critiqueStrength;
  const confidenceDelta =
    typeof round?.confidenceDelta === "number"
      ? round.confidenceDelta
      : typeof payload.confidenceDelta === "number"
        ? payload.confidenceDelta
        : 0;

  if (critiqueStrength !== "strong" && critiqueStrength !== "adversarial" && confidenceDelta >= 0) {
    return null;
  }

  const claim = map.nodes.find((node) => node.id === event.nodeId) ?? null;
  const claimText = claim?.content ?? (typeof payload.prompt === "string" ? payload.prompt : "this claim");
  const concessionText = Array.isArray(round?.concessions)
    ? round.concessions
        .map((concession) => (isRecord(concession) && typeof concession.concededPoint === "string" ? concession.concededPoint : null))
        .filter((item): item is string => item != null)
        .join("; ")
    : "";
  const critiqueText = typeof payload.critiqueGenerated === "string" ? payload.critiqueGenerated : "";

  return buildConcessionLessonText({
    claimText,
    concessionText: concessionText || (typeof payload.userResponse === "string" ? payload.userResponse : "a concession was made"),
    critiqueText: critiqueText || "a strong critique",
  });
}

function extractLessonsFromMap(userId: string, map: ThoughtMapModel): Lesson[] {
  const lessons: Lesson[] = [];
  const capture = captureSnapshotForMap(map);
  const domain = classifyCalibrationDomain(`${map.title} ${map.rawThought} ${map.nodes.map((node) => node.content).join(" ")}`);
  const claimType = capture?.structureKind ?? null;

  for (const event of map.events) {
    if (event.eventType === "claim_resolution" && isRecord(event.payload)) {
      const resolution = parseClaimResolutionEvent(event);
      if (!resolution) {
        continue;
      }

      const claim = map.nodes.find((node) => node.id === resolution.claimId) ?? null;
      const claimText = claim?.content ?? "the resolved claim";
      const lessonBaseId = `${event.id}:resolution`;
      const resolutionLessonText = buildResolutionLessonText({
        claimText,
        resolutionType: resolution.resolutionType,
        actualOutcome: resolution.actualOutcome,
        brierScore: resolution.brierScore,
      });
      const resolutionLesson = createLesson({
        userId,
        lessonText: resolutionLessonText,
        sourceType: "resolution",
        sourceId: lessonBaseId,
        domain,
        claimType,
        confidenceInLesson: resolution.brierScore >= 0.25 ? 0.88 : resolution.brierScore >= 0.1 ? 0.82 : 0.76,
      });
      const resolutionLessonTags = new Set(resolutionLesson.tags);
      resolutionLessonTags.add(`outcome:${resolution.resolutionType}`);
      resolutionLesson.tags = Array.from(resolutionLessonTags);
      lessons.push(resolutionLesson);

      if (resolution.lessonsCaptured.length > 0) {
        resolution.lessonsCaptured.forEach((lessonText, index) => {
          const capturedLesson = createLesson({
            userId,
            lessonText: normalizeText(lessonText),
            sourceType: "resolution",
            sourceId: `${lessonBaseId}:${index}`,
            domain,
            claimType,
            confidenceInLesson: 0.84,
          });
          lessons.push(capturedLesson);
        });
      }

      if (resolution.postMortem) {
        const postMortemLesson = createLesson({
          userId,
          lessonText: buildPostMortemLessonText({
            claimText,
            whatToDoNextTime: resolution.postMortem.whatToDoNextTime,
            whatWasMissed: resolution.postMortem.whatWasMissed,
          }),
          sourceType: "post_mortem",
          sourceId: `${event.id}:post_mortem`,
          domain,
          claimType,
          confidenceInLesson: 0.9,
        });
        lessons.push(postMortemLesson);
      }

      const counterfactualText =
        resolution.counterfactualAnalysis?.keyInsight ??
        parseCounterfactualLesson(isRecord(resolution.counterfactualAnalysis) ? resolution.counterfactualAnalysis : null, claimText);
      if (counterfactualText) {
        lessons.push(
          createLesson({
            userId,
            lessonText: counterfactualText,
            sourceType: "counterfactual",
            sourceId: `${event.id}:counterfactual`,
            domain,
            claimType,
            confidenceInLesson: 0.76,
          }),
        );
      }
    }

    if (event.eventType === "dialectic_round") {
      const lessonText = parseDialecticLesson(event, map);
      if (lessonText) {
        const claim = map.nodes.find((node) => node.id === event.nodeId) ?? null;
        lessons.push(
          createLesson({
            userId,
            lessonText,
            sourceType: "concession",
            sourceId: `${event.id}:concession`,
            domain,
            claimType: claimType ?? claim?.kind ?? null,
            confidenceInLesson: 0.8,
          }),
        );
      }
    }
  }

  return lessons;
}

function attachLessonApplications(lessons: Lesson[], maps: ThoughtMapModel[]) {
  const applicationsByLessonId = new Map<string, LessonApplicationEvent[]>();
  const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson] as const));

  for (const map of maps) {
    for (const event of map.events) {
      if (event.eventType !== "lesson_applied" || !isRecord(event.payload)) {
        continue;
      }

      const lessonId = typeof event.payload.lessonId === "string" ? event.payload.lessonId : "";
      const lesson = lessonById.get(lessonId);
      if (!lesson) {
        continue;
      }

      const application: LessonApplicationEvent = {
        lessonId,
        appliedInContext: typeof event.payload.appliedInContext === "string" ? event.payload.appliedInContext : "",
        appliedAt: parseDate(event.payload.appliedAt, event.createdAt),
        wasUseful:
          typeof event.payload.wasUseful === "boolean" || event.payload.wasUseful === null ? event.payload.wasUseful : null,
        userNote: typeof event.payload.userNote === "string" ? event.payload.userNote : null,
      };

      const existing = applicationsByLessonId.get(lessonId) ?? [];
      existing.push(application);
      applicationsByLessonId.set(lessonId, existing);
    }
  }

  for (const lesson of lessons) {
    const applications = (applicationsByLessonId.get(lesson.id) ?? []).sort((a, b) => a.appliedAt.getTime() - b.appliedAt.getTime());
    lesson.applicationEvents = applications;
    lesson.applicationCount = applications.length;
    lesson.hasBeenApplied = applications.length > 0;
    lesson.lastSurfacedAt = applications.length ? applications[applications.length - 1]!.appliedAt : null;
  }
}

function buildLessonLibrary(userId: string, maps: ThoughtMapModel[]): LessonLibrary {
  const lessons = maps.flatMap((map) => extractLessonsFromMap(userId, map));
  attachLessonApplications(lessons, maps);

  const lessonsByType = new Map<string, Lesson[]>();
  const lessonsByDomain = new Map<string, Lesson[]>();
  for (const lesson of lessons) {
    const typeBucket = lessonsByType.get(lesson.lessonType) ?? [];
    typeBucket.push(lesson);
    lessonsByType.set(lesson.lessonType, typeBucket);

    const domainBucket = lessonsByDomain.get(lesson.domain ?? "general") ?? [];
    domainBucket.push(lesson);
    lessonsByDomain.set(lesson.domain ?? "general", domainBucket);
  }

  const appliedLessons = lessons.filter((lesson) => lesson.hasBeenApplied).length;
  const mostAppliedLesson = lessons
    .slice()
    .sort((a, b) => b.applicationCount - a.applicationCount || b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
  const mostRecentLesson = lessons.slice().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;

  return {
    userId,
    totalLessons: lessons.length,
    appliedLessons,
    mostAppliedLesson,
    mostRecentLesson,
    lessonsByType,
    lessonsByDomain,
    lessons: lessons.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    searchIndex: buildLessonSearchIndex(lessons),
    generatedAt: new Date(),
  };
}

export async function getLessonLibrary(userId: string): Promise<LessonLibrary> {
  const mapIds = await prisma.thoughtMap.findMany({
    where: { userId },
    select: { id: true },
    orderBy: { updatedAt: "desc" },
  });

  const maps = (await Promise.all(mapIds.map(async ({ id }) => await getThoughtMap(id)))).filter(Boolean) as ThoughtMapModel[];

  return buildLessonLibrary(userId, maps);
}

export async function findRelevantLessons(userId: string, newClaimText: string, newClaimDomain: string, newClaimType: string) {
  const library = await getLessonLibrary(userId);
  return findRelevantLessonsFromLibrary(library, newClaimText, newClaimDomain, newClaimType);
}

export function serializeLessonLibrary(library: LessonLibrary) {
  return {
    userId: library.userId,
    totalLessons: library.totalLessons,
    appliedLessons: library.appliedLessons,
    mostAppliedLesson: library.mostAppliedLesson,
    mostRecentLesson: library.mostRecentLesson,
    lessonsByType: Array.from(library.lessonsByType.entries()),
    lessonsByDomain: Array.from(library.lessonsByDomain.entries()),
    lessons: library.lessons,
    generatedAt: library.generatedAt,
  };
}

export async function recordLessonApplication(params: {
  userId: string;
  lessonId: string;
  appliedInContext: string;
  wasUseful: boolean | null;
  userNote: string | null;
}) {
  const library = await getLessonLibrary(params.userId);
  const lesson = library.lessons.find((candidate) => candidate.id === params.lessonId);

  if (!lesson) {
    throw new Error("Lesson not found");
  }

  const sourceEventId = sourceEventBaseId(lesson.sourceId);
  const map = (await Promise.all(
    (await prisma.thoughtMap.findMany({ where: { userId: params.userId }, select: { id: true } })).map(async ({ id }) => getThoughtMap(id)),
  )).find((candidate) => candidate?.events.some((event) => event.id === sourceEventId)) ?? null;

  if (!map) {
    throw new Error("Lesson source map not found");
  }

  const application: LessonApplicationEvent = {
    lessonId: lesson.id,
    appliedInContext: params.appliedInContext.trim(),
    appliedAt: new Date(),
    wasUseful: params.wasUseful,
    userNote: params.userNote?.trim().length ? params.userNote.trim() : null,
  };

  await prisma.thoughtMapEvent.create({
    data: {
      mapId: map.id,
      nodeId: null,
      eventType: "lesson_applied",
      payload: JSON.stringify({
        ...application,
        appliedAt: application.appliedAt.toISOString(),
      }) as string,
    },
  });

  return application;
}
