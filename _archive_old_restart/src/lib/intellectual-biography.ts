import { cleanSentence } from "@/lib/penny";
import { buildCognitiveBiasProfile, derivePennyShapes } from "@/lib/penny-insights";
import { listThoughtMaps } from "@/server/thought-map";
import type {
  BiographyChapter,
  BeliefShift,
  DialecticHighlight,
  DialecticHighlightOutcome,
  IntellectualBiography,
  PeriodCalibrationSummary,
} from "@/types/intellectual-biography";
import type { ThoughtMapModel, ThoughtMapEvent, ClaimResolutionType } from "@/types/thought-map";

const DAYS_PER_CHAPTER = 30;

function asDate(value: string | Date) {
  return value instanceof Date ? value : new Date(value);
}

function confidenceForResolution(resolutionType: ClaimResolutionType) {
  switch (resolutionType) {
    case "confirmed":
      return 85;
    case "partially_confirmed":
      return 70;
    case "inconclusive":
      return 55;
    case "reframed":
      return 48;
    case "superseded":
    case "disconfirmed":
      return 25;
  }
}

function shiftDirection(oldConfidence: number, newConfidence: number): BeliefShift["shiftDirection"] {
  if (newConfidence <= 20) {
    return "abandoned";
  }

  if (Math.abs(newConfidence - oldConfidence) < 8) {
    return "reframed";
  }

  return newConfidence > oldConfidence ? "increased" : "decreased";
}

function shiftTriggerForResolution(resolutionType: ClaimResolutionType): BeliefShift["shiftTrigger"] {
  if (resolutionType === "confirmed" || resolutionType === "disconfirmed") {
    return "resolution";
  }

  if (resolutionType === "reframed") {
    return "dependency_change";
  }

  return "critique_round";
}

function chapterTitle(index: number, shifts: BeliefShift[], themes: string[]) {
  if (shifts.length === 0) {
    return `Chapter ${index}: Building the Foundation`;
  }

  const biggest = [...shifts].sort((a, b) => b.shiftMagnitude - a.shiftMagnitude)[0];
  if (!biggest) {
    return `Chapter ${index}: Building the Foundation`;
  }

  if (biggest.shiftDirection === "abandoned") {
    return `Chapter ${index}: Letting Go of ${cleanSentence(biggest.claimText).slice(0, 28)}`;
  }

  if (biggest.shiftDirection === "reframed") {
    return `Chapter ${index}: Seeing ${themes[0] ?? "It"} Differently`;
  }

  return `Chapter ${index}: The Month You Changed Your Mind on ${themes[0] ?? "the Core Question"}`;
}

function themeFromText(text: string) {
  const lower = text.toLowerCase();
  if (/(market|customer|pricing|sales|competitor|go-to-market)/i.test(lower)) return "market";
  if (/(technical|architecture|system|code|performance|infra)/i.test(lower)) return "technical";
  if (/(team|founder|people|leadership|hiring|culture)/i.test(lower)) return "people";
  if (/(risk|decision|tradeoff|plan|strategy)/i.test(lower)) return "strategy";
  return "thinking";
}

function estimateCalibrationTrend(chapters: BiographyChapter[]): PeriodCalibrationSummary["trend"] {
  if (chapters.length < 2) return "stable";
  const first = chapters[0]?.calibrationSummary.averageBrierScore ?? 0.5;
  const last = chapters[chapters.length - 1]?.calibrationSummary.averageBrierScore ?? 0.5;
  if (last < first - 0.03) return "improving";
  if (last > first + 0.03) return "degrading";
  return "stable";
}

function summarizeCalibration(events: ThoughtMapEvent[]) {
  const resolutions = events.filter((event) => event.eventType === "claim_resolution");
  const scores = resolutions
    .map((event) => {
      const payload = event.payload && typeof event.payload === "object" ? (event.payload as Record<string, unknown>) : null;
      const brierScore = typeof payload?.brierScore === "number" ? payload.brierScore : null;
      const resolutionType =
        payload?.resolutionType === "confirmed" ||
        payload?.resolutionType === "disconfirmed" ||
        payload?.resolutionType === "partially_confirmed" ||
        payload?.resolutionType === "inconclusive" ||
        payload?.resolutionType === "reframed" ||
        payload?.resolutionType === "superseded"
          ? (payload.resolutionType as ClaimResolutionType)
          : null;
      if (brierScore == null || !resolutionType) {
        return null;
      }
      return { brierScore, resolutionType };
    })
    .filter(Boolean) as Array<{ brierScore: number; resolutionType: ClaimResolutionType }>;

  const averageBrierScore = scores.length ? scores.reduce((sum, item) => sum + item.brierScore, 0) / scores.length : 0.5;
  return {
    predictionsResolved: resolutions.length,
    averageBrierScore,
    bestDomain: "overall",
    worstDomain: "overall",
    trend: averageBrierScore < 0.22 ? "improving" : averageBrierScore > 0.35 ? "degrading" : "stable",
  } satisfies PeriodCalibrationSummary;
}

function extractShiftsForMap(map: ThoughtMapModel, chapterId: string): BeliefShift[] {
  const shifts: BeliefShift[] = [];

  for (const event of map.events) {
    if (event.eventType !== "claim_resolution" || !event.payload || typeof event.payload !== "object") {
      continue;
    }

    const payload = event.payload as Record<string, unknown>;
    const resolutionType =
      payload.resolutionType === "confirmed" ||
      payload.resolutionType === "disconfirmed" ||
      payload.resolutionType === "partially_confirmed" ||
      payload.resolutionType === "inconclusive" ||
      payload.resolutionType === "reframed" ||
      payload.resolutionType === "superseded"
        ? (payload.resolutionType as ClaimResolutionType)
        : null;

    const claimId = typeof payload.claimId === "string" ? payload.claimId : event.nodeId ?? "";
    const claim = map.nodes.find((node) => node.id === claimId) ?? null;
    const oldConfidence = typeof payload.predictedConfidenceAtResolution === "number" ? payload.predictedConfidenceAtResolution : claim?.scores?.confidence != null ? Math.round(claim.scores.confidence * 100) : 50;
    const newConfidence = resolutionType ? confidenceForResolution(resolutionType) : oldConfidence;
    const shiftMagnitude = Math.abs(newConfidence - oldConfidence);

    if (!claim || shiftMagnitude === 0) {
      continue;
    }

    shifts.push({
      id: event.id,
      chapterId,
      claimId,
      claimText: claim.content,
      oldConfidence,
      newConfidence,
      shiftMagnitude,
      shiftDirection: shiftDirection(oldConfidence, newConfidence),
      shiftTrigger: shiftTriggerForResolution(resolutionType ?? "inconclusive"),
      shiftDate: asDate(event.createdAt),
      narrativeDescription: resolutionType
        ? `The claim ${resolutionType.replaceAll("_", " ")} changed how you treated "${cleanSentence(claim.content).slice(0, 72)}".`
        : `The claim moved enough to deserve a chapter note.`,
      wasSignificant: shiftMagnitude >= 20,
      emotionalWeight: claim.kind === "core_claim" ? "high" : claim.kind === "assumption" ? "medium" : "low",
    });
  }

  return shifts;
}

function extractHighlightsForMap(map: ThoughtMapModel, chapterId: string): DialecticHighlight[] {
  return map.events
    .filter((event) => event.eventType === "dialectic_round")
    .map((event) => {
      const payload = event.payload && typeof event.payload === "object" ? (event.payload as Record<string, unknown>) : null;
      const claimId = typeof payload?.claimId === "string" ? String(payload.claimId) : event.nodeId ?? "";
      const claim = map.nodes.find((node) => node.id === claimId) ?? null;

      return {
        id: event.id,
        chapterId,
        roundId: typeof payload?.roundId === "string" ? String(payload.roundId) : event.id,
        claimText: claim?.content ?? "",
        critiqueType: typeof payload?.critiqueType === "string" ? String(payload.critiqueType) : "critique_round",
        userResponseSummary: typeof payload?.response === "string" ? String(payload.response).slice(0, 200) : "Responded to critique.",
        outcomeType:
          payload?.responsePath === "defend" || payload?.responsePath === "revise" || payload?.responsePath === "absorb"
            ? (payload.responsePath === "defend"
                ? "defended_strongly"
                : payload.responsePath === "revise"
                  ? "reframed"
                  : "conceded")
            : "dismissed",
        notableQuote: typeof payload?.response === "string" ? String(payload.response).slice(0, 140) : "",
        date: asDate(event.createdAt),
      } satisfies Omit<DialecticHighlight, "outcomeType"> & { outcomeType: DialecticHighlightOutcome };
    })
    .filter((highlight) => highlight.claimText.length > 0);
}

function buildChapter(map: ThoughtMapModel, chapterNumber: number, chapterStart: Date, chapterEnd: Date, userId: string): BiographyChapter {
  const chapterId = `chapter-${userId}-${chapterNumber}`;
  const shifts = extractShiftsForMap(map, chapterId).filter((shift) => shift.shiftDate >= chapterStart && shift.shiftDate <= chapterEnd);
  const highlights = extractHighlightsForMap(map, chapterId).filter((highlight) => highlight.date >= chapterStart && highlight.date <= chapterEnd);
  const biasProfile = buildCognitiveBiasProfile([map], userId);
  const themes = Array.from(
    new Set(
      map.nodes
        .filter((node) => node.kind !== "root")
        .map((node) => themeFromText(node.content))
        .slice(0, 3),
    ),
  );
  const shapesActiveDuringPeriod = derivePennyShapes(map.nodes)
    .filter((shape) => asDate(shape.derivation?.computedAt ?? map.updatedAt) >= chapterStart)
    .map((shape) => shape.id);
  const calibrationSummary = summarizeCalibration(map.events.filter((event) => asDate(event.createdAt) >= chapterStart && asDate(event.createdAt) <= chapterEnd));

  return {
    id: chapterId,
    userId,
    chapterNumber,
    title: chapterTitle(chapterNumber, shifts, themes),
    periodStart: chapterStart,
    periodEnd: chapterEnd,
    dominantThemes: themes.length ? themes : ["thinking"],
    majorBeliefShifts: shifts.sort((a, b) => b.shiftMagnitude - a.shiftMagnitude).filter((shift) => shift.wasSignificant),
    significantClaims: Array.from(new Set(map.nodes.filter((node) => node.kind !== "root").map((node) => node.id))),
    shapesActiveDuringPeriod,
    biasesActiveDuringPeriod: biasProfile.biasEntries.filter((entry) => entry.evidenceCount > 0).map((entry) => entry.biasType.id),
    dialecticHighlights: highlights,
    calibrationSummary,
    narrativeText:
      highlights.length || shifts.length
        ? `During ${chapterStart.toLocaleDateString("en-US", { month: "long", year: "numeric" })}, you focused on ${themes[0] ?? "the same central questions"}.`
        : `During ${chapterStart.toLocaleDateString("en-US", { month: "long", year: "numeric" })}, the chapter stayed relatively steady.`,
    userAnnotations: [],
    generatedAt: new Date(),
    lastRevisedAt: new Date(),
  };
}

function narrativeForOpening(chapters: BiographyChapter[], maps: ThoughtMapModel[]) {
  const firstMap = maps[0];
  const firstTheme = chapters[0]?.dominantThemes[0] ?? "strategic thinking";
  const firstDate = firstMap ? firstMap.createdAt.toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "the beginning";
  return `In ${firstDate}, you started mapping your thinking on Penny. Your early focus was on ${firstTheme}. What follows is the record of how your thinking has evolved.`;
}

function narrativeForCurrent(chapters: BiographyChapter[]) {
  const last = chapters[chapters.length - 1];
  if (!last) {
    return "Your intellectual journey is just beginning.";
  }
  return `By chapter ${last.chapterNumber}, your thinking had settled into ${last.dominantThemes[0] ?? "a clearer shape"}.`;
}

function arcNarrative(chapters: BiographyChapter[]) {
  if (chapters.length < 2) {
    return "Your intellectual journey is just beginning.";
  }

  const totalShifts = chapters.reduce((sum, chapter) => sum + chapter.majorBeliefShifts.length, 0);
  const trend = estimateCalibrationTrend(chapters);
  const firstTheme = chapters[0]?.dominantThemes[0] ?? "the same question";
  const lastTheme = chapters[chapters.length - 1]?.dominantThemes[0] ?? firstTheme;
  const themeEvolution =
    firstTheme !== lastTheme
      ? `Your focus shifted from ${firstTheme} toward ${lastTheme}.`
      : `You stayed focused on ${firstTheme} throughout.`;
  const calibrationLine =
    trend === "improving"
      ? "Your predictions have been getting more accurate over time."
      : trend === "degrading"
        ? "Your prediction accuracy has been under pressure recently."
        : "Your prediction accuracy has been stable.";

  return `Over ${chapters.length} chapters and ${totalShifts} significant belief shifts, your thinking has compounded in distinct ways. ${themeEvolution} ${calibrationLine}`;
}

export async function generateIntellectualBiography(userId: string): Promise<IntellectualBiography> {
  const maps = (await listThoughtMaps()).filter((map) => map.userId === userId);
  const orderedMaps = [...maps].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const chapters = orderedMaps.map((map, index) => {
    const chapterStart = asDate(map.createdAt);
    const chapterEnd = new Date(chapterStart.getTime() + DAYS_PER_CHAPTER * 24 * 60 * 60 * 1000);
    return buildChapter(map, index + 1, chapterStart, chapterEnd, userId);
  });
  const allShifts = chapters.flatMap((chapter) => chapter.majorBeliefShifts);
  const biggestSingleUpdate = [...allShifts].sort((a, b) => b.shiftMagnitude - a.shiftMagnitude)[0] ?? null;
  const mostRevisedBelief =
    [...allShifts]
      .sort((a, b) => b.shiftMagnitude - a.shiftMagnitude)
      .find((shift) => shift.claimId)?.claimId ?? "";
  const firstClaim = orderedMaps[0]?.nodes.find((node) => node.kind !== "root")?.content ?? "the first claim";
  const lastClaim = orderedMaps.at(-1)?.nodes.find((node) => node.kind !== "root")?.content ?? firstClaim;

  return {
    userId,
    totalChapters: chapters.length,
    chapters,
    openingNarrative: narrativeForOpening(chapters, orderedMaps),
    currentNarrative: narrativeForCurrent(chapters),
    intellectualArc: arcNarrative(chapters),
    totalBeliefShifts: allShifts.length,
    totalDialecticRounds: orderedMaps.reduce((sum, map) => sum + map.events.filter((event) => event.eventType === "dialectic_round").length, 0),
    totalClaimsResolved: orderedMaps.reduce((sum, map) => sum + map.events.filter((event) => event.eventType === "claim_resolution").length, 0),
    mostRevisedBelief,
    longestHeldBelief: firstClaim || lastClaim,
    biggestSingleUpdate,
    generatedAt: new Date(),
  };
}
