import type {
  CalibrationCoaching,
  CalibrationImpact,
  CalibrationPoint,
  CalibrationTrend,
  ClaimStructureKind,
  ClaimResolutionType,
  ClaimTypeCalibrationProfile,
  CoachingRecommendation,
  DomainCalibrationProfile,
  CalibrationDomain,
  CalibrationCoachingRejection,
  ThoughtMapModel,
} from "@/types/thought-map";
import { buildCalibrationDashboard, captureSnapshotForMap } from "@/lib/penny-insights";

type CalibrationSample = {
  mapId: string;
  confidence: number;
  actualProbability: number;
  brierScore: number;
  updatedAt: Date;
  domain: CalibrationDomain;
  claimType: ClaimStructureKind;
};

export type CalibrationIndicator = {
  domain: CalibrationDomain;
  claimType: ClaimStructureKind;
  recommendationId: string;
  recommendationText: string;
  adjustment: number;
  priority: "low" | "medium" | "high";
};

function average(values: number[]) {
  if (!values.length) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function confidenceBucketLabel(confidence: number) {
  const normalized = clamp(confidence, 0, 100);
  const start = Math.floor(normalized / 10) * 10;
  const end = Math.min(100, start + 10);
  return `${start}-${end}%`;
}

export function calculateBrierScore(predictedProbability: number, actualProbability: number) {
  const p = clamp(predictedProbability, 0, 1);
  const a = clamp(actualProbability, 0, 1);
  return Number(((p - a) ** 2).toFixed(4));
}

export function calculateLogScore(predictedProbability: number, actualProbability: number) {
  const epsilon = 1e-6;
  const p = clamp(predictedProbability, epsilon, 1 - epsilon);
  const a = clamp(actualProbability, 0, 1);
  const score = -(a * Math.log(p) + (1 - a) * Math.log(1 - p));
  return Number(score.toFixed(4));
}

export function outcomeProbability(resolutionType: ClaimResolutionType) {
  switch (resolutionType) {
    case "confirmed":
      return 1;
    case "partially_confirmed":
      return 0.75;
    case "inconclusive":
      return 0.5;
    case "reframed":
      return 0.5;
    case "superseded":
      return 0.25;
    case "disconfirmed":
    default:
      return 0;
  }
}

export function updateDomainCalibration(
  history: Array<{
    domain: string;
    predictedConfidence: number;
    actualProbability: number;
    brierScore: number;
    logScore: number;
  }>,
  params: {
    domain: string;
    predictedConfidence: number;
    actualProbability: number;
    brierScore: number;
    logScore: number;
  },
): CalibrationImpact {
  const previousAverage = average(history.map((entry) => entry.brierScore)) ?? 0;
  const previousConfidenceAverage = average(history.map((entry) => entry.predictedConfidence)) ?? 0;
  const newHistory = [...history, params];
  const newAverage = average(newHistory.map((entry) => entry.brierScore)) ?? 0;
  const confidenceAdjustmentSuggested = Math.round((params.actualProbability - params.predictedConfidence) * 100);

  return {
    domainAffected: params.domain,
    previousBrierScore: Number(previousAverage.toFixed(3)),
    newBrierScore: Number(newAverage.toFixed(3)),
    directionOfChange:
      newAverage < previousAverage ? "improved" : newAverage > previousAverage ? "degraded" : "unchanged",
    confidenceAdjustmentSuggested:
      Math.abs(confidenceAdjustmentSuggested) >= 5 ? confidenceAdjustmentSuggested : Math.round((params.actualProbability - previousConfidenceAverage) * 100),
  };
}

export function classifyCalibrationDomain(text: string): CalibrationDomain {
  if (/(market|distribution|pricing|buyer|customer acquisition|adoption|retention|competition|competitive|moat)/i.test(text)) {
    return "market";
  }

  if (/(ops|operation|workflow|process|handoff|execution|delivery|team|hiring|logistics)/i.test(text)) {
    return "operational";
  }

  if (/(research|evidence|study|experiment|validation|interview|test|data)/i.test(text)) {
    return "research";
  }

  if (/(technical|infra|engineering|architecture|system|code|api|developer|timeline|latency)/i.test(text)) {
    return "technical";
  }

  if (/(people|relationship|leadership|culture|manager|communication|social|stakeholder)/i.test(text)) {
    return "people";
  }

  return "general";
}

function claimTypeLabel(claimType: ClaimStructureKind) {
  return claimType.replaceAll("_", " ");
}

function buildCalibrationSamples(maps: ThoughtMapModel[]) {
  const dashboard = buildCalibrationDashboard(maps);
  const samples: CalibrationSample[] = [];

  for (const map of maps) {
    const capture = captureSnapshotForMap(map);
    const resolutionEvents = map.events.filter((event) => event.eventType === "claim_resolution");
    const eventSamples = resolutionEvents
      .map((event) => {
        const payload = event.payload && typeof event.payload === "object" ? (event.payload as Record<string, unknown>) : null;
        const claimId = typeof payload?.claimId === "string" ? payload.claimId : null;
        const resolutionType =
          payload?.resolutionType === "confirmed" ||
          payload?.resolutionType === "disconfirmed" ||
          payload?.resolutionType === "partially_confirmed" ||
          payload?.resolutionType === "inconclusive" ||
          payload?.resolutionType === "reframed" ||
          payload?.resolutionType === "superseded"
            ? (payload.resolutionType as ClaimResolutionType)
            : null;
        const predictedConfidenceAtResolution =
          typeof payload?.predictedConfidenceAtResolution === "number" ? payload.predictedConfidenceAtResolution : null;

        if (!claimId || predictedConfidenceAtResolution == null || !resolutionType) {
          return null;
        }

        const claim = map.nodes.find((node) => node.id === claimId) ?? null;
        const actualProbability = outcomeProbability(resolutionType);
        const claimType = capture?.structureKind ?? "assertion";
        const domain = classifyCalibrationDomain(`${map.title} ${map.rawThought} ${claim?.content ?? ""}`);

        return {
          mapId: map.id,
          confidence: predictedConfidenceAtResolution,
          actualProbability,
          brierScore: calculateBrierScore(predictedConfidenceAtResolution / 100, actualProbability),
          updatedAt: event.createdAt instanceof Date ? event.createdAt : new Date(event.createdAt),
          domain,
          claimType,
        } satisfies CalibrationSample;
      })
      .filter((sample): sample is CalibrationSample => sample !== null);

    if (eventSamples.length) {
      samples.push(...eventSamples);
      continue;
    }

    const resolved = dashboard.resolvedClaims.find((claim) => claim.mapId === map.id);

    if (!capture || !resolved || resolved.outcome == null || resolved.brierScore == null) {
      continue;
    }

    samples.push({
      mapId: map.id,
      confidence: resolved.confidence,
      actualProbability: resolved.outcome,
      brierScore: resolved.brierScore,
      updatedAt: resolved.updatedAt,
      domain: resolved.domain,
      claimType: capture.structureKind ?? "assertion",
    });
  }

  return { dashboard, samples };
}

function buildCalibrationCurve(samples: CalibrationSample[]): CalibrationPoint[] {
  const buckets = Array.from({ length: 10 }, (_, index) => {
    const start = index * 10;
    const end = start + 10;
    const bucketSamples = samples.filter((sample) => {
      const normalized = clamp(sample.confidence, 0, 100);
      return index === 9 ? normalized >= start && normalized <= 100 : normalized >= start && normalized < end;
    });

    const actualRate = average(bucketSamples.map((sample) => sample.actualProbability * 100));

    return {
      confidenceBucket: `${start}-${end}%`,
      predictedRate: start + 5,
      actualRate: actualRate == null ? 0 : Number(actualRate.toFixed(1)),
      sampleSize: bucketSamples.length,
    };
  });

  return buckets;
}

function overallErrorMagnitude(curve: CalibrationPoint[]) {
  const weighted = curve.flatMap((point) => {
    if (!point.sampleSize) {
      return [];
    }

    return Array.from({ length: point.sampleSize }, () => Math.abs(point.actualRate - point.predictedRate));
  });

  return weighted.length ? Number(average(weighted)!.toFixed(1)) : 0;
}

function classifySystematicError(
  curve: CalibrationPoint[],
  sampleSize: number,
): DomainCalibrationProfile["systematicError"] {
  if (sampleSize < 3) {
    return "insufficient_data";
  }

  const sampled = curve.filter((point) => point.sampleSize > 0);
  if (!sampled.length) {
    return "insufficient_data";
  }

  const averageGap = average(sampled.map((point) => point.actualRate - point.predictedRate));
  const averageAbsGap = average(sampled.map((point) => Math.abs(point.actualRate - point.predictedRate)));

  if (averageAbsGap == null || averageAbsGap < 5) {
    return "well_calibrated";
  }

  if (averageGap != null && averageGap > 5) {
    return "underconfident";
  }

  if (averageGap != null && averageGap < -5) {
    return "overconfident";
  }

  return "well_calibrated";
}

function domainCoachingNote(domain: CalibrationDomain, profile: DomainCalibrationProfile) {
  if (profile.systematicError === "insufficient_data") {
    return `Not enough resolved ${domain} claims yet to coach confidently. Keep scoring claims in this domain.`;
  }

  const strongestGap = profile.calibrationCurve
    .filter((point) => point.sampleSize > 0)
    .reduce<{ point: CalibrationPoint | null; gap: number }>(
      (best, point) => {
        const gap =
          profile.systematicError === "underconfident"
            ? point.actualRate - point.predictedRate
            : point.predictedRate - point.actualRate;

        if (gap <= best.gap) {
          return best;
        }

        return { point, gap };
      },
      { point: null, gap: 0 },
    ).point;

  if (profile.systematicError === "overconfident") {
    const bucket = strongestGap ?? profile.calibrationCurve.find((point) => point.sampleSize > 0) ?? null;
    const bucketLabel = bucket ? `${Math.max(0, Math.min(100, Math.round(bucket.predictedRate - 5)))}%` : confidenceBucketLabel(70);
    const actualRate = bucket ? bucket.actualRate : Math.max(0, 100 - Math.round(profile.errorMagnitude));
    return `In ${domain} claims, when you say ${bucketLabel}, you're right only ${actualRate}% of the time. Try lowering your opening confidence by about ${Math.max(5, Math.round(profile.errorMagnitude))} points before you've stress-tested the claim.`;
  }

  if (profile.systematicError === "underconfident") {
    const bucket = strongestGap ?? profile.calibrationCurve.find((point) => point.sampleSize > 0) ?? null;
    const bucketLabel = bucket ? `${Math.max(0, Math.min(100, Math.round(bucket.predictedRate - 5)))}%` : confidenceBucketLabel(60);
    const actualRate = bucket ? bucket.actualRate : Math.min(100, Math.round(100 - profile.errorMagnitude));
    return `In ${domain} claims, when you say ${bucketLabel}, you're right ${actualRate}% of the time. You may be discounting your own judgment, so consider raising your opening confidence by about ${Math.max(5, Math.round(profile.errorMagnitude))} points when the evidence is solid.`;
  }

  return `You have excellent calibration in ${domain} claims (Brier: ${profile.averageBrierScore.toFixed(2)}). This is your strongest domain, so lean into that confidence.`;
}

function claimTypeCoachingNote(profile: ClaimTypeCalibrationProfile) {
  if (profile.systematicError === "insufficient_data") {
    return `Not enough resolved ${claimTypeLabel(profile.claimType)} claims yet to coach on this structure.`;
  }

  if (profile.systematicError === "overconfident") {
    return `Your ${claimTypeLabel(profile.claimType)} claims are running hot. Reduce your opening confidence until more evidence lands.`;
  }

  if (profile.systematicError === "underconfident") {
    return `Your ${claimTypeLabel(profile.claimType)} claims are stronger than you are currently rating them. You may be discounting your own judgment on this claim structure.`;
  }

  return `Your ${claimTypeLabel(profile.claimType)} claims are roughly calibrated. Keep using the same update rhythm.`;
}

function recommendationPriority(errorMagnitude: number, sampleSize: number) {
  if (errorMagnitude >= 15 || sampleSize >= 10) {
    return "high" as const;
  }

  if (errorMagnitude >= 8 || sampleSize >= 5) {
    return "medium" as const;
  }

  return "low" as const;
}

function buildRecommendation(params: {
  id: string;
  domain: CalibrationDomain | null;
  claimType: ClaimStructureKind | null;
  systematicError: "overconfident" | "underconfident" | "well_calibrated" | "insufficient_data";
  errorMagnitude: number;
  evidenceCount: number;
  note: string;
}): CoachingRecommendation {
  if (params.systematicError === "insufficient_data") {
    return {
      id: params.id,
      domain: params.domain,
      claimType: params.claimType,
      recommendationType: "seek_more_evidence" as const,
      recommendationText: params.note,
      magnitude: 0,
      evidenceCount: params.evidenceCount,
      priority: "low" as const,
    };
  }

  if (params.systematicError === "overconfident") {
    return {
      id: params.id,
      domain: params.domain,
      claimType: params.claimType,
      recommendationType: params.evidenceCount >= 6 ? ("use_base_rate" as const) : ("reduce_confidence" as const),
      recommendationText: params.note,
      magnitude: Math.max(5, Math.min(25, Math.round(params.errorMagnitude))),
      evidenceCount: params.evidenceCount,
      priority: recommendationPriority(params.errorMagnitude, params.evidenceCount),
    };
  }

  if (params.systematicError === "underconfident") {
    return {
      id: params.id,
      domain: params.domain,
      claimType: params.claimType,
      recommendationType: params.evidenceCount >= 6 ? ("apply_reference_class" as const) : ("increase_confidence" as const),
      recommendationText: params.note,
      magnitude: Math.max(5, Math.min(25, Math.round(params.errorMagnitude))),
      evidenceCount: params.evidenceCount,
      priority: recommendationPriority(params.errorMagnitude, params.evidenceCount),
    };
  }

  return {
    id: params.id,
    domain: params.domain,
    claimType: params.claimType,
    recommendationType: "stress_test_more" as const,
    recommendationText: params.note,
    magnitude: Math.max(5, Math.min(15, Math.round(params.errorMagnitude || 5))),
    evidenceCount: params.evidenceCount,
    priority: "low" as const,
  };
}

function buildDomainProfiles(samples: CalibrationSample[], claimCountsByDomain: Map<CalibrationDomain, number>): DomainCalibrationProfile[] {
  const buckets = new Map<
    CalibrationDomain,
    Array<CalibrationSample & { claimCount: number }>
  >();

  for (const sample of samples) {
    const bucket = buckets.get(sample.domain) ?? [];
    bucket.push({ ...sample, claimCount: 1 });
    buckets.set(sample.domain, bucket);
  }

  const profiles = Array.from(buckets.entries()).map<DomainCalibrationProfile>(([domain, domainSamples]) => {
    const resolvedClaimCount = domainSamples.length;
    const calibrationCurve = buildCalibrationCurve(domainSamples);
    const averageBrierScore = average(domainSamples.map((sample) => sample.brierScore)) ?? 0;
    const systematicError = classifySystematicError(calibrationCurve, resolvedClaimCount);
    const errorMagnitude = overallErrorMagnitude(calibrationCurve);
    return {
      domain,
      claimCount: claimCountsByDomain.get(domain) ?? domainSamples.length,
      resolvedClaimCount,
      averageBrierScore: Number(averageBrierScore.toFixed(3)),
      calibrationCurve,
      systematicError,
      errorMagnitude,
      bestDomain: false,
      worstDomain: false,
      coachingNote: "",
    };
  });

  if (!profiles.length) {
    return profiles;
  }

  const sortable = profiles.filter((profile) => profile.systematicError !== "insufficient_data");
  const best = sortable.slice().sort((a, b) => a.errorMagnitude - b.errorMagnitude)[0] ?? null;
  const worst = sortable.slice().sort((a, b) => b.errorMagnitude - a.errorMagnitude)[0] ?? null;

  return profiles
    .map((profile) => {
      const coachingNote = domainCoachingNote(profile.domain, profile);
      return {
        ...profile,
        coachingNote,
        bestDomain: best?.domain === profile.domain,
        worstDomain: worst?.domain === profile.domain,
      };
    })
    .sort((a, b) => {
      const rank = { high: 2, medium: 1, low: 0 } as const;
      return rank[recommendationPriority(b.errorMagnitude, b.resolvedClaimCount)] - rank[recommendationPriority(a.errorMagnitude, a.resolvedClaimCount)] || b.resolvedClaimCount - a.resolvedClaimCount;
    });
}

function buildClaimTypeProfiles(samples: CalibrationSample[]): ClaimTypeCalibrationProfile[] {
  const buckets = new Map<ClaimStructureKind, CalibrationSample[]>();

  for (const sample of samples) {
    const bucket = buckets.get(sample.claimType) ?? [];
    bucket.push(sample);
    buckets.set(sample.claimType, bucket);
  }

  return Array.from(buckets.entries())
    .map<ClaimTypeCalibrationProfile>(([claimType, claimSamples]) => {
      const averageConfidence = average(claimSamples.map((sample) => sample.confidence)) ?? 0;
      const averageOutcome = average(claimSamples.map((sample) => sample.actualProbability * 100)) ?? 0;
      const averageBrierScore = average(claimSamples.map((sample) => sample.brierScore)) ?? 0;
      const gap = Math.abs(averageConfidence - averageOutcome);
      const systematicError: ClaimTypeCalibrationProfile["systematicError"] =
        claimSamples.length < 3
          ? ("insufficient_data" as const)
          : gap < 5
            ? ("well_calibrated" as const)
            : averageOutcome > averageConfidence
              ? ("underconfident" as const)
              : ("overconfident" as const);

      return {
        claimType,
        resolvedCount: claimSamples.length,
        averageBrierScore: Number(averageBrierScore.toFixed(3)),
        systematicError,
        coachingNote: "",
      };
    })
    .map((profile) => ({
      ...profile,
      coachingNote: claimTypeCoachingNote(profile),
    }))
    .sort((a, b) => b.resolvedCount - a.resolvedCount);
}

function buildCoachingRejectionHistory(rejections: CalibrationCoachingRejection[] | undefined) {
  return [...(rejections ?? [])].sort((a, b) => b.dismissedAt.getTime() - a.dismissedAt.getTime());
}

function overallTrendFromProfiles(domainProfiles: DomainCalibrationProfile[]) {
  const useful = domainProfiles.filter((profile) => profile.systematicError !== "insufficient_data");

  if (!useful.length) {
    return "stable" as CalibrationTrend;
  }

  const averageError = average(useful.map((profile) => profile.errorMagnitude)) ?? 0;
  const overconfidentCount = useful.filter((profile) => profile.systematicError === "overconfident").length;
  const underconfidentCount = useful.filter((profile) => profile.systematicError === "underconfident").length;

  if (averageError <= 6 && Math.abs(overconfidentCount - underconfidentCount) <= 1) {
    return "improving" as CalibrationTrend;
  }

  if (averageError >= 15 && overconfidentCount > underconfidentCount) {
    return "degrading" as CalibrationTrend;
  }

  return "stable" as CalibrationTrend;
}

function buildRecommendations(
  domainProfiles: DomainCalibrationProfile[],
  claimTypeProfiles: ClaimTypeCalibrationProfile[],
): CoachingRecommendation[] {
  const domainRecs = domainProfiles.map((profile) =>
    buildRecommendation({
      id: `domain:${profile.domain}`,
      domain: profile.domain,
      claimType: null,
      systematicError: profile.systematicError,
      errorMagnitude: profile.errorMagnitude,
      evidenceCount: profile.resolvedClaimCount,
      note: profile.coachingNote,
    }),
  );

  const claimTypeRecs = claimTypeProfiles.map((profile) =>
    buildRecommendation({
      id: `claim-type:${profile.claimType}`,
      domain: null,
      claimType: profile.claimType,
      systematicError: profile.systematicError,
      errorMagnitude: profile.averageBrierScore * 100,
      evidenceCount: profile.resolvedCount,
      note: profile.coachingNote,
    }),
  );

  return [...domainRecs, ...claimTypeRecs]
    .sort((a, b) => {
      const rank = { high: 2, medium: 1, low: 0 } as const;
      return rank[b.priority] - rank[a.priority] || b.evidenceCount - a.evidenceCount || b.magnitude - a.magnitude;
    })
    .slice(0, 8);
}

export function buildCalibrationCoaching(maps: ThoughtMapModel[], userId?: string): CalibrationCoaching {
  const { samples } = buildCalibrationSamples(maps);
  const claimCountsByDomain = new Map<CalibrationDomain, number>();

  for (const map of maps) {
    const text = `${map.title} ${map.rawThought} ${map.nodes.map((node) => node.content).join(" ")}`;
    const domain = classifyCalibrationDomain(text);
    claimCountsByDomain.set(domain, (claimCountsByDomain.get(domain) ?? 0) + 1);
  }

  const domainProfiles = buildDomainProfiles(samples, claimCountsByDomain);
  const claimTypeProfiles = buildClaimTypeProfiles(samples);
  const coachingRecommendations = buildRecommendations(domainProfiles, claimTypeProfiles);
  const overallTrend = overallTrendFromProfiles(domainProfiles);

  return {
    userId: userId ?? maps[0]?.userId ?? "",
    generatedAt: new Date(),
    domainProfiles,
    claimTypeProfiles,
    coachingRecommendations,
    overallTrend,
    rejectionHistory: [],
  };
}

export function calibrationIndicatorForClaim(params: {
  coaching: CalibrationCoaching | null;
  claimText: string;
  claimType: ClaimStructureKind;
  confidence: number;
}): CalibrationIndicator | null {
  if (!params.coaching) {
    return null;
  }

  const domain = classifyCalibrationDomain(params.claimText);
  const domainProfile = params.coaching.domainProfiles.find((profile) => profile.domain === domain);
  const claimTypeProfile = params.coaching.claimTypeProfiles.find((profile) => profile.claimType === params.claimType);
  const candidates: Array<
    | { kind: "domain"; profile: DomainCalibrationProfile }
    | { kind: "claimType"; profile: ClaimTypeCalibrationProfile }
  > = [];

  if (domainProfile && domainProfile.systematicError !== "insufficient_data") {
    candidates.push({ kind: "domain", profile: domainProfile });
  }

  if (claimTypeProfile && claimTypeProfile.systematicError !== "insufficient_data") {
    candidates.push({ kind: "claimType", profile: claimTypeProfile });
  }

  const candidate = candidates.sort((a, b) => {
    const aMagnitude = a.kind === "domain" ? a.profile.errorMagnitude : a.profile.averageBrierScore * 100;
    const bMagnitude = b.kind === "domain" ? b.profile.errorMagnitude : b.profile.averageBrierScore * 100;
    return bMagnitude - aMagnitude;
  })[0] ?? null;

  if (!candidate) {
    return null;
  }

  const adjustmentBase = candidate.kind === "domain" ? candidate.profile.errorMagnitude : candidate.profile.averageBrierScore * 100;
  const adjustment =
    candidate.profile.systematicError === "underconfident"
      ? Math.max(5, Math.min(25, Math.round(adjustmentBase)))
      : -Math.max(5, Math.min(25, Math.round(adjustmentBase)));

  if (candidate.profile.systematicError === "well_calibrated") {
    return null;
  }

  return {
    domain,
    claimType: params.claimType,
    recommendationId:
      candidate.kind === "domain"
        ? `domain:${candidate.profile.domain}`
        : `claim-type:${candidate.profile.claimType}`,
    recommendationText:
      candidate.profile.coachingNote.trim().length > 0
        ? candidate.profile.coachingNote
        : candidate.profile.systematicError === "underconfident"
          ? "You may be discounting your own judgment here."
          : "Your opening confidence looks too high for the evidence that has shown up so far.",
    adjustment,
    priority:
      candidate.kind === "domain"
        ? recommendationPriority(candidate.profile.errorMagnitude, candidate.profile.resolvedClaimCount)
        : recommendationPriority(candidate.profile.averageBrierScore * 100, candidate.profile.resolvedCount),
  };
}

export function buildCalibrationCoachingWithRejections(
  maps: ThoughtMapModel[],
  userId?: string,
  rejectionHistory: CalibrationCoachingRejection[] = [],
) {
  return {
    ...buildCalibrationCoaching(maps, userId),
    rejectionHistory: buildCoachingRejectionHistory(rejectionHistory),
  };
}
