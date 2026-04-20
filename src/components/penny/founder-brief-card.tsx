"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DependencyHealthBar } from "@/components/penny/dependency-health";
import { CopyBriefButton } from "@/components/penny/copy-brief-button";
import { ArtifactOutcomeFlow } from "@/components/penny/artifact-outcome-flow";
import { UncertaintyIndicator } from "@/components/penny/uncertainty-indicator";
import { formatFounderBrief } from "@/lib/founder-brief";
import type { FounderBriefModel } from "@/types/thought-map";

export function FounderBriefCard({ brief }: { brief: FounderBriefModel }) {
  const [showOutcomeFlow, setShowOutcomeFlow] = useState(false);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-black/8 bg-[var(--panel)] px-6 py-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Founder Brief</p>
          <h3 className="mt-1 text-xl font-semibold text-[var(--ink)]">Map-derived summary worth revisiting</h3>
          {brief.uncertainty ? (
            <div className="mt-2">
              <UncertaintyIndicator uncertainty={brief.uncertainty} />
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setShowOutcomeFlow((current) => !current)}>
            Add outcome
          </Button>
          <CopyBriefButton value={formatFounderBrief(brief)} />
        </div>
      </div>

      {showOutcomeFlow ? (
        <div className="border-b border-black/8 bg-[var(--panel)] px-6 py-6">
          <ArtifactOutcomeFlow
            artifactId={brief.artifactId}
            artifactTypeLabel="Founder Brief"
            loadBearingClaims={brief.loadBearingClaims}
            onClose={() => setShowOutcomeFlow(false)}
            onSaved={(_, retrospectivePrompt) => {
              if (!retrospectivePrompt) {
                setShowOutcomeFlow(false);
              }
            }}
          />
        </div>
      ) : null}

      <div className="border-b border-black/8 px-6 py-5">
        <DependencyHealthBar health={brief.dependencyHealth} />
      </div>

      <div className="grid gap-5 px-6 py-6 lg:grid-cols-3">
        <BriefGroup title="Core frame" description="The shortest useful orientation for the brief.">
          <Section title="Idea summary" content={brief.ideaSummary} />
          <Section title="Target user" content={brief.targetUser} />
          <Section title="Core claim" content={brief.coreClaim} />
          <Section title="Stakes level" content={brief.stakesLevel} />
        </BriefGroup>

        <BriefGroup title="Pressure points" description="The load-bearing risk surface to keep in view.">
          <ListSection title="Load-bearing claims" items={brief.loadBearingClaims.map((claim) => claim.claimText)} />
          <ListSection title="Key assumptions" items={brief.keyAssumptions} />
          <ListSection title="Strongest counterarguments" items={brief.strongestCounterarguments} />
          <Section title="Pre-mortem" content={brief.preMortem} />
        </BriefGroup>

        <BriefGroup title="Next moves" description="What to test next if the brief is meant to drive action.">
          <OrderedSection title="Next 3 validation steps" items={brief.nextValidationSteps} />
          <Section title="If you were right" content={brief.ifYouWereRight} />
          <Section title="Twin-check" content={brief.twinCheck} />
          <Section title="Dependency completeness" content={brief.dependencyCompleteness} />
        </BriefGroup>
      </div>
    </Card>
  );
}

function BriefGroup({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[28px] border border-black/8 bg-[linear-gradient(180deg,#fffefb_0%,#f7f1e8_100%)] p-5 shadow-[0_14px_34px_rgba(34,39,46,0.05)]">
      <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">{title}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{description}</p>
      <div className="mt-5 space-y-5 text-sm leading-7 text-[var(--ink)]">{children}</div>
    </div>
  );
}

function Section({ title, content }: { title: string; content: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">{title}</p>
      <p className="mt-2 text-sm leading-7 text-[var(--ink)]">{content}</p>
    </div>
  );
}

function ListSection({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">{title}</p>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <p key={item} className="rounded-[18px] border border-black/8 bg-white px-4 py-3 text-sm leading-6">
            {item}
          </p>
        ))}
      </div>
    </div>
  );
}

function OrderedSection({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">{title}</p>
      <div className="mt-3 space-y-2">
        {items.map((item, index) => (
          <div key={item} className="flex gap-3 rounded-[18px] border border-black/8 bg-white px-4 py-3">
            <span className="mt-0.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--panel)] px-2 text-xs font-medium text-[var(--ink)]">
              {index + 1}
            </span>
            <p className="text-sm leading-6 text-[var(--ink)]">{item}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
