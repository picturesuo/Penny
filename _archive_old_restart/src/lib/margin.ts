import type { MarginFragmentModel } from "@/types/penny";

export interface MarginResurfaceCandidate {
  fragment: MarginFragmentModel;
  score: number;
  reasons: string[];
}

export interface MarginClusterSnapshot {
  key: string;
  label: string;
  fragments: MarginFragmentModel[];
  summary: string;
}

export interface MarginSurfaceSnapshot {
  candidates: MarginResurfaceCandidate[];
  clusters: MarginClusterSnapshot[];
  floatingCount: number;
  surfacedCount: number;
  promotedCount: number;
  archivedCount: number;
  weeklyReview: MarginFragmentModel[];
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9\s]+/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function wordSet(value: string) {
  return new Set(
    normalizeText(value)
      .split(" ")
      .filter((word) => word.length >= 4),
  );
}

function fragmentAgeDays(fragment: MarginFragmentModel, now = new Date()) {
  return Math.max(0, (now.getTime() - fragment.createdAt.getTime()) / (1000 * 60 * 60 * 24));
}

function contextTokens(fragment: MarginFragmentModel) {
  const context = fragment.contextSnapshot.currentContext || fragment.contextSnapshot.currentFocus || "";
  return wordSet(`${fragment.content} ${context} ${fragment.sphere}`);
}

function overlapScore(fragmentTokens: Set<string>, contextTokens: Set<string>) {
  let score = 0;

  for (const token of fragmentTokens) {
    if (contextTokens.has(token)) {
      score += 1;
    }
  }

  return score;
}

export function buildMarginSurfaceSnapshot(
  fragments: MarginFragmentModel[],
  params: {
    focusText?: string;
    sphere?: string;
    now?: Date;
  } = {},
): MarginSurfaceSnapshot {
  const now = params.now ?? new Date();
  const focusTokens = wordSet(params.focusText ?? "");

  const scored = fragments
    .map((fragment) => {
      const fragmentTokens = contextTokens(fragment);
      const ageDays = fragmentAgeDays(fragment, now);
      const sameSphere = params.sphere ? fragment.sphere.toLowerCase() === params.sphere.toLowerCase() : false;
      const overlap = overlapScore(fragmentTokens, focusTokens);
      const ageBoost = Math.min(2, ageDays / 14);
      const priorityBoost = Math.min(1.5, fragment.priority);
      const resurfaceBoost = fragment.status === "surfaced" ? -0.2 : fragment.status === "floating" ? 0.4 : 0;
      const clusterBoost = overlap >= 2 ? 0.9 : overlap >= 1 ? 0.4 : 0;
      const sphereBoost = sameSphere ? 0.35 : 0;
      const score = Number((ageBoost + priorityBoost + resurfaceBoost + clusterBoost + sphereBoost).toFixed(2));
      const reasons = [
        ...(sameSphere ? ["same sphere"] : []),
        ...(overlap >= 2 ? ["context overlap"] : overlap >= 1 ? ["partial context overlap"] : []),
        ...(ageDays >= 2 ? [`aged ${Math.round(ageDays)} days`] : []),
        ...(fragment.surfaceCount >= 3 ? ["already resurfaced several times"] : []),
      ];

      return {
        fragment,
        score,
        reasons,
      } satisfies MarginResurfaceCandidate;
    })
    .sort((a, b) => b.score - a.score || b.fragment.createdAt.getTime() - a.fragment.createdAt.getTime());

  const clustersByKey = new Map<string, MarginFragmentModel[]>();

  for (const fragment of fragments) {
    const tokens = Array.from(contextTokens(fragment));
    const key = tokens.slice(0, 3).join(":") || `fragment-${fragment.id.slice(0, 6)}`;
    const bucket = clustersByKey.get(key) ?? [];
    bucket.push(fragment);
    clustersByKey.set(key, bucket);
  }

  const clusters = Array.from(clustersByKey.entries())
    .map(([key, clusterFragments]) => {
      const strongest = clusterFragments
        .slice()
        .sort((a, b) => b.priority - a.priority || b.createdAt.getTime() - a.createdAt.getTime())[0];
      const label =
        clusterFragments.length >= 3
          ? "Clustered margin theme"
          : clusterFragments.length === 2
            ? "Repeated fragment"
            : "Single fragment";

      return {
        key,
        label,
        fragments: clusterFragments,
        summary:
          clusterFragments.length >= 3
            ? `A recurring idea is showing up in the margin: ${strongest?.content ?? "an unresolved thought"}.`
            : clusterFragments.length === 2
              ? `Two fragments are orbiting the same issue: ${strongest?.content ?? "a repeated thought"}.`
              : strongest
                ? `A single fragment is still floating on its own: ${strongest.content}.`
                : "A fragment is still floating on its own.",
      } satisfies MarginClusterSnapshot;
    })
    .sort((a, b) => b.fragments.length - a.fragments.length || a.key.localeCompare(b.key))
    .slice(0, 6);

  const floatingCount = fragments.filter((fragment) => fragment.status === "floating").length;
  const surfacedCount = fragments.filter((fragment) => fragment.status === "surfaced").length;
  const promotedCount = fragments.filter((fragment) => fragment.status === "promoted").length;
  const archivedCount = fragments.filter((fragment) => fragment.status === "archived").length;

  const weeklyReview = scored
    .filter(({ fragment, score }) => fragment.status === "floating" && (score >= 1.8 || fragmentAgeDays(fragment, now) >= 7))
    .slice(0, 6)
    .map(({ fragment }) => fragment);

  return {
    candidates: scored.slice(0, 8),
    clusters,
    floatingCount,
    surfacedCount,
    promotedCount,
    archivedCount,
    weeklyReview,
  };
}
