"use client";

import { Card } from "@/components/ui/card";
import { OnboardingChecklist } from "@/components/penny/onboarding-checklist";
import type { DashboardPanel } from "@/types/home-dashboard";
import type { OnboardingChecklist as OnboardingChecklistState } from "@/types/onboarding";

export function OnboardingChecklistPanel({ panel }: { panel: DashboardPanel }) {
  const checklist = panel.data.checklist as OnboardingChecklistState;

  return (
    <Card className="p-6">
      <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Onboarding</p>
      <h3 className="mt-2 text-2xl font-semibold text-[var(--ink)]">Keep the first 10 minutes focused.</h3>
      <p className="mt-2 text-sm leading-7 text-[var(--muted-ink)]">
        The checklist keeps the first session from dissolving into feature exploration.
      </p>
      <div className="mt-4">
        <OnboardingChecklist checklist={checklist} />
      </div>
    </Card>
  );
}
