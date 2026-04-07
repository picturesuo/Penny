import type {
  ConversationMessage,
  SessionStage,
  StructuredPoint,
} from "@/types/penny";

export const DEMO_USER_ID = "demo-founder";

export const CATEGORY_OPTIONS = [
  "B2B SaaS",
  "Consumer",
  "Marketplace",
  "Developer Tool",
  "Healthcare",
  "Creator",
  "Fintech",
] as const;

export function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function cleanSentence(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function dedupeStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => cleanSentence(value)).filter(Boolean)));
}

export function dedupePoints(values: StructuredPoint[]) {
  const seen = new Set<string>();
  return values.filter((item) => {
    const key = cleanSentence(item.point).toLowerCase();
    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function createMessage(
  role: ConversationMessage["role"],
  kind: ConversationMessage["kind"],
  content: string,
): ConversationMessage {
  return {
    id: crypto.randomUUID(),
    role,
    kind,
    content,
    createdAt: new Date().toISOString(),
  };
}

export function titleFromIdea(rawIdea: string) {
  const trimmed = cleanSentence(rawIdea);
  const base = trimmed.split(/[.!?]/)[0] ?? trimmed;
  return base.length > 52 ? `${base.slice(0, 49).trim()}...` : base;
}

export function mergeText(primary?: string | null, fallback?: string | null) {
  return primary?.trim() || fallback?.trim() || "";
}

export function computeClarityScore(params: {
  targetUser?: string | null;
  problem?: string | null;
  solution?: string | null;
  assumptions: string[];
  evidenceFor: StructuredPoint[];
  evidenceAgainst: StructuredPoint[];
  answers: string[];
}) {
  let score = 12;
  if (params.targetUser) score += 18;
  if (params.problem) score += 18;
  if (params.solution) score += 16;
  score += Math.min(params.assumptions.length * 4, 16);
  score += Math.min((params.evidenceFor.length + params.evidenceAgainst.length) * 3, 12);
  score += Math.min(params.answers.length * 5, 20);

  return Math.max(8, Math.min(score, 100));
}

export function determineStage(params: {
  answersCount: number;
  hasEvidence: boolean;
  hasBrief: boolean;
  targetUser?: string | null;
  problem?: string | null;
  solution?: string | null;
  assumptions: string[];
}): SessionStage {
  if (params.hasBrief) {
    return "brief";
  }

  if (!params.targetUser || !params.problem) {
    return params.answersCount === 0 ? "intake" : "clarify";
  }

  if (params.assumptions.length < 2) {
    return "assumptions";
  }

  if (params.answersCount < 3) {
    return "pressure-test";
  }

  if (!params.hasEvidence) {
    return "evidence";
  }

  if (!params.solution || params.answersCount < 4) {
    return "prioritize";
  }

  return "brief";
}
