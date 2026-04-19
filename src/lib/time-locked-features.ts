import { buildCalibrationDashboard, derivePennyShapes } from "@/lib/penny-insights";
import { TIME_LOCKED_FEATURES, type FeatureUnlockStatus, type LockRequirement, type LockRequirementType, type TimeLockRequirement } from "@/types/time-locked-features";
import type { ThoughtMapModel } from "@/types/thought-map";

type HistoryCounts = {
  claimCount: number;
  resolutionCount: number;
  dialecticRoundCount: number;
  shapeCount: number;
  domainCoverage: number;
  ageDays: number;
};

export function buildFeatureUnlockStatuses(params: {
  userId: string;
  maps: ThoughtMapModel[];
}): FeatureUnlockStatus[] {
  const counts = computeHistoryCounts(params.maps, new Date());
  const unlockTimeline = buildUnlockTimeline(params.maps);

  return TIME_LOCKED_FEATURES.map((feature) => {
    const requirements = feature.requirements.map((requirement) =>
      fillRequirement(requirement.requirementType, requirement.threshold, counts),
    );
    const allRequirementsMet = requirements.every((requirement) => requirement.isMet);
    const percentComplete = requirements.length
      ? Math.round(requirements.reduce((sum, requirement) => sum + requirement.progressPercent, 0) / requirements.length)
      : 100;

    return {
      userId: params.userId,
      featureId: feature.featureId,
      isUnlocked: allRequirementsMet,
      unlockedAt: unlockTimeline.get(feature.featureId) ?? null,
      requirements,
      allRequirementsMet,
      percentComplete,
      estimatedUnlockDate: allRequirementsMet ? unlockTimeline.get(feature.featureId) ?? null : estimateUnlockDate(requirements, counts),
    };
  });
}

export function buildUnlockSummary(statuses: FeatureUnlockStatus[]) {
  const unlocked = statuses.filter((status) => status.isUnlocked);
  const locked = statuses.filter((status) => !status.isUnlocked);
  const nextFeature = locked.slice().sort((a, b) => a.percentComplete - b.percentComplete)[0] ?? null;
  const recentlyUnlocked = statuses.filter((status) => status.isUnlocked && status.unlockedAt && daysBetween(status.unlockedAt, new Date()) < 7);

  return {
    unlockedCount: unlocked.length,
    lockedCount: locked.length,
    recentlyUnlockedCount: recentlyUnlocked.length,
    nextFeature,
  };
}

export function featureRouteForId(featureId: string): string {
  const routes: Record<string, string> = {
    personal_base_rates: "/app/base-rates",
    intellectual_biography: "/app/identity",
    here_before_signal: "/app/new",
    cognitive_fingerprint: "/app/identity",
    calibration_coaching: "/app",
    intellectual_velocity: "/app/velocity",
  };

  return routes[featureId] ?? "/app";
}

export function featureUnlockDefinition(featureId: string): TimeLockRequirement | null {
  return TIME_LOCKED_FEATURES.find((feature) => feature.featureId === featureId) ?? null;
}

function computeHistoryCounts(maps: ThoughtMapModel[], asOf: Date): HistoryCounts {
  const orderedMaps = maps.slice().sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const allNodes = orderedMaps.flatMap((map) => map.nodes.filter((node) => node.kind !== "root" && node.nodeStatus !== "superseded"));
  const calibration = buildCalibrationDashboard(orderedMaps);
  const shapes = derivePennyShapes(allNodes);
  const ageDays = orderedMaps.length
    ? Math.max(0, Math.floor((asOf.getTime() - orderedMaps[0]!.createdAt.getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  return {
    claimCount: allNodes.length,
    resolutionCount: calibration.resolvedClaims.length,
    dialecticRoundCount: orderedMaps.reduce((sum, map) => sum + map.events.filter((event) => event.eventType === "dialectic_round").length, 0),
    shapeCount: shapes.length,
    domainCoverage: new Set(calibration.resolvedClaims.map((claim) => claim.domain)).size,
    ageDays,
  };
}

function fillRequirement(requirementType: LockRequirementType, threshold: number, counts: HistoryCounts): LockRequirement {
  const currentValue = currentValueForRequirement(requirementType, counts);
  const isMet = currentValue >= threshold;
  const progressPercent = threshold <= 0 ? 100 : Math.max(0, Math.min(100, Math.round((currentValue / threshold) * 100)));

  return {
    requirementType,
    threshold,
    currentValue,
    isMet,
    progressPercent,
  };
}

function currentValueForRequirement(requirementType: LockRequirementType, counts: HistoryCounts): number {
  switch (requirementType) {
    case "min_claims":
      return counts.claimCount;
    case "min_days":
      return counts.ageDays;
    case "min_resolutions":
      return counts.resolutionCount;
    case "min_dialectic_rounds":
      return counts.dialecticRoundCount;
    case "min_shapes":
      return counts.shapeCount;
    case "domain_coverage":
      return counts.domainCoverage;
  }
}

function estimateUnlockDate(requirements: LockRequirement[], counts: HistoryCounts): Date | null {
  if (!requirements.length) {
    return null;
  }

  const estimatedDaysRemaining = requirements
    .filter((requirement) => !requirement.isMet)
    .map((requirement) => {
      const currentValue = requirement.currentValue;
      const remaining = requirement.threshold - currentValue;

      if (remaining <= 0) {
        return 0;
      }

      const pace = requirement.requirementType === "min_days" ? 1 : currentValue / Math.max(1, counts.ageDays);
      if (pace <= 0) {
        return null;
      }

      return Math.ceil(remaining / pace);
    })
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (!estimatedDaysRemaining.length) {
    return null;
  }

  const daysRemaining = Math.max(...estimatedDaysRemaining);
  return new Date(Date.now() + daysRemaining * 24 * 60 * 60 * 1000);
}

function buildUnlockTimeline(maps: ThoughtMapModel[]) {
  const orderedMaps = maps.slice().sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const unlockDates = new Map<string, Date>();

  for (let index = 1; index <= orderedMaps.length; index += 1) {
    const slice = orderedMaps.slice(0, index);
    const counts = computeHistoryCounts(slice, orderedMaps[index - 1]!.updatedAt);

    for (const feature of TIME_LOCKED_FEATURES) {
      if (unlockDates.has(feature.featureId)) {
        continue;
      }

      const requirements = feature.requirements.map((requirement) => fillRequirement(requirement.requirementType, requirement.threshold, counts));
      if (requirements.every((requirement) => requirement.isMet)) {
        unlockDates.set(feature.featureId, orderedMaps[index - 1]!.updatedAt);
      }
    }
  }

  return unlockDates;
}

function daysBetween(start: Date, end: Date) {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
}
