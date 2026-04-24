"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { featureRouteForId, featureUnlockDefinition } from "@/lib/time-locked-features";
import type { FeatureUnlockStatus } from "@/types/time-locked-features";

type FeatureUnlockProgressProps = {
  unlockStatuses: FeatureUnlockStatus[];
  onFeatureUnlocked?: (featureId: string) => void;
};

export function FeatureUnlockProgress({ unlockStatuses, onFeatureUnlocked }: FeatureUnlockProgressProps) {
  const locked = unlockStatuses.filter((status) => !status.isUnlocked);
  const recentlyUnlocked = unlockStatuses.filter(
    (status) => status.isUnlocked && status.unlockedAt != null && daysSince(status.unlockedAt) < 7,
  );

  return (
    <div className="space-y-4">
      {recentlyUnlocked.map((status) => {
        const feature = featureUnlockDefinition(status.featureId);

        if (!feature) {
          return null;
        }

        return (
          <Card key={status.featureId} className="border border-[#d9ead8] bg-[#f6fbf5] p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="max-w-3xl">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-[#d9ead8] text-[#355b32]">
                    <CheckCircle2 className="mr-1 size-3.5" />
                    unlocked
                  </Badge>
                  <Badge className="bg-white text-[var(--muted-ink)]">recent</Badge>
                </div>
                <h3 className="mt-3 text-xl font-semibold text-[var(--ink)]">{feature.featureName}</h3>
                <p className="mt-2 text-sm leading-7 text-[var(--muted-ink)]">{feature.unlockMessage}</p>
                <p className="mt-2 text-sm leading-7 text-[var(--ink)]">{feature.valuePropOnUnlock}</p>
                {status.unlockedAt ? (
                  <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">
                    Unlocked {formatDate(status.unlockedAt)}
                  </p>
                ) : null}
              </div>
              {renderExploreAction(feature.featureId, onFeatureUnlocked)}
            </div>
          </Card>
        );
      })}

      {locked.length > 0 ? (
        <Card className="border-black/8 bg-[var(--panel)] p-5 sm:p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Unlocking with use</p>
          <h2 className="mt-2 text-2xl font-semibold text-[var(--ink)]">Some features only become meaningful after enough history exists.</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--muted-ink)]">
            These unlocks are not arbitrary gates. Penny waits until there is enough history to compute the feature without lying about the data.
          </p>

          <div className="mt-5 space-y-4">
            {locked
              .sort((a, b) => a.percentComplete - b.percentComplete)
              .map((status) => {
                return <LockedFeatureRow key={status.featureId} featureId={status.featureId} status={status} />;
              })}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function LockedFeatureRow({ featureId, status }: { featureId: string; status: FeatureUnlockStatus }) {
  const feature = featureUnlockDefinition(featureId);

  if (!feature) {
    return null;
  }

  return (
    <div className="rounded-[22px] border border-black/8 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-[var(--ink)]">{feature.featureName}</h3>
            <Badge className="bg-[var(--panel)] text-[var(--ink)]">{status.percentComplete}%</Badge>
          </div>
          <p className="mt-2 text-sm leading-7 text-[var(--muted-ink)]">{feature.featureDescription}</p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {status.requirements.map((requirement) => (
          <RequirementRow key={requirement.requirementType} requirement={requirement} />
        ))}
      </div>

      <div className="mt-4 rounded-[18px] bg-[var(--panel)] p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Why it matters</p>
        <p className="mt-2 text-sm leading-7 text-[var(--ink)]">{feature.valuePropOnUnlock}</p>
        {status.estimatedUnlockDate ? (
          <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">
            At your pace: {formatDate(status.estimatedUnlockDate)}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function RequirementRow({ requirement }: { requirement: FeatureUnlockStatus["requirements"][number] }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">
        <span>{requirementLabel(requirement.requirementType)}</span>
        <span>
          {requirement.currentValue} / {requirement.threshold}
        </span>
      </div>
      <div className="h-2 rounded-full bg-black/6">
        <div
          className={`h-2 rounded-full ${requirement.isMet ? "bg-[#d9ead8]" : "bg-[var(--ink)]/25"}`}
          style={{ width: `${requirement.progressPercent}%` }}
        />
      </div>
    </div>
  );
}

function renderExploreAction(featureId: string, onFeatureUnlocked?: (featureId: string) => void) {
  const route = featureRouteForId(featureId);

  if (onFeatureUnlocked) {
    return (
      <Button className="gap-2" onClick={() => onFeatureUnlocked(featureId)}>
        Explore
        <ArrowRight className="size-4" />
      </Button>
    );
  }

  return (
    <Link href={route}>
      <Button className="gap-2">
        Explore
        <ArrowRight className="size-4" />
      </Button>
    </Link>
  );
}

function requirementLabel(type: FeatureUnlockStatus["requirements"][number]["requirementType"]): string {
  const labels: Record<FeatureUnlockStatus["requirements"][number]["requirementType"], string> = {
    min_claims: "claims",
    min_days: "days",
    min_resolutions: "resolved predictions",
    min_dialectic_rounds: "critique rounds",
    min_shapes: "confirmed patterns",
    domain_coverage: "domains covered",
  };

  return labels[type] ?? type;
}

function daysSince(date: Date) {
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)));
}
