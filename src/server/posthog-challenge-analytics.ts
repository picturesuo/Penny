import "server-only";

import { createHash } from "node:crypto";
import { DEMO_USER_ID } from "@/lib/penny";
import { logger } from "@/lib/logger";

const POSTHOG_HOST = (process.env.POSTHOG_HOST ?? "https://app.posthog.com").replace(/\/$/, "");
const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY?.trim() ?? "";
const DEMO_DISTINCT_ID = "penny-demo-challenge-flow";

export const challengeAnalyticsEventCatalog = [
  {
    name: "challenge_round_started",
    description: "A challenge round was created successfully and returned to the caller.",
  },
  {
    name: "challenge_critique_requested",
    description: "The backend accepted a request to generate the next critique for a claim.",
  },
  {
    name: "challenge_critique_generated",
    description: "The backend produced a critique payload for the requested challenge round.",
  },
  {
    name: "challenge_critique_failed",
    description: "The backend failed to produce a critique payload for the requested challenge round.",
  },
  {
    name: "challenge_view_loaded",
    description: "The backend rendered or returned a challenge-focused surface for a map/claim.",
  },
] as const;

type ChallengeAnalyticsEvent =
  | {
      event: "challenge_round_started";
      properties: {
        claimId: string;
        mapId: string;
        roundId: string;
        roundNumber: number;
        critiqueMode: "direct" | "socratic" | "red_team";
        generationStatus: "generated" | "fallback";
      };
    }
  | {
      event: "challenge_critique_requested";
      properties: {
        claimId: string;
        mapId: string;
        critiqueMode: "direct" | "socratic" | "red_team";
        critiqueIntensity: number;
        forceRegenerate: boolean;
        selectedVoice: string | null;
      };
    }
  | {
      event: "challenge_critique_generated";
      properties: {
        claimId: string;
        mapId: string;
        roundId: string;
        roundNumber: number;
        critiqueMode: "direct" | "socratic" | "red_team";
        generationStatus: "generated" | "fallback";
        generationProvider: string;
      };
    }
  | {
      event: "challenge_critique_failed";
      properties: {
        claimId: string;
        mapId: string;
        critiqueMode: "direct" | "socratic" | "red_team";
        critiqueIntensity: number;
        forceRegenerate: boolean;
        selectedVoice: string | null;
        reason: string;
      };
    }
  | {
      event: "challenge_view_loaded";
      properties: {
        mapId: string;
        claimId: string | null;
        route: string;
        source: "map_page" | "workspace_api";
      };
    };

function analyticsEnabled() {
  return POSTHOG_API_KEY.length > 0;
}

function buildDistinctId(userId?: string | null) {
  if (!userId || userId === DEMO_USER_ID) {
    return DEMO_DISTINCT_ID;
  }

  return createHash("sha256").update(userId).digest("hex");
}

async function sendToPostHog(event: ChallengeAnalyticsEvent, userId?: string | null) {
  if (!analyticsEnabled()) {
    if (process.env.NODE_ENV === "development") {
      logger.info("challenge_analytics_skipped", {
        userId: userId ?? undefined,
        featureId: "challenge-analytics",
        data: {
          event: event.event,
          properties: event.properties,
        },
      });
    }
    return;
  }

  const response = await fetch(`${POSTHOG_HOST}/capture/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      api_key: POSTHOG_API_KEY,
      event: event.event,
      distinct_id: buildDistinctId(userId),
      properties: {
        ...event.properties,
        source: "penny_backend",
        ownership: "backend",
        feature: "challenge_flow",
        userId: userId ?? null,
      },
      timestamp: new Date().toISOString(),
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`PostHog capture failed with status ${response.status}.`);
  }
}

export async function trackChallengeAnalyticsEvent(
  event: ChallengeAnalyticsEvent,
  userId?: string | null,
): Promise<void> {
  try {
    await sendToPostHog(event, userId);
  } catch (error) {
    logger.warn("challenge_analytics_failed", {
      userId: userId ?? undefined,
      featureId: "challenge-analytics",
      error: error instanceof Error ? error.message : String(error),
      data: {
        event: event.event,
      },
    });
  }
}

export type { ChallengeAnalyticsEvent };
