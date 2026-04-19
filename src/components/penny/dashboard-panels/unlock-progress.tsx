"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FeatureUnlockProgress } from "@/components/penny/feature-unlock-progress";
import type { FeatureUnlockStatus } from "@/types/time-locked-features";
import type { DashboardPanel } from "@/types/home-dashboard";

export function UnlockProgressPanel({ panel }: { panel: DashboardPanel }) {
  const unlockStatuses = (panel.data.unlockStatuses ?? []) as FeatureUnlockStatus[];
  const unlockSummary = panel.data.unlockSummary as { unlockedCount: number; lockedCount: number } | null;
  const nextFeatureName = (panel.data.nextFeatureName ?? null) as string | null;

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="bg-[#fff0eb] text-[#a04b35]">time locked</Badge>
        <Badge className="bg-white text-[var(--muted-ink)]">{unlockSummary?.unlockedCount ?? 0} unlocked</Badge>
        <Badge className="bg-white text-[var(--muted-ink)]">{unlockSummary?.lockedCount ?? 0} locked</Badge>
      </div>
      <h3 className="mt-3 text-2xl font-semibold text-[var(--ink)]">Some features only make sense after history accumulates.</h3>
      <p className="mt-2 text-sm leading-7 text-[var(--muted-ink)]">
        {nextFeatureName ? `Next unlock: ${nextFeatureName}.` : "Unlocks appear once the history is dense enough to compute them honestly."}
      </p>
      <div className="mt-4">
        <FeatureUnlockProgress unlockStatuses={unlockStatuses} onFeatureUnlocked={() => {}} />
      </div>
      <div className="mt-4">
        <Link href="/app/unlocks">
          <Button variant="secondary" className="gap-2">
            Open unlocks
            <ArrowRight className="size-4" />
          </Button>
        </Link>
      </div>
    </Card>
  );
}
