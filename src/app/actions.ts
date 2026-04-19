"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  createSession,
  markAssumptionResolved,
  regenerateChallenge,
  submitSessionReflection,
  submitAnswer,
} from "@/server/penny";
import { getCurrentAuthenticatedUserId } from "@/server/auth";

const newSessionSchema = z.object({
  rawIdea: z.string().min(12, "Bring more than a slogan."),
  category: z.string().optional(),
});

export async function createSessionAction(formData: FormData) {
  const payload = newSessionSchema.parse({
    rawIdea: formData.get("rawIdea"),
    category: formData.get("category") || undefined,
  });

  const userId = await getCurrentAuthenticatedUserId();
  const sessionId = await createSession(payload.rawIdea, payload.category, undefined, userId);
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

export async function submitReflectionAction(sessionId: string, formData: FormData) {
  const readText = (primaryKey: string, fallbackKey: string) => {
    const value = formData.get(primaryKey) ?? formData.get(fallbackKey);
    return typeof value === "string" ? value : "";
  };

  const payload = {
    worked: z.string().min(2, "Say what you worked.").parse(readText("worked", "surprised")),
    resolved: z.string().min(2, "Say what you resolved.").parse(readText("resolved", "resisted")),
    remains: z.string().min(2, "Say what remains.").parse(readText("remains", "returnTo")),
  };

  await submitSessionReflection(sessionId, payload);
  revalidatePath(`/app/session/${sessionId}`);
}
