import { z } from "zod";
import { CandidateBrainObjectSchema, type CandidateBrainObject } from "./candidate-brain-object.ts";

const JsonObjectSchema = z.record(z.string(), z.unknown());

export const LearnSessionOutputSchema = z
  .object({
    sessionId: z.string().uuid(),
    title: z.string().trim().min(1).max(180).optional(),
    summary: z.string().trim().min(1).max(1_000).nullable().optional(),
    content: z.string().trim().min(1).max(50_000),
    rawIdea: z.string().trim().min(1).max(10_000).optional(),
    term: z.string().trim().min(1).max(120).optional(),
    payload: JsonObjectSchema.optional(),
    refs: JsonObjectSchema.optional(),
    candidateBrainObjects: z.array(CandidateBrainObjectSchema).max(5).optional(),
  })
  .strict();

export type LearnSessionOutput = z.infer<typeof LearnSessionOutputSchema>;

export type LearnSessionRecentInput = {
  sessionId: string;
  kind: "learn_output";
  title: string;
  summary: string | null;
  content: string;
  payload: Record<string, unknown>;
};

export type LearnSessionSaveCandidate = {
  recentId: string;
  sessionId: string;
  objectType: "learn_output";
  title: string;
  summary: string | null;
  content: string;
  payload: Record<string, unknown>;
};

export function learnRecentInputFromSessionOutput(output: LearnSessionOutput): LearnSessionRecentInput {
  return {
    sessionId: output.sessionId,
    kind: "learn_output",
    title: output.title?.trim() || learnSessionTitle(output),
    summary: output.summary ?? clipText(output.content, 1_000),
    content: output.content,
    payload: learnSessionRecentPayload(output),
  };
}

export function learnSessionSaveCandidateFromRecent(recent: {
  id: string;
  sessionId: string | null;
  title: string;
  summary: string | null;
  body: string;
  payload: unknown;
}): LearnSessionSaveCandidate {
  if (!recent.sessionId) {
    throw new Error("Learn session recents must keep sessionId before they can become Brain objects.");
  }

  return {
    recentId: recent.id,
    sessionId: recent.sessionId,
    objectType: "learn_output",
    title: recent.title,
    summary: recent.summary,
    content: recent.body,
    payload: asRecord(recent.payload),
  };
}

function learnSessionTitle(output: LearnSessionOutput): string {
  if (output.term?.trim()) {
    return `Learn: ${clipText(output.term, 120)}`;
  }

  return clipText(output.content, 120) || "Learn output";
}

function learnSessionRecentPayload(output: LearnSessionOutput): Record<string, unknown> {
  return {
    ...asRecord(output.payload),
    source: "learn",
    learnSessionOutput: {
      sessionId: output.sessionId,
      title: output.title ?? null,
      summary: output.summary ?? null,
      term: output.term ?? null,
      refs: asRecord(output.refs),
    },
    candidateBrainObjects: candidateBrainObjects(output.candidateBrainObjects),
  };
}

function candidateBrainObjects(value: CandidateBrainObject[] | undefined): CandidateBrainObject[] {
  return value?.slice(0, 5) ?? [];
}

function clipText(value: string, max: number): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.length > max ? `${trimmed.slice(0, Math.max(0, max - 1)).trimEnd()}...` : trimmed;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
