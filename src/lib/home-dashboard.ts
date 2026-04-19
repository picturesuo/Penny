import type { MarginFragmentModel, SessionCardModel } from "@/types/penny";
import type { HomeDashboardState, UserMaturity, DashboardPanel } from "@/types/home-dashboard";
import type { ThoughtMapModel } from "@/types/thought-map";
import { buildFeatureUnlockStatuses, buildUnlockSummary, featureUnlockDefinition } from "@/lib/time-locked-features";

function computeUserMaturity(maps: ThoughtMapModel[]): UserMaturity {
  if (maps.length === 0) {
    return "new";
  }

  const earliest = maps.reduce((oldest, map) => (map.createdAt < oldest ? map.createdAt : oldest), maps[0]!.createdAt);
  const ageDays = Math.max(0, Math.round((Date.now() - earliest.getTime()) / (1000 * 60 * 60 * 24)));

  if (ageDays < 30 || maps.length < 4) {
    return "early";
  }

  if (ageDays < 120 || maps.length < 10) {
    return "established";
  }

  return "mature";
}

function makePanels(params: {
  userId: string;
  maturity: UserMaturity;
  maps: ThoughtMapModel[];
  sessions: SessionCardModel[];
  fragments: MarginFragmentModel[];
}): DashboardPanel[] {
  const quickCaptureCount = params.fragments.filter((fragment) => fragment.status === "floating").length;
  const recentMaps = params.maps.slice(0, 4);
  const recentSessions = params.sessions.slice(0, 4);
  const unlockStatuses = buildFeatureUnlockStatuses({ userId: params.userId, maps: params.maps });
  const unlockSummary = buildUnlockSummary(unlockStatuses);

  const panels: DashboardPanel[] = [
    {
      id: "search",
      panelType: "search",
      priority: 1,
      isVisible: true,
      data: { resultCount: params.maps.length },
    },
    {
      id: "quick_capture",
      panelType: "quick_capture",
      priority: 2,
      isVisible: true,
      data: { pendingCaptures: quickCaptureCount },
    },
    {
      id: "recent_maps",
      panelType: "recent_maps",
      priority: 3,
      isVisible: recentMaps.length > 0,
      data: { maps: recentMaps.map((map) => ({ id: map.id, title: map.title, updatedAt: map.updatedAt })) },
    },
    {
      id: "recent_sessions",
      panelType: "recent_sessions",
      priority: 4,
      isVisible: recentSessions.length > 0,
      data: { sessions: recentSessions.map((session) => ({ id: session.id, title: session.title, clarityScore: session.clarityScore })) },
    },
    {
      id: "capture_inbox",
      panelType: "capture_inbox",
      priority: 5,
      isVisible: quickCaptureCount > 0,
      data: { pendingCaptures: quickCaptureCount },
    },
    {
      id: "compounding_value",
      panelType: "compounding_value",
      priority: 6,
      isVisible: params.maturity !== "new",
      data: {
        maps: params.maps.length,
        sessions: params.sessions.length,
        fragments: params.fragments.length,
      },
    },
    {
      id: "unlock_progress",
      panelType: "unlock_progress",
      priority: 7,
      isVisible: unlockStatuses.length > 0,
      data: {
        unlockedCount: unlockSummary.unlockedCount,
        lockedCount: unlockSummary.lockedCount,
        recentlyUnlockedCount: unlockSummary.recentlyUnlockedCount,
        nextFeatureId: unlockSummary.nextFeature?.featureId ?? null,
        nextFeatureName: unlockSummary.nextFeature ? featureUnlockDefinition(unlockSummary.nextFeature.featureId)?.featureName ?? unlockSummary.nextFeature.featureId : null,
      },
    },
  ];

  if (params.maturity === "new") {
    panels.unshift({
      id: "onboarding_checklist",
      panelType: "onboarding_checklist",
      priority: 0,
      isVisible: true,
      data: { reason: "first_session" },
    });
  } else if (params.maturity === "early") {
    panels.unshift({
      id: "onboarding_checklist",
      panelType: "onboarding_checklist",
      priority: 0,
      isVisible: true,
      data: { reason: "habit_building" },
    });
  }

  return panels.sort((a, b) => a.priority - b.priority);
}

export function buildHomeDashboard(params: {
  userId: string;
  maps: ThoughtMapModel[];
  sessions: SessionCardModel[];
  fragments: MarginFragmentModel[];
}): HomeDashboardState {
  const maturity = computeUserMaturity(params.maps);
  const panels = makePanels({ userId: params.userId, maturity, maps: params.maps, sessions: params.sessions, fragments: params.fragments });

  const latestMap = params.maps[0] ?? null;
  const latestSession = params.sessions[0] ?? null;
  const quickCaptureActionType: "continue_map" | "quick_capture" = latestMap ? "continue_map" : "quick_capture";
  const fallbackActionType: "start_session" | "continue_map" = latestSession ? "start_session" : "continue_map";

  const primaryAction =
    maturity === "new"
      ? {
          label: "Start your first map",
          description: "Capture a belief you want to think through carefully.",
          actionType: "create_first_claim" as const,
          targetId: null,
        }
      : maturity === "early"
        ? {
            label: latestMap ? `Continue ${latestMap.title}` : "Capture a thought",
            description: latestMap ? "Pick up the map Penny already knows about." : "Add one raw thought before it disappears.",
            actionType: quickCaptureActionType,
            targetId: latestMap?.id ?? null,
          }
        : maturity === "established"
          ? {
              label: "Search your thinking",
              description: "Find the claim, map, or artifact you need right now.",
              actionType: "search" as const,
              targetId: null,
            }
          : {
              label: latestSession ? `Resume ${latestSession.title}` : "Open your strongest map",
              description: "Return to the most load-bearing work first.",
              actionType: fallbackActionType,
              targetId: latestSession?.id ?? latestMap?.id ?? null,
            };

  const sessionSuggestion =
    latestMap
      ? {
          suggestedIntentionType: latestMap.artifacts.length > 0 ? "generate_artifact" : "stress_test",
          reason: latestMap.artifacts.length > 0 ? "The map already has enough structure to synthesize." : "The map still needs pressure before synthesis.",
          estimatedMinutes: latestMap.artifacts.length > 0 ? 12 : 18,
          claimsToFocus: latestMap.nodes
            .filter((node) => node.kind !== "root")
            .slice(0, 3)
            .map((node) => node.content),
        }
      : null;

  const alerts =
    params.maps.slice(0, 3).map((map) => ({
      id: map.id,
      alertType: "feature_unlocked" as const,
      message: `${map.title} is ready for another pass.`,
      actionLabel: "Open map",
      targetId: map.id,
      urgency: "low" as const,
      createdAt: map.updatedAt,
    })) ?? [];

  return {
    userId: params.userId,
    userMaturity: maturity,
    panels,
    primaryAction,
    sessionSuggestion,
    alerts,
  };
}
