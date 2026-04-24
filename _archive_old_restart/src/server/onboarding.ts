import { prisma } from "@/db/prisma";
import { buildOnboardingState, buildOnboardingWorkspaceState } from "@/lib/onboarding";
import { listMarginFragments, listSessions } from "@/server/penny";
import { listThoughtMaps } from "@/server/thought-map";
import type { OnboardingProgressUpdate, OnboardingRole, OnboardingStep, OnboardingWorkspaceState } from "@/types/onboarding";

function parseCompletedSteps(value: string | null): OnboardingStep[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is OnboardingStep => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function serializeCompletedSteps(steps: OnboardingStep[]) {
  return JSON.stringify(Array.from(new Set(steps)));
}

async function loadOnboardingRecord(userId: string) {
  return prisma.onboardingProgress.findUnique({
    where: { userId },
  });
}

async function upsertOnboardingRecord(userId: string, update: OnboardingProgressUpdate) {
  const existing = await loadOnboardingRecord(userId);
  const completedSteps = parseCompletedSteps(existing?.completedStepsJson ?? null);

  if (update.currentStep && !completedSteps.includes(update.currentStep)) {
    completedSteps.push(update.currentStep);
  }

  return prisma.onboardingProgress.upsert({
    where: { userId },
    create: {
      userId,
      selectedRole: update.selectedRole ?? "default",
      currentStep: update.currentStep ?? "welcome",
      completedStepsJson: serializeCompletedSteps(completedSteps),
      firstMapId: update.firstMapId ?? null,
      firstClaimId: update.firstClaimId ?? null,
      firstCritiqueRoundId: update.firstCritiqueRoundId ?? null,
      skippedAt: update.skippedAt ?? null,
      completedAt: update.completedAt ?? null,
      startedAt: new Date(),
    },
    update: {
      selectedRole: update.selectedRole ?? existing?.selectedRole ?? "default",
      currentStep: update.currentStep ?? existing?.currentStep ?? "welcome",
      completedStepsJson: serializeCompletedSteps(completedSteps),
      firstMapId: update.firstMapId ?? existing?.firstMapId ?? null,
      firstClaimId: update.firstClaimId ?? existing?.firstClaimId ?? null,
      firstCritiqueRoundId: update.firstCritiqueRoundId ?? existing?.firstCritiqueRoundId ?? null,
      skippedAt: update.skippedAt ?? existing?.skippedAt ?? null,
      completedAt: update.completedAt ?? existing?.completedAt ?? null,
    },
  });
}

export async function getOnboardingWorkspace(userId: string, role?: OnboardingRole): Promise<OnboardingWorkspaceState> {
  const [maps, sessions, fragments, record] = await Promise.all([
    listThoughtMaps(),
    listSessions(userId),
    listMarginFragments(userId),
    loadOnboardingRecord(userId),
  ]);
  const userMaps = maps.filter((map) => map.userId === userId);

  const selectedRole = role ?? (record?.selectedRole as OnboardingRole | undefined) ?? "default";
  const persistedStep = (record?.currentStep as OnboardingStep | undefined) ?? null;

  if (!record) {
    const derivedState = buildOnboardingState({ userId, maps: userMaps, sessions, fragments });
    await upsertOnboardingRecord(userId, {
      selectedRole,
      currentStep: derivedState.currentStep,
      firstMapId: derivedState.firstMapId,
      firstClaimId: derivedState.firstClaimId,
      firstCritiqueRoundId: derivedState.firstCritiqueRoundId,
      completedAt: derivedState.completedAt,
    });
  }

  return buildOnboardingWorkspaceState({
    userId,
    maps: userMaps,
    sessions,
    fragments,
    role: selectedRole,
    persistedStep,
  });
}

export async function updateOnboardingProgress(userId: string, update: OnboardingProgressUpdate): Promise<OnboardingWorkspaceState> {
  await upsertOnboardingRecord(userId, update);
  return getOnboardingWorkspace(userId, update.selectedRole);
}
