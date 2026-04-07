"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  createSession,
  markAssumptionResolved,
  regenerateChallenge,
  submitAnswer,
} from "@/server/penny";

const newSessionSchema = z.object({
  rawIdea: z.string().min(12, "Bring more than a slogan."),
  category: z.string().optional(),
});

export async function createSessionAction(formData: FormData) {
  const payload = newSessionSchema.parse({
    rawIdea: formData.get("rawIdea"),
    category: formData.get("category") || undefined,
  });

  const sessionId = await createSession(payload.rawIdea, payload.category);
  redirect(`/app/session/${sessionId}`);
}

export async function submitAnswerAction(sessionId: string, formData: FormData) {
  const answer = z.string().min(2, "Answer required.").parse(formData.get("answer"));
  await submitAnswer(sessionId, answer);
  revalidatePath(`/app/session/${sessionId}`);
}

export async function regenerateChallengeAction(sessionId: string) {
  await regenerateChallenge(sessionId);
  revalidatePath(`/app/session/${sessionId}`);
}

export async function resolveAssumptionAction(sessionId: string, assumption: string) {
  await markAssumptionResolved(sessionId, assumption);
  revalidatePath(`/app/session/${sessionId}`);
}
