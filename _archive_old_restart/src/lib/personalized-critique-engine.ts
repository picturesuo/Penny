import {
  buildCalibrationDashboard,
  buildClaimStructureSnapshot,
  buildPennyLens,
  type PennyLensSnapshot,
} from "@/lib/penny-insights";
import { classifyCalibrationDomain } from "@/lib/calibration";
import type {
  CognitiveBiasProfile,
  ClaimStructureKind,
  CritiqueQualityProfile,
  ThoughtMapEvent,
  ThoughtMapModel,
  ThoughtNodeModel,
} from "@/types/thought-map";
import type {
  CritiqueKnowledgeDepth,
  DismissalPattern,
  PersonalizedCritiqueContext,
  PersonalizedCritiqueContextInput,
} from "@/types/personalized-critique";

type DialecticRoundSignal = {
  id: string;
  claimId: string;
  claimText: string;
  critiqueType: string | null;
  critiqueMode: string | null;
  responsePath: "defend" | "revise" | "absorb" | "unknown";
  response: string;
  createdAt: Date;
  confidenceDelta: number | null;
  contribution: string | null;
};

export function buildPersonalizedCritiqueContext(
  params: PersonalizedCritiqueContextInput & { critiqueQualityProfile?: CritiqueQualityProfile | null },
): PersonalizedCritiqueContext | null {
  const targetNode = params.targetNode ?? findSelectedNode(params.map);
  const targetClaimId = targetNode?.id ?? null;
  const targetClaimType = targetNode ? buildClaimStructureSnapshot(params.map, targetNode).structureKind : null;
  const targetDomain = targetNode ? classifyCalibrationDomain(targetNode.content) : classifyCalibrationDomain(params.map.rawThought);
  const calibration = params.calibration ?? buildCalibrationDashboard([params.map]);
  const lens = params.lens ?? buildPennyLens(params.map);
  const rounds = collectDialecticRounds(params.map, targetClaimId);

  if (!targetNode && params.map.nodes.length === 0 && rounds.length === 0) {
    return null;
  }

  const biasEntries = params.biasProfile?.biasEntries ?? [];
  const activeBiases = biasEntries
    .filter((entry) => entry.status === "confirmed" || entry.status === "monitoring")
    .filter((entry) => entry.claimDomains.length === 0 || entry.claimDomains.includes(targetDomain) || entry.claimDomains.includes("general"))
    .sort((a, b) => b.confidenceInBias - a.confidenceInBias || b.evidenceCount - a.evidenceCount);

  const confirmedBiases = activeBiases.slice(0, 4).map((entry) => entry.biasType.name);
  const dominantShapes = (lens?.effectiveShapes ?? lens?.activeShapes ?? [])
    .slice(0, 3)
    .map((shape) => shape.label);

  const weakDomains = calibration.domains
    .filter((domain) => typeof domain.calibrationGap === "number" && domain.calibrationGap > 5)
    .sort((a, b) => (b.calibrationGap ?? 0) - (a.calibrationGap ?? 0))
    .slice(0, 3)
    .map((domain) => domain.domain);
  const strongDomains = calibration.domains
    .filter((domain) => typeof domain.calibrationGap === "number" && domain.calibrationGap < -5)
    .sort((a, b) => (a.calibrationGap ?? 0) - (b.calibrationGap ?? 0))
    .slice(0, 3)
    .map((domain) => domain.domain);

  const dismissalPatterns = buildDismissalPatterns(rounds, targetClaimType);
  const strongConcessionContexts = collectConcessionContexts(rounds);
  const observedRounds = rounds.length;
  const biasSignalCount = activeBiases.reduce((sum, entry) => sum + entry.evidenceCount, 0);
  const knowledgeAge = computeKnowledgeAgeDays(params.biasProfile, lens, rounds);
  const knowledgeDepth = computeKnowledgeDepth({ observedRounds, confirmedBiases, dominantShapes, weakDomains, strongDomains });
  const knowledgeDepthMessage = generateKnowledgeDepthMessage(knowledgeDepth, observedRounds, confirmedBiases.length, weakDomains.length);
  const critiqueQuality = params.critiqueQualityProfile ?? null;
  const voiceSelected = selectVoice(critiqueQuality);
  const failureTypesPrioritized = derivePrioritizedFailureTypes(activeBiases, weakDomains, targetClaimType, params.map);
  const failureTypesDeprioritized = deriveDeprioritizedFailureTypes(dismissalPatterns);
  const intensityAdjustment = computeIntensityAdjustment(knowledgeDepth, weakDomains, strongDomains, dismissalPatterns);
  const critiqueModeAdjustment = buildCritiqueModeAdjustment(knowledgeDepth, weakDomains, strongDomains, dismissalPatterns);
  const disclosure = generatePersonalizationDisclosure({
    knowledgeDepth,
    confirmedBiases,
    dominantShapes,
    weakDomains,
    strongDomains,
    intensityAdjustment,
    dismissalPatterns,
  });

  return {
    userId: params.map.userId,
    targetClaimId,
    targetClaimType,
    targetDomain,
    lensVersion: lens?.effectiveShapes.length ?? lens?.activeShapes.length ?? 0,
    confirmedBiases,
    dominantShapes,
    weakDomains,
    strongDomains,
    dismissalPatterns,
    strongConcessionContexts,
    critiqueModeAdjustment,
    failureTypesPrioritized,
    failureTypesDeprioritized,
    voiceSelected,
    intensityAdjustment,
    knowledgeAge,
    knowledgeDepth,
    knowledgeDepthMessage,
    disclosure,
    knowsUserWellEnough: knowledgeDepth === "deep" || knowledgeDepth === "comprehensive",
    observedRounds,
    biasSignalCount,
    summary: buildCritiqueSummary({
      targetDomain,
      targetClaimType,
      knowledgeDepthMessage,
      confirmedBiases,
      dominantShapes,
      weakDomains,
      strongDomains,
    }),
  };
}

export function generatePersonalizationDisclosure(context: {
  knowledgeDepth: CritiqueKnowledgeDepth;
  confirmedBiases: string[];
  dominantShapes: string[];
  weakDomains: string[];
  strongDomains: string[];
  intensityAdjustment: number;
  dismissalPatterns: DismissalPattern[];
}): string {
  if (context.knowledgeDepth === "surface") {
    return "Penny is still learning how you think here, so this critique is mostly general.";
  }

  const parts: string[] = [];

  if (context.confirmedBiases.length > 0) {
    parts.push(`it is already tracking your ${context.confirmedBiases[0].toLowerCase()}`);
  }

  if (context.weakDomains.length > 0) {
    parts.push(`it is pushing harder on ${context.weakDomains[0]} because calibration there is weak`);
  } else if (context.strongDomains.length > 0) {
    parts.push(`it is softening slightly in ${context.strongDomains[0]} because you are unusually steady there`);
  }

  if (context.intensityAdjustment > 0) {
    parts.push("the failure mode is already showing up often enough to justify a harder pass");
  }

  if (context.intensityAdjustment < 0) {
    parts.push("Penny is backing off a little because a softer nudge tends to work better here");
  }

  if (context.dismissalPatterns.length > 0) {
    parts.push("it has seen the way you dismiss weak critiques and is using that pattern directly");
  }

  if (!parts.length) {
    return "Penny has enough context to make this critique more specific than a blank-slate pass.";
  }

  return `This critique ${joinAsSentence(parts)}.`;
}

function collectDialecticRounds(map: ThoughtMapModel, claimId: string | null): DialecticRoundSignal[] {
  return map.events
    .filter((event) => event.eventType === "dialectic_round")
    .map((event) => normalizeDialecticRound(event))
    .filter((event) => (claimId ? event.claimId === claimId || event.id === claimId : true))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

function normalizeDialecticRound(event: ThoughtMapEvent): DialecticRoundSignal {
  const payload = event.payload ?? {};
  const roundPayload =
    payload.dialecticRound && typeof payload.dialecticRound === "object"
      ? (payload.dialecticRound as Record<string, unknown>)
      : null;

  return {
    id: event.id,
    claimId:
      roundPayload && typeof roundPayload.claimId === "string" && roundPayload.claimId.trim().length > 0
        ? String(roundPayload.claimId)
        : event.nodeId ?? event.id,
    claimText:
      roundPayload && typeof roundPayload.claimText === "string" && roundPayload.claimText.trim().length > 0
        ? String(roundPayload.claimText)
        : typeof payload.targetText === "string"
          ? String(payload.targetText)
          : event.nodeId ?? "the active claim",
    critiqueType:
      typeof payload.critiqueType === "string" && payload.critiqueType.trim().length > 0
        ? String(payload.critiqueType)
        : null,
    critiqueMode:
      roundPayload && typeof roundPayload.critiqueMode === "string" && roundPayload.critiqueMode.trim().length > 0
        ? String(roundPayload.critiqueMode)
        : typeof payload.critiqueMode === "string" && payload.critiqueMode.trim().length > 0
          ? String(payload.critiqueMode)
          : null,
    responsePath:
      payload.responsePath === "defend" || payload.responsePath === "revise" || payload.responsePath === "absorb"
        ? payload.responsePath
        : "unknown",
    response: typeof payload.response === "string" ? String(payload.response) : "",
    createdAt: event.createdAt,
    confidenceDelta:
      roundPayload && typeof roundPayload.confidenceDelta === "number"
        ? Number(roundPayload.confidenceDelta)
        : typeof payload.confidenceDelta === "number"
          ? Number(payload.confidenceDelta)
          : null,
    contribution:
      roundPayload && typeof roundPayload.responseClassification === "object"
        ? String((roundPayload.responseClassification as Record<string, unknown>).type ?? "")
        : null,
  };
}

function buildDismissalPatterns(rounds: DialecticRoundSignal[], claimType: ClaimStructureKind | null): DismissalPattern[] {
  const buckets = new Map<string, DialecticRoundSignal[]>();
  for (const round of rounds) {
    const key = [round.claimId, round.critiqueType ?? "general", round.critiqueMode ?? "direct"].join("|");
    const bucket = buckets.get(key) ?? [];
    bucket.push(round);
    buckets.set(key, bucket);
  }

  return Array.from(buckets.entries())
    .map(([key, bucket]) => {
      const first = bucket[0];
      const last = bucket[bucket.length - 1];
      const dismissals = bucket.filter((round) => round.responsePath === "defend").length;
      const concessions = bucket.filter((round) => round.responsePath === "absorb" || round.responsePath === "revise").length;
      const responseLabel =
        bucket.some((round) => round.responsePath === "defend")
          ? "defends the claim when the critique points at the same weak spot"
          : bucket.some((round) => round.responsePath === "absorb")
            ? "absorbs critique and updates quickly once the pressure is concrete"
            : "keeps the response moving instead of freezing";

      return {
        id: `dismissal-${key}`,
        claimId: first.claimId,
        claimText: first.claimText,
        critiqueType: first.critiqueType,
        critiqueMode: first.critiqueMode,
        responsePath: first.responsePath,
        dismissalCount: dismissals,
        concessionCount: concessions,
        lastObservedAt: last.createdAt,
        summary: `${first.critiqueType ?? claimType ?? "critique"} on ${first.claimText.slice(0, 84)}${first.claimText.length > 84 ? "…" : ""} ${responseLabel}.`,
      } satisfies DismissalPattern;
    })
    .sort((a, b) => b.dismissalCount - a.dismissalCount || b.concessionCount - a.concessionCount || b.lastObservedAt.getTime() - a.lastObservedAt.getTime())
    .slice(0, 4);
}

function collectConcessionContexts(rounds: DialecticRoundSignal[]): string[] {
  return rounds
    .filter((round) => round.responsePath === "absorb" || round.responsePath === "revise")
    .map((round) => {
      const response = round.response.trim().length > 0 ? summarizeText(round.response.trim(), 120) : "You adjusted after critique.";
      return `${round.critiqueType ?? "critique"} on ${summarizeText(round.claimText, 72)}: ${response}`;
    })
    .slice(0, 4);
}

function derivePrioritizedFailureTypes(
  biasEntries: NonNullable<CognitiveBiasProfile["biasEntries"]>,
  weakDomains: string[],
  targetClaimType: ClaimStructureKind | null,
  map: ThoughtMapModel,
): string[] {
  const biasFailureTypes = biasEntries
    .flatMap((entry) => entry.biasType.mitigationPrompts.slice(0, 1))
    .filter((prompt) => prompt.length > 0);
  const fallbackFailureTypes = [
    targetClaimType ? `${targetClaimType} gap` : "missing counterargument",
    weakDomains[0] ? `${weakDomains[0]} evidence gap` : "load-bearing assumption",
    map.nodes.some((node) => node.kind === "counter_argument") ? "counterargument pressure" : "unchallenged premise",
  ];

  return uniqueStrings([...biasFailureTypes, ...fallbackFailureTypes]).slice(0, 5);
}

function deriveDeprioritizedFailureTypes(dismissalPatterns: DismissalPattern[]): string[] {
  const counts = new Map<string, number>();
  for (const pattern of dismissalPatterns) {
    const label = pattern.critiqueType ?? "general";
    counts.set(label, (counts.get(label) ?? 0) + pattern.dismissalCount);
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([label]) => label)
    .slice(0, 4);
}

function selectVoice(profile: CritiqueQualityProfile | null): string {
  if (!profile) {
    return "direct";
  }

  const entries = Object.entries(profile.voicePerformance).sort((a, b) => b[1] - a[1]);
  return entries[0]?.[0] ?? "direct";
}

function computeIntensityAdjustment(
  knowledgeDepth: CritiqueKnowledgeDepth,
  weakDomains: string[],
  strongDomains: string[],
  dismissalPatterns: DismissalPattern[],
): number {
  let adjustment = 0;

  switch (knowledgeDepth) {
    case "surface":
      adjustment -= 1;
      break;
    case "developing":
      adjustment += 0;
      break;
    case "deep":
      adjustment += 1;
      break;
    case "comprehensive":
      adjustment += 2;
      break;
  }

  if (weakDomains.length > 0) {
    adjustment += 1;
  }

  if (strongDomains.length > 0) {
    adjustment -= 1;
  }

  if (dismissalPatterns.some((pattern) => pattern.dismissalCount >= 2)) {
    adjustment += 1;
  }

  return Math.max(-2, Math.min(2, adjustment));
}

function buildCritiqueModeAdjustment(
  knowledgeDepth: CritiqueKnowledgeDepth,
  weakDomains: string[],
  strongDomains: string[],
  dismissalPatterns: DismissalPattern[],
): string {
  if (knowledgeDepth === "surface") {
    return "Keep the first pass light and explanatory. Penny is still learning this user's pattern.";
  }

  if (dismissalPatterns.some((pattern) => pattern.dismissalCount >= 2)) {
    return "Skip the polite framing and go straight at the weak spot because this user tends to defend on first contact.";
  }

  if (weakDomains.length > strongDomains.length) {
    return `Push harder in ${weakDomains[0]} because the calibration history shows a repeat weakness there.`;
  }

  if (strongDomains.length > 0) {
    return `Stay sharp but avoid over-pressuring ${strongDomains[0]} because the user is comparatively steady there.`;
  }

  return "Use the user's established critique mix, but keep the pressure explicit.";
}

function computeKnowledgeAgeDays(
  biasProfile: CognitiveBiasProfile | null,
  lens: PennyLensSnapshot | null,
  rounds: DialecticRoundSignal[],
): number {
  const dates: Date[] = [];
  for (const entry of biasProfile?.biasEntries ?? []) {
    if (entry.firstDetected instanceof Date) {
      dates.push(entry.firstDetected);
    }
  }

  for (const shape of lens?.effectiveShapes ?? []) {
    if (shape.derivation?.computedAt instanceof Date) {
      dates.push(shape.derivation.computedAt);
    }
  }

  for (const round of rounds) {
    dates.push(round.createdAt);
  }

  if (!dates.length) {
    return 0;
  }

  const earliest = dates.reduce((min, current) => (current.getTime() < min.getTime() ? current : min));
  return Math.max(0, Math.floor((Date.now() - earliest.getTime()) / (1000 * 60 * 60 * 24)));
}

function computeKnowledgeDepth(params: {
  observedRounds: number;
  confirmedBiases: string[];
  dominantShapes: string[];
  weakDomains: string[];
  strongDomains: string[];
}): CritiqueKnowledgeDepth {
  const score =
    params.observedRounds * 0.6 +
    params.confirmedBiases.length * 1.2 +
    params.dominantShapes.length * 0.8 +
    params.weakDomains.length * 0.8 +
    params.strongDomains.length * 0.4;

  if (score < 4) {
    return "surface";
  }

  if (score < 9) {
    return "developing";
  }

  if (score < 16) {
    return "deep";
  }

  return "comprehensive";
}

function generateKnowledgeDepthMessage(
  depth: CritiqueKnowledgeDepth,
  observedRounds: number,
  confirmedBiasCount: number,
  weakDomainCount: number,
): string {
  switch (depth) {
    case "surface":
      return "Penny is still learning your critique style here. This pass stays conservative.";
    case "developing":
      return `Penny has seen ${observedRounds} critique round${observedRounds === 1 ? "" : "s"} and is starting to sharpen the push.`;
    case "deep":
      return `Penny has enough history to push harder, especially where ${confirmedBiasCount} documented bias pattern${confirmedBiasCount === 1 ? "" : "s"} and ${weakDomainCount} weak domain${weakDomainCount === 1 ? "" : "s"} show up.`;
    case "comprehensive":
      return "Penny has a strong model of how you take critique and can aim at the specific weak spots instead of speaking generically.";
  }
}

function buildCritiqueSummary(params: {
  targetDomain: string;
  targetClaimType: ClaimStructureKind | null;
  knowledgeDepthMessage: string;
  confirmedBiases: string[];
  dominantShapes: string[];
  weakDomains: string[];
  strongDomains: string[];
}) {
  const pieces = [
    params.targetClaimType ? `${params.targetClaimType} claims` : "this claim",
    `in ${params.targetDomain}`,
    params.knowledgeDepthMessage,
  ];

  if (params.confirmedBiases.length > 0) {
    pieces.push(`It is using ${params.confirmedBiases[0]} as a live critique lens.`);
  }

  if (params.dominantShapes.length > 0) {
    pieces.push(`The dominant shape now is ${params.dominantShapes[0]}.`);
  }

  if (params.weakDomains.length > 0) {
    pieces.push(`Weakest domain: ${params.weakDomains[0]}.`);
  } else if (params.strongDomains.length > 0) {
    pieces.push(`Strongest domain: ${params.strongDomains[0]}.`);
  }

  return joinAsSentence(pieces);
}

function summarizeText(text: string, maxLength: number): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function joinAsSentence(parts: string[]): string {
  return parts
    .map((part) => part.trim().replace(/\.$/, ""))
    .filter((part) => part.length > 0)
    .join(". ")
    .concat(parts.length > 0 ? "." : "");
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter((value) => value.length > 0)));
}

function findSelectedNode(map: ThoughtMapModel): ThoughtNodeModel | null {
  return map.nodes.find((node) => node.kind !== "root") ?? map.nodes[0] ?? null;
}
