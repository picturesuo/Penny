"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ThoughtMapForm } from "@/components/penny/thought-map-form";
import { OnboardingChecklist } from "@/components/penny/onboarding-checklist";
import { OnboardingSpotlight } from "@/components/penny/onboarding-spotlight";
import { getOnboardingExampleClaim, getOnboardingPrompt } from "@/lib/onboarding";
import type { OnboardingRole, OnboardingStep, OnboardingWorkspaceState } from "@/types/onboarding";

const ROLES: Array<{ role: OnboardingRole; label: string; description: string }> = [
  {
    role: "founder",
    label: "Founder",
    description: "Use if you are working through a product, company, or fundraising decision.",
  },
  {
    role: "researcher",
    label: "Researcher",
    description: "Use if you are checking a hypothesis or model against evidence.",
  },
  {
    role: "investor",
    label: "Investor",
    description: "Use if you are evaluating timing, market structure, or risk.",
  },
  {
    role: "operator",
    label: "Operator",
    description: "Use if you are deciding how a team or process should actually work.",
  },
  {
    role: "default",
    label: "Default",
    description: "Use if you just want a strong first claim and do not want to think about taxonomy.",
  },
];

export function OnboardingFlow({
  userId,
  workspace,
  initialPrefill,
}: {
  userId: string;
  workspace: OnboardingWorkspaceState;
  initialPrefill?: string | null;
}) {
  const [activeStep, setActiveStep] = useState<OnboardingStep>(workspace.state.currentStep);
  const [role, setRole] = useState<OnboardingRole>(workspace.role);
  const [isSaving, setIsSaving] = useState(false);
  const formAnchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setActiveStep(workspace.state.currentStep);
    setRole(workspace.role);
  }, [workspace.role, workspace.state.currentStep]);

  const prompt = useMemo(() => getOnboardingPrompt(activeStep, role), [activeStep, role]);
  const exampleClaim = useMemo(
    () => initialPrefill?.trim().length ? initialPrefill : prompt.exampleContent ?? getOnboardingExampleClaim(role),
    [initialPrefill, prompt.exampleContent, role],
  );

  async function persist(update: Partial<OnboardingWorkspaceState["state"]> & { selectedRole?: OnboardingRole }) {
    setIsSaving(true);
    try {
      await fetch(`/api/users/${userId}/onboarding`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          selectedRole: update.selectedRole ?? role,
          currentStep: update.currentStep ?? activeStep,
          ...(update.skippedAt !== undefined ? { skippedAt: update.skippedAt } : {}),
          ...(update.completedAt !== undefined ? { completedAt: update.completedAt } : {}),
          ...(update.firstMapId !== undefined ? { firstMapId: update.firstMapId } : {}),
          ...(update.firstClaimId !== undefined ? { firstClaimId: update.firstClaimId } : {}),
          ...(update.firstCritiqueRoundId !== undefined ? { firstCritiqueRoundId: update.firstCritiqueRoundId } : {}),
        }),
      });
    } finally {
      setIsSaving(false);
    }
  }

  function chooseRole(nextRole: OnboardingRole) {
    setRole(nextRole);
    const nextStep: OnboardingStep = activeStep === "welcome" ? "first_claim_prompted" : activeStep;
    setActiveStep(nextStep);
    void persist({ selectedRole: nextRole, currentStep: nextStep });
    requestAnimationFrame(() => {
      formAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function beginClaim() {
    const nextStep: OnboardingStep = activeStep === "welcome" ? "first_claim_prompted" : activeStep;
    setActiveStep(nextStep);
    void persist({ currentStep: nextStep });
    requestAnimationFrame(() => {
      formAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function skipStep() {
    const nextStep: OnboardingStep = activeStep === "welcome" ? "first_claim_prompted" : activeStep === "first_claim_prompted" ? "first_structure" : activeStep;
    setActiveStep(nextStep);
    void persist({ currentStep: nextStep, skippedAt: new Date() });
  }

  function handleCreatedMap(mapId: string) {
    const nextStep: OnboardingStep = "first_structure";
    setActiveStep(nextStep);
    void persist({
      currentStep: nextStep,
      firstMapId: mapId,
    });
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-black/8 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(244,240,230,0.96))] p-6 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-[#e7defa] text-[#5c4c88]">
                <Sparkles className="mr-1 size-3.5" />
                first 10 minutes
              </Badge>
              <Badge className="bg-white text-[var(--muted-ink)]">{workspace.checklist.completedCount}/{workspace.checklist.totalCount} checklist items</Badge>
              <Badge className="bg-white text-[var(--muted-ink)]">step {activeStep.replaceAll("_", " ")}</Badge>
            </div>
            <h1 className="mt-3 text-4xl font-semibold text-[var(--ink)] sm:text-5xl">Start with one claim Penny can actually work on.</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--muted-ink)]">
              The first session is not about teaching every feature. It is about getting to a real claim, a first critique, and one visible update as fast as possible.
            </p>
          </div>
          <div className="rounded-[24px] border border-black/8 bg-white/85 p-5 lg:min-w-[300px]">
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Current role</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">{ROLES.find((item) => item.role === role)?.label ?? "Default"}</p>
            <p className="mt-2 text-sm leading-7 text-[var(--muted-ink)]">
              {ROLES.find((item) => item.role === role)?.description ?? "Use the default claim if none of the role-specific examples fit."}
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Choose a role</p>
        <h2 className="mt-2 text-2xl font-semibold text-[var(--ink)]">Pick the example that is close enough to matter.</h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--muted-ink)]">
          The point is to avoid blank-page paralysis. The example claim should be relevant enough to feel real and generic enough to edit quickly.
        </p>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {ROLES.map((item) => (
            <button
              key={item.role}
              type="button"
              onClick={() => chooseRole(item.role)}
              className={`rounded-[22px] border p-4 text-left transition ${
                item.role === role ? "border-black/12 bg-[var(--panel)]" : "border-black/8 bg-white hover:border-black/15"
              }`}
            >
              <p className="text-sm font-medium text-[var(--ink)]">{item.label}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{item.description}</p>
            </button>
          ))}
        </div>
      </Card>

      <OnboardingSpotlight
        prompt={{ ...prompt, exampleContent: exampleClaim }}
        role={role}
        onStart={beginClaim}
        onSkip={skipStep}
      />

      <OnboardingChecklist checklist={workspace.checklist} />

      <div ref={formAnchorRef} className="space-y-4">
        <Card className="p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Your first claim</p>
          <h2 className="mt-2 text-2xl font-semibold text-[var(--ink)]">Use the example, edit it, and save the first map.</h2>
          <p className="mt-2 text-sm leading-7 text-[var(--muted-ink)]">
            Once the first claim exists, Penny can immediately branch structure, steel-man the opposite view, and start critique.
          </p>
        </Card>

        <ThoughtMapForm userId={userId} initialRawThought={exampleClaim} onCreatedMap={handleCreatedMap} />
      </div>

      <Card className="p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">What happens next</p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <StepCard label="1" title="Structure" body="Penny turns the claim into a map with assumptions and dependencies." />
          <StepCard label="2" title="Steel-man" body="The strongest opposing view is written before critique starts." />
          <StepCard label="3" title="Update" body="A visible confidence update makes the first loop real." />
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button onClick={beginClaim} className="gap-2">
            {prompt.actionLabel}
            <ArrowRight className="size-4" />
          </Button>
          <Badge className="bg-white text-[var(--muted-ink)]">
            {isSaving ? "saving progress" : "progress tracked locally and by user id"}
          </Badge>
        </div>
      </Card>
    </div>
  );
}

function StepCard({ label, title, body }: { label: string; title: string; body: string }) {
  return (
    <div className="rounded-[22px] border border-black/8 bg-[var(--panel)] p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">{label}</p>
      <p className="mt-2 text-lg font-semibold text-[var(--ink)]">{title}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{body}</p>
    </div>
  );
}
