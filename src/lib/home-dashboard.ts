import { buildBlindSpotMap, buildCalibrationDashboard, buildMemoryTimeDashboard } from "@/lib/penny-insights";
import { buildRevisitQueue } from "@/lib/revisit-scheduler";
import { buildVelocityReport } from "@/lib/intellectual-velocity";
import { buildOnboardingChecklist, buildOnboardingState } from "@/lib/onboarding";
import { buildFeatureUnlockStatuses, buildUnlockSummary, featureUnlockDefinition } from "@/lib/time-locked-features";
import type { MarginFragmentModel, SessionCardModel } from "@/types/penny";
import type {
  DashboardAlert,
  DashboardPanel,
  HomeDashboardState,
  PrimaryAction,
  SessionSuggestion,
  UserMaturity,
  UserState,
} from "@/types/home-dashboard";
import type { ThoughtMapModel } from "@/types/thought-map";

function sortByNewest<T extends { updatedAt?: Date; createdAt?: Date }>(items: T[]) {
  return [...items].sort((a, b) => {
    const aTime = (a.updatedAt ?? a.createdAt ?? new Date(0)).getTime();
    const bTime = (b.updatedAt ?? b.createdAt ?? new Date(0)).getTime();
    return bTime - aTime;
  });
}

function computeUserMaturity(userState: UserState): UserMaturity {
  const maps = sortByNewest(userState.maps);

  if (maps.length === 0) {
    return "new";
  }

  const earliestMap = maps.reduce((oldest, map) => (map.createdAt < oldest ? map.createdAt : oldest), maps[0]!.createdAt);
  const ageDays = Math.max(0, Math.floor((Date.now() - earliestMap.getTime()) / (1000 * 60 * 60 * 24)));

  if (ageDays < 30) {
    return "early";
  }

  if (ageDays < 120) {
    return "established";
  }

  return "mature";
}

function buildPrimaryAction(
  maturity: UserMaturity,
  maps: ThoughtMapModel[],
  revisitQueue: ReturnType<typeof buildRevisitQueue>,
  resolutionDue: ReturnType<typeof buildCalibrationDashboard>["privateBets"],
): PrimaryAction {
  const latestMap = sortByNewest(maps)[0] ?? null;
  const urgentRevisit = revisitQueue[0] ?? null;
  const dueClaim = sortByNewest(
    resolutionDue
      .filter((bet) => bet.resolutionDate != null)
      .map((bet) => ({
        id: bet.mapId,
        title: bet.title,
        updatedAt: new Date(bet.resolutionDate ?? 0),
      })),
  )[0] ?? null;

  if (maturity === "new") {
    return {
      label: "Start your first map",
      description: "Capture a belief you want to think through carefully.",
      actionType: "create_first_claim",
      targetId: null,
    };
  }

  if (urgentRevisit) {
    return {
      label: `Revisit ${urgentRevisit.claim.content.slice(0, 28)}`,
      description: "A load-bearing claim is due for another pass.",
      actionType: "run_critique",
      targetId: urgentRevisit.claim.id,
    };
  }

  if (dueClaim) {
    return {
      label: `Resolve ${dueClaim.title}`,
      description: "A prediction is close enough to settle that the user should check it now.",
      actionType: "resolve_prediction",
      targetId: dueClaim.id,
    };
  }

  if (maturity === "early") {
    return {
      label: latestMap ? `Continue ${latestMap.title}` : "Capture a thought",
      description: latestMap ? "Pick up the map Penny already knows about." : "Add one raw thought before it disappears.",
      actionType: latestMap ? "continue_map" : "create_first_claim",
      targetId: latestMap?.id ?? null,
    };
  }

  if (maturity === "established") {
    return {
      label: latestMap ? `Continue ${latestMap.title}` : "Search your thinking",
      description: latestMap ? "Return to the current map and push on the weakest node." : "Find the claim, map, or artifact you need right now.",
      actionType: latestMap ? "continue_map" : "start_session",
      targetId: latestMap?.id ?? null,
    };
  }

  return {
    label: latestMap ? `Open ${latestMap.title}` : "Start a session",
    description: latestMap ? "Return to the most load-bearing work first." : "Resume the most important open thread.",
    actionType: latestMap ? "continue_map" : "start_session",
    targetId: latestMap?.id ?? null,
  };
}

function buildSessionSuggestion(
  maturity: UserMaturity,
  maps: ThoughtMapModel[],
  velocityReport: ReturnType<typeof buildVelocityReport>,
  memoryTime: ReturnType<typeof buildMemoryTimeDashboard>,
): SessionSuggestion | null {
  const latestMap = sortByNewest(maps)[0] ?? null;

  if (!latestMap && maturity === "new") {
    return null;
  }

  if (maturity === "new") {
    return {
      suggestedIntentionType: "capture_first_claim",
      reason: "The user still needs a first belief anchor before broader planning matters.",
      estimatedMinutes: 4,
      claimsToFocus: [],
    };
  }

  if (Object.keys(velocityReport.metrics).length === 0) {
    return latestMap
      ? {
          suggestedIntentionType: "stress_test",
          reason: "This map is the strongest available place to build a real session from.",
          estimatedMinutes: 18,
          claimsToFocus: latestMap.nodes.filter((node) => node.kind !== "root").slice(0, 3).map((node) => node.content),
        }
      : null;
  }

  const weakestVelocity = Object.values(velocityReport.metrics)
    .sort((a, b) => a.currentValue - b.currentValue)[0] ?? null;

  if (weakestVelocity) {
    return {
      suggestedIntentionType: weakestVelocity.metricName,
      reason: `The velocity report is weakest in ${weakestVelocity.metricName.toLowerCase()}; this is the best place to spend a session.`,
      estimatedMinutes: 20,
      claimsToFocus: latestMap ? latestMap.nodes.filter((node) => node.kind !== "root").slice(0, 3).map((node) => node.content) : [],
    };
  }

  const digest = memoryTime.beliefDigests[0] ?? null;
  return digest
    ? {
        suggestedIntentionType: "review_recent_updates",
        reason: digest.summary,
        estimatedMinutes: 12,
        claimsToFocus: digest.updatedBeliefCount > 0 ? digest.updatedBeliefs.slice(0, 3) : [],
      }
    : null;
}

function buildPanels(params: {
  userId: string;
  maturity: UserMaturity;
  maps: ThoughtMapModel[];
  onboardingChecklist: ReturnType<typeof buildOnboardingChecklist>;
  onboardingState: ReturnType<typeof buildOnboardingState>;
  revisitQueue: ReturnType<typeof buildRevisitQueue>;
  blindSpotMap: ReturnType<typeof buildBlindSpotMap>;
  calibration: ReturnType<typeof buildCalibrationDashboard>;
  memoryTime: ReturnType<typeof buildMemoryTimeDashboard>;
  velocityReport: ReturnType<typeof buildVelocityReport>;
  unlockStatuses: ReturnType<typeof buildFeatureUnlockStatuses>;
  unlockSummary: ReturnType<typeof buildUnlockSummary>;
}): DashboardPanel[] {
  const recentMaps = sortByNewest(params.maps).slice(0, 4);
  const dueClaims = params.calibration.privateBets
    .filter((bet) => bet.resolutionDate != null)
    .sort((a, b) => new Date(a.resolutionDate ?? 0).getTime() - new Date(b.resolutionDate ?? 0).getTime())
    .slice(0, 4);

  const panels: DashboardPanel[] = [
    {
      id: "onboarding_checklist",
      panelType: "onboarding_checklist",
      priority: 1,
      isVisible: params.maturity === "new" || params.maturity === "early",
      data: {
        onboardingState: params.onboardingState,
        checklist: params.onboardingChecklist,
      },
    },
    {
      id: "revisit_queue",
      panelType: "revisit_queue",
      priority: 2,
      isVisible: params.revisitQueue.length > 0 || params.maturity !== "new",
      data: {
        items: params.revisitQueue.slice(0, 5),
      },
    },
    {
      id: "blind_spot_alert",
      panelType: "blind_spot_alert",
      priority: 3,
      isVisible: params.maturity !== "new" && (params.blindSpotMap.untestedHighConfidenceClaims.length > 0 || params.blindSpotMap.unexaminedDomains.length > 0),
      data: {
        blindSpotMap: params.blindSpotMap,
      },
    },
    {
      id: "resolution_due",
      panelType: "resolution_due",
      priority: 4,
      isVisible: dueClaims.length > 0,
      data: {
        items: dueClaims,
      },
    },
    {
      id: "compounding_value",
      panelType: "compounding_value",
      priority: 5,
      isVisible: params.maturity !== "new",
      data: {
        velocityReport: params.velocityReport,
        memoryTime: params.memoryTime,
      },
    },
    {
      id: "recent_maps",
      panelType: "recent_maps",
      priority: 6,
      isVisible: true,
      data: {
        maps: recentMaps.map((map) => ({
          id: map.id,
          title: map.title,
          updatedAt: map.updatedAt,
          nodeCount: map.nodes.length,
          artifactCount: map.artifacts.length,
        })),
        isExampleSurface: recentMaps.length === 0,
      },
    },
    {
      id: "velocity_snapshot",
      panelType: "velocity_snapshot",
      priority: 7,
      isVisible: params.maturity !== "new" && Object.keys(params.velocityReport.metrics).length > 0,
      data: {
        report: params.velocityReport,
      },
    },
    {
      id: "lesson_surfaced",
      panelType: "lesson_surfaced",
      priority: 8,
      isVisible: params.memoryTime.predictionRetrospectives.length > 0 || params.memoryTime.beliefDigests.length > 0,
      data: {
        lesson: params.memoryTime.predictionRetrospectives[0] ?? params.memoryTime.beliefDigests[0] ?? null,
      },
    },
    {
      id: "biography_chapter_ready",
      panelType: "biography_chapter_ready",
      priority: 9,
      isVisible: params.memoryTime.beliefDigests.length > 0,
      data: {
        chapterCount: params.memoryTime.beliefDigests.length,
        latestChapter: params.memoryTime.beliefDigests[0] ?? null,
      },
    },
    {
      id: "unlock_progress",
      panelType: "unlock_progress",
      priority: 10,
      isVisible: params.unlockStatuses.length > 0,
      data: {
        unlockStatuses: params.unlockStatuses,
        unlockSummary: params.unlockSummary,
        nextFeatureName: params.unlockSummary.nextFeature
          ? featureUnlockDefinition(params.unlockSummary.nextFeature.featureId)?.featureName ?? params.unlockSummary.nextFeature.featureId
          : null,
      },
    },
  ];

  if (params.maturity === "new") {
    return panels
      .filter((panel) => ["onboarding_checklist", "recent_maps"].includes(panel.panelType))
      .sort((a, b) => a.priority - b.priority);
  }

  if (params.maturity === "early") {
    return panels
      .filter((panel) => ["onboarding_checklist", "revisit_queue", "recent_maps", "unlock_progress", "lesson_surfaced"].includes(panel.panelType))
      .sort((a, b) => a.priority - b.priority);
  }

  if (params.maturity === "established") {
    return panels
      .filter((panel) => ["revisit_queue", "blind_spot_alert", "resolution_due", "compounding_value", "recent_maps", "velocity_snapshot", "unlock_progress"].includes(panel.panelType))
      .sort((a, b) => a.priority - b.priority);
  }

  return panels
    .filter((panel) => ["revisit_queue", "biography_chapter_ready", "velocity_snapshot", "lesson_surfaced", "resolution_due", "compounding_value", "recent_maps", "unlock_progress"].includes(panel.panelType))
    .sort((a, b) => a.priority - b.priority);
}

function buildAlerts(params: {
  maps: ThoughtMapModel[];
  calibration: ReturnType<typeof buildCalibrationDashboard>;
  unlockSummary: ReturnType<typeof buildUnlockSummary>;
}) {
  const alerts: DashboardAlert[] = [];
  const now = new Date();

  const staleMap = sortByNewest(params.maps)
    .filter((map) => now.getTime() - map.updatedAt.getTime() >= 14 * 24 * 60 * 60 * 1000)
    .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());

  if (staleMap[0]) {
    alerts.push({
      id: `stale-map:${staleMap[0].id}`,
      alertType: "claim_very_stale",
      message: `${staleMap[0].title} has not been updated in a while.`,
      actionLabel: "Open map",
      targetId: staleMap[0].id,
      urgency: "medium",
      createdAt: staleMap[0].updatedAt,
    });
  }

  const overdueBet = params.calibration.privateBets
    .filter((bet) => bet.resolutionDate != null && new Date(bet.resolutionDate).getTime() < now.getTime())
    .sort((a, b) => new Date(a.resolutionDate ?? 0).getTime() - new Date(b.resolutionDate ?? 0).getTime())[0];

  if (overdueBet) {
    alerts.push({
      id: `resolution-overdue:${overdueBet.mapId}`,
      alertType: "resolution_overdue",
      message: `${overdueBet.title} is past its resolution date.`,
      actionLabel: "Resolve now",
      targetId: overdueBet.mapId,
      urgency: "high",
      createdAt: new Date(overdueBet.resolutionDate ?? now),
    });
  }

  if (params.unlockSummary.recentlyUnlockedCount > 0 && params.unlockSummary.nextFeature) {
    const nextFeatureDefinition = featureUnlockDefinition(params.unlockSummary.nextFeature.featureId);
    alerts.push({
      id: `feature-unlocked:${params.unlockSummary.nextFeature.featureId}`,
      alertType: "feature_unlocked",
      message: `${nextFeatureDefinition?.featureName ?? params.unlockSummary.nextFeature.featureId} just became available.`,
      actionLabel: "Explore",
      targetId: "/app/unlocks",
      urgency: "low",
      createdAt: now,
    });
  }

  if (params.calibration.domains.some((domain) => domain.sampleSize >= 10 && domain.averageBrierScore != null)) {
    const calibratedDomain = params.calibration.domains.find((domain) => domain.sampleSize >= 10 && domain.averageBrierScore != null);
    if (calibratedDomain) {
      alerts.push({
        id: `calibration:${calibratedDomain.domain}`,
        alertType: "calibration_milestone",
        message: `You have enough data in ${calibratedDomain.domain} to watch calibration closely.`,
        actionLabel: "Review calibration",
        targetId: "/app/velocity",
        urgency: "low",
        createdAt: now,
      });
    }
  }

  return alerts;
}

export function computeHomeDashboard(userId: string, userState: UserState): HomeDashboardState {
  const maps = sortByNewest(userState.maps);
  const sessions = sortByNewest(userState.sessions);
  const fragments = sortByNewest(userState.fragments);
  const maturity = computeUserMaturity({ userId, maps, sessions, fragments });
  const onboardingState = buildOnboardingState({ userId, maps, sessions, fragments });
  const onboardingChecklist = buildOnboardingChecklist({ maps, sessions, fragments });
  const revisitQueue = maps.flatMap((map) => buildRevisitQueue(map, 4));
  const calibration = buildCalibrationDashboard(maps);
  const blindSpotMap = buildBlindSpotMap(maps, userId);
  const memoryTime = buildMemoryTimeDashboard(maps);
  const velocityReport = buildVelocityReport(userId, maps, maturity === "new" ? 30 : maturity === "early" ? 30 : 90);
  const unlockStatuses = buildFeatureUnlockStatuses({ userId, maps });
  const unlockSummary = buildUnlockSummary(unlockStatuses);
  const panels = buildPanels({
    userId,
    maturity,
    maps,
    onboardingChecklist,
    onboardingState,
    revisitQueue: [...revisitQueue].sort((a, b) => {
      const aPriority = a.schedule.priority === "urgent" ? 4 : a.schedule.priority === "high" ? 3 : a.schedule.priority === "medium" ? 2 : 1;
      const bPriority = b.schedule.priority === "urgent" ? 4 : b.schedule.priority === "high" ? 3 : b.schedule.priority === "medium" ? 2 : 1;
      return bPriority - aPriority || a.schedule.scheduledFor.getTime() - b.schedule.scheduledFor.getTime();
    }),
    blindSpotMap,
    calibration,
    memoryTime,
    velocityReport,
    unlockStatuses,
    unlockSummary,
  });

  const primaryAction = buildPrimaryAction(
    maturity,
    maps,
    (panels.find((panel) => panel.panelType === "revisit_queue")?.data.items as ReturnType<typeof buildRevisitQueue>) ?? [],
    calibration.privateBets,
  );
  const sessionSuggestion = buildSessionSuggestion(maturity, maps, velocityReport, memoryTime);
  const alerts = buildAlerts({ maps, calibration, unlockSummary });

  return {
    userId,
    userMaturity: maturity,
    panels,
    primaryAction,
    sessionSuggestion,
    alerts,
  };
}

export function buildHomeDashboard(params: {
  userId: string;
  maps: ThoughtMapModel[];
  sessions: SessionCardModel[];
  fragments: MarginFragmentModel[];
}): HomeDashboardState {
  return computeHomeDashboard(params.userId, {
    userId: params.userId,
    maps: params.maps,
    sessions: params.sessions,
    fragments: params.fragments,
  });
}
