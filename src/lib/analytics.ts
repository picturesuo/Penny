import { randomUUID } from "node:crypto";
import { DEMO_USER_ID } from "@/lib/penny";

export type AnalyticsEvent =
  | { event: "page_view"; properties: { path: string } }
  | { event: "sign_up"; properties: { method: string } }
  | { event: "map_created"; properties: { mapId: string } }
  | { event: "claim_created"; properties: { claimId: string; mapId: string; domain: string } }
  | { event: "challenge_started"; properties: { claimId: string; roundNumber: number } }
  | {
      event: "challenge_submission_attempted";
      properties: { claimId: string; roundNumber: number; attemptNumber: number };
    }
  | {
      event: "challenge_submission_failed";
      properties: { claimId: string; roundNumber: number; attemptNumber: number; reason: string };
    }
  | { event: "challenge_completed"; properties: { claimId: string; roundNumber: number; engagementScore: number } }
  | { event: "confidence_updated"; properties: { claimId: string; delta: number } }
  | { event: "artifact_generated"; properties: { artifactType: string; mapId: string } }
  | { event: "session_completed"; properties: { sessionId: string; durationMinutes: number } }
  | { event: "steel_man_written"; properties: { claimId: string; qualityScore: number } }
  | { event: "learning_prompt_opened"; properties: { promptType: string; claimId: string } };

const POSTHOG_HOST = (process.env.POSTHOG_HOST ?? "https://app.posthog.com").replace(/\/$/, "");
const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY?.trim() ?? "";

function analyticsEnabled() {
  return POSTHOG_API_KEY.length > 0;
}

async function sendToPostHog(event: AnalyticsEvent, userId?: string) {
  if (!analyticsEnabled()) {
    if (process.env.NODE_ENV === "development") {
      console.log("[ANALYTICS]", event.event, event.properties, userId ?? "anonymous");
    }
    return;
  }

  const distinctId = userId && userId.trim().length > 0 && userId !== DEMO_USER_ID ? userId.trim() : randomUUID();
  const response = await fetch(`${POSTHOG_HOST}/capture/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      api_key: POSTHOG_API_KEY,
      event: event.event,
      distinct_id: distinctId,
      properties: {
        ...event.properties,
        userId: userId ?? null,
        source: "penny",
      },
      timestamp: new Date().toISOString(),
    }),
    cache: "no-store",
  });

  if (!response.ok && process.env.NODE_ENV === "development") {
    console.warn("[ANALYTICS] failed", event.event, response.status);
  }
}

export async function track(event: AnalyticsEvent, userId?: string): Promise<void> {
  if (typeof window !== "undefined") {
    try {
      await fetch("/api/analytics", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event,
          userId: userId ?? null,
        }),
        keepalive: true,
      });
    } catch {
      return;
    }

    return;
  }

  try {
    await sendToPostHog(event, userId);
  } catch {
    return;
  }
}

export async function sendAnalyticsEvent(event: AnalyticsEvent, userId?: string): Promise<void> {
  await sendToPostHog(event, userId);
}
