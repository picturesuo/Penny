import type { Lesson, LessonLibrary, LessonSearchIndex, LessonType } from "@/types/lesson-library";

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "that",
  "with",
  "this",
  "from",
  "your",
  "you",
  "are",
  "was",
  "were",
  "will",
  "would",
  "have",
  "been",
  "into",
  "when",
  "then",
  "than",
  "what",
  "why",
  "how",
  "does",
  "did",
  "can",
  "could",
  "should",
  "just",
  "still",
  "more",
  "less",
  "about",
  "like",
  "only",
  "into",
]);

function normalize(value: string) {
  return value.toLowerCase().trim();
}

export function tokenizeLessonText(value: string) {
  return Array.from(
    new Set(
      normalize(value)
        .split(/[^a-z0-9]+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 2 && !STOP_WORDS.has(token)),
    ),
  );
}

export function inferLessonType(params: {
  lessonText: string;
  domain: string | null;
  claimType: string | null;
  sourceType: Lesson["sourceType"];
}): LessonType {
  const text = normalize(params.lessonText);

  if (params.sourceType === "counterfactual" || /\b(day|timing|early|late|wait|when|soon|too soon|too early|too late)\b/.test(text)) {
    return "timing";
  }

  if (/\b(brier|calibration|confidence|probability|score|overconfident|underconfident|forecast)\b/.test(text)) {
    return "calibration";
  }

  if (/\b(evidence|source|proof|benchmark|base rate|base-rate|data|study|signal|sample)\b/.test(text)) {
    return "evidence_evaluation";
  }

  if (/\b(overconfident|underconfident|anchoring|bias|blind spot|defensive|defensiveness|avoidance)\b/.test(text)) {
    return "bias_recognition";
  }

  if (/\b(act|decide|decision|choose|commit|revise|reverse|apply|switch|hold|wait)\b/.test(text)) {
    return "decision_making";
  }

  if (/\b(assumption|pattern|frame|reasoning|logic|because|therefore|counterfactual|lesson|lesson learned)\b/.test(text)) {
    return "reasoning_pattern";
  }

  if (params.domain || params.claimType) {
    return "domain_specific";
  }

  return "reasoning_pattern";
}

export function buildLessonTags(params: {
  lessonText: string;
  lessonType: LessonType;
  domain: string | null;
  claimType: string | null;
  sourceType: Lesson["sourceType"];
}) {
  const tokens = tokenizeLessonText(params.lessonText);
  const tags = new Set<string>([
    params.lessonType,
    params.sourceType,
  ]);

  if (params.domain) {
    tags.add(`domain:${params.domain}`);
  }

  if (params.claimType) {
    tags.add(`claim:${params.claimType}`);
  }

  for (const token of tokens) {
    if (
      token === "calibration" ||
      token === "confidence" ||
      token === "evidence" ||
      token === "timing" ||
      token === "bias" ||
      token === "decision" ||
      token === "assumption" ||
      token === "counterfactual" ||
      token === "lesson"
    ) {
      tags.add(token);
    }
  }

  return Array.from(tags);
}

export function makeLessonId(sourceType: Lesson["sourceType"], sourceId: string) {
  return `lesson:${sourceType}:${sourceId}`;
}

export function buildLessonSearchIndex(lessons: Lesson[]): LessonSearchIndex {
  const tokenizedLessons = new Map<string, string[]>();
  const domainIndex = new Map<string, string[]>();
  const typeIndex = new Map<string, string[]>();

  for (const lesson of lessons) {
    const tokens = tokenizeLessonText([lesson.lessonText, lesson.tags.join(" "), lesson.domain ?? "", lesson.claimType ?? ""].join(" "));
    tokenizedLessons.set(lesson.id, tokens);

    const domainKey = lesson.domain ?? "general";
    const typeKey = lesson.lessonType;

    const existingDomain = domainIndex.get(domainKey) ?? [];
    existingDomain.push(lesson.id);
    domainIndex.set(domainKey, existingDomain);

    const existingType = typeIndex.get(typeKey) ?? [];
    existingType.push(lesson.id);
    typeIndex.set(typeKey, existingType);
  }

  return {
    tokenizedLessons,
    domainIndex,
    typeIndex,
  };
}

export function computeLessonRelevance(
  lesson: Lesson,
  newClaimText: string,
  newClaimDomain: string,
  newClaimType: string,
) {
  const lessonTokens = tokenizeLessonText([lesson.lessonText, lesson.tags.join(" "), lesson.domain ?? "", lesson.claimType ?? ""].join(" "));
  const claimTokens = tokenizeLessonText([newClaimText, newClaimDomain, newClaimType].join(" "));

  let score = 0;

  if (lesson.domain && lesson.domain === newClaimDomain) {
    score += 0.35;
  }

  if (lesson.claimType && lesson.claimType === newClaimType) {
    score += 0.25;
  }

  if (lesson.lessonType === "calibration" && /confidence|probability|brier|forecast/.test(claimTokens.join(" "))) {
    score += 0.12;
  }

  if (lesson.lessonType === "timing" && /temporal|time|date|when|deadline|resolution/.test(claimTokens.join(" "))) {
    score += 0.12;
  }

  const overlap = claimTokens.filter((token) => lessonTokens.includes(token)).length;
  score += Math.min(0.3, overlap * 0.05);

  if (lesson.tags.some((tag) => claimTokens.includes(tag) || claimTokens.includes(tag.replace(/^domain:/, "")))) {
    score += 0.08;
  }

  return Math.max(0, Math.min(1, score));
}

export function findRelevantLessons(
  library: LessonLibrary,
  newClaimText: string,
  newClaimDomain: string,
  newClaimType: string,
) {
  const scored = library.lessons.map((lesson) => ({
    lesson,
    score: computeLessonRelevance(lesson, newClaimText, newClaimDomain, newClaimType),
  }));

  const lessons = scored
    .filter((entry) => entry.score > 0.4)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((entry) => entry.lesson);

  return {
    lessons,
    surfacingReason: generateLessonSurfacingMessage(lessons),
  };
}

export function generateLessonSurfacingMessage(lessons: Lesson[]) {
  if (!lessons.length) {
    return "";
  }

  if (lessons.length === 1) {
    return `Before you set your confidence: you learned something relevant to this kind of claim.`;
  }

  return `Before you set your confidence: you have ${lessons.length} lessons from similar claims.`;
}

export function formatLessonPreview(lesson: Lesson) {
  return lesson.userEditedText?.trim().length ? lesson.userEditedText.trim() : lesson.lessonText;
}
