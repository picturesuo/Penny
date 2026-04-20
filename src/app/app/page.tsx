import {
  HomeLauncher,
  type HomeLauncherClaimSummary,
  type HomeLauncherMapSummary,
  type HomeLauncherResumeSummary,
} from "@/components/penny/home-launcher";
import { deriveBestNextMove, type BestNextMoveKey } from "@/lib/challenge-next-move";
import { getCurrentAuthenticatedUserId } from "@/server/auth";
import { getMapsForUser, type Map } from "@/server/mvp";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const query = await searchParams;
  const userId = await getCurrentAuthenticatedUserId();
  const maps = await getMapsForUser(userId, { limit: 6 });
  const launcherMaps: HomeLauncherMapSummary[] = maps.slice(0, 6).map((map) => ({
    id: map.id,
    title: map.title,
    updatedAt: map.updatedAt instanceof Date ? map.updatedAt.toISOString() : String(map.updatedAt),
    claimCount: map.nodes.filter((node) => node.kind !== "root").length,
    rawThought: map.rawThought,
    claims: map.nodes
      .filter((node) => node.kind !== "root")
      .slice(0, 4)
      .map(
        (node) =>
          ({
            id: node.id,
            mapId: map.id,
            mapTitle: map.title,
            text: node.content,
          }) satisfies HomeLauncherClaimSummary,
      ),
  }));
  const recentWork = maps.slice(0, 3).map((map) => buildResumeSummary(map));

  return (
    <HomeLauncher
      maps={launcherMaps}
      recentWork={recentWork}
      initialIntent={parseLauncherIntent(firstQueryValue(query.intent))}
      initialCaptureMode={parseCaptureMode(firstQueryValue(query.captureMode))}
    />
  );
}

function firstQueryValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function parseLauncherIntent(value: string | null): "capture" | "challenge" | "learn" | undefined {
  return value === "capture" || value === "challenge" || value === "learn" ? value : undefined;
}

function parseCaptureMode(value: string | null): "type" | "import" | "quick" | undefined {
  return value === "type" || value === "import" || value === "quick" ? value : undefined;
}

function buildResumeSummary(map: Map): HomeLauncherResumeSummary {
  const claims = map.nodes.filter((node) => node.kind !== "root");
  const latestRoundEvent = [...map.events]
    .filter((event) => event.eventType === "dialectic_round" && typeof event.nodeId === "string")
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];

  if (latestRoundEvent?.nodeId) {
    const claim = claims.find((node) => node.id === latestRoundEvent.nodeId) ?? null;
    if (claim) {
      const payload = readRecord(latestRoundEvent.payload);
      const structuredRound = readRecord(payload?.dialecticRound);
      const responseClassification = readRecord(structuredRound?.responseClassification);
      const critiqueFailureTypes = readStringArray(structuredRound?.critiqueFailureTypes);
      const confidenceDelta = readNumber(structuredRound?.confidenceDelta) ?? 0;
      const followUpPrompt = readString(structuredRound?.followUpPrompt);
      const roundIndex = readNumber(payload?.roundIndex) ?? 0;
      const recommendation = deriveBestNextMove({
        classification: readString(responseClassification?.type),
        confidenceDelta,
        followUpPrompt,
        critiqueFailureTypes,
        roundIndex,
      });

      return {
        id: `${map.id}:${claim.id}:${recommendation.primary.key}`,
        mapId: map.id,
        mapTitle: map.title,
        claimId: claim.id,
        claimText: claim.content,
        intent: "challenge",
        nextActionLabel: recommendation.primary.label,
        nextActionDescription: followUpPrompt ?? recommendation.primary.description,
        signalLabel: recommendation.signalLabel,
        href: buildResumeHref(map.id, claim.id, "challenge", recommendation.primary.key),
        updatedAt: latestRoundEvent.createdAt.toISOString(),
      };
    }
  }

  const latestClaim = [...claims].sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())[0] ?? null;

  if (latestClaim) {
    return {
      id: `${map.id}:${latestClaim.id}:continue_challenge`,
      mapId: map.id,
      mapTitle: map.title,
      claimId: latestClaim.id,
      claimText: latestClaim.content,
      intent: "challenge",
      nextActionLabel: "Continue challenge",
      nextActionDescription: "Reopen this claim in the focused challenge lane and push it through the next honest step.",
      signalLabel:
        typeof latestClaim.scores?.confidence === "number" ? `${Math.round(latestClaim.scores.confidence)}% confident` : null,
      href: buildResumeHref(map.id, latestClaim.id, "challenge"),
      updatedAt: latestClaim.updatedAt.toISOString(),
    };
  }

  return {
    id: `${map.id}:capture`,
    mapId: map.id,
    mapTitle: map.title,
    claimId: null,
    claimText: map.rawThought,
    intent: "capture",
    nextActionLabel: "Capture claim",
    nextActionDescription: "This map still needs one real claim before Penny can challenge or teach through it.",
    signalLabel: null,
    href: buildResumeHref(map.id, null, "capture"),
    updatedAt: map.updatedAt.toISOString(),
  };
}

function buildResumeHref(mapId: string, claimId: string | null, intent: "capture" | "challenge" | "learn", nextAction?: BestNextMoveKey) {
  const params = new URLSearchParams({
    launcher: intent,
  });

  if (claimId) {
    params.set("claimId", claimId);
  }

  if (nextAction) {
    params.set("nextAction", nextAction);
  }

  return `/maps/${mapId}?${params.toString()}`;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
}
