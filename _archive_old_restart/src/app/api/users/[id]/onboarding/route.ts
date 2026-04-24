import { NextResponse } from "next/server";
import { z } from "zod";
import { getOnboardingWorkspace, updateOnboardingProgress } from "@/server/onboarding";
import type { OnboardingRole, OnboardingStep } from "@/types/onboarding";
import { UserParamsSchema } from "@/lib/validation/schemas";

const onboardingUpdateSchema = z.object({
  selectedRole: z.enum(["founder", "researcher", "investor", "operator", "default"]).optional(),
  currentStep: z.enum([
    "welcome",
    "explain_the_model",
    "first_claim_prompted",
    "first_structure",
    "first_steel_man",
    "first_critique",
    "see_the_response_options",
    "first_update",
    "see_the_map",
    "explain_compounding",
    "complete",
  ]).optional(),
  skippedAt: z.union([z.coerce.date(), z.null()]).optional(),
  completedAt: z.union([z.coerce.date(), z.null()]).optional(),
  firstMapId: z.string().nullable().optional(),
  firstClaimId: z.string().nullable().optional(),
  firstCritiqueRoundId: z.string().nullable().optional(),
});

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = UserParamsSchema.parse(await context.params);
  const workspace = await getOnboardingWorkspace(id);
  return NextResponse.json({ workspace });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = UserParamsSchema.parse(await context.params);
  const json = await request.json().catch(() => ({}));
  const input = onboardingUpdateSchema.parse(json) as {
    selectedRole?: OnboardingRole;
    currentStep?: OnboardingStep;
    skippedAt?: Date | null;
    completedAt?: Date | null;
    firstMapId?: string | null;
    firstClaimId?: string | null;
    firstCritiqueRoundId?: string | null;
  };

  const workspace = await updateOnboardingProgress(id, {
    selectedRole: input.selectedRole,
    currentStep: input.currentStep,
    skippedAt: input.skippedAt ?? null,
    completedAt: input.completedAt ?? null,
    firstMapId: input.firstMapId ?? null,
    firstClaimId: input.firstClaimId ?? null,
    firstCritiqueRoundId: input.firstCritiqueRoundId ?? null,
  });

  return NextResponse.json({ workspace });
}
