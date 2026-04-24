import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { CounterfactualArchive, CounterfactualArchiveEntry } from "@/types/counterfactual";

function formatDate(value: Date) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatConfidence(value: number) {
  return `${Math.round(value)}%`;
}

function scenarioTone(entry: CounterfactualArchiveEntry["counterfactualScenarios"][number]) {
  if (entry.wouldHaveBeenBetter === true) {
    return "Better branch";
  }

  if (entry.wouldHaveBeenBetter === false) {
    return "Worse branch";
  }

  return "Unclear branch";
}

export function CounterfactualDashboard({ archive }: { archive: CounterfactualArchive }) {
  return (
    <Card className="border border-black/8 bg-white p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Counterfactual archive</p>
          <h2 className="mt-2 text-3xl font-semibold text-[var(--ink)] sm:text-4xl">
            What would have happened if you had acted earlier?
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--muted-ink)]">
            This surface reconstructs plausible branching points from the recorded claim history. It is useful because the archive is durable, not because it is omniscient.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge className="bg-[#d9ead8] text-[#355b32]">{archive.totalAnalyses} resolved claims</Badge>
          <Badge className="bg-[#e7defa] text-[#5c4c88]">Generated {formatDate(archive.generatedAt)}</Badge>
        </div>
      </div>

      <div className="mt-6 rounded-[24px] bg-[var(--panel)] p-5">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Archive insight</p>
        <p className="mt-3 text-sm leading-7 text-[var(--ink)]">{archive.archiveInsight}</p>
      </div>

      <div className="mt-6 space-y-4">
        {archive.analyses.length ? (
          archive.analyses.map((analysis) => (
            <div key={analysis.id} className="rounded-[28px] border border-black/8 bg-[var(--panel)] p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-3xl">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-white text-[var(--ink)]">{analysis.mapTitle}</Badge>
                    <Badge className="bg-[#fff6ed] text-[#8b4d1f]">{analysis.resolutionLabel}</Badge>
                    <Badge className="bg-white text-[var(--muted-ink)]">{analysis.daysSinceResolution} days ago</Badge>
                  </div>
                  <h3 className="mt-3 text-xl font-semibold text-[var(--ink)]">{analysis.claimText}</h3>
                  <p className="mt-2 text-sm leading-7 text-[var(--muted-ink)]">{analysis.keyInsight}</p>
                </div>
                <div className="rounded-[22px] bg-white/80 p-4 lg:min-w-[220px]">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Resolution math</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--ink)]">
                    Capture: {formatConfidence(analysis.originalConfidence)}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[var(--ink)]">
                    At resolution: {formatConfidence(analysis.confidenceAtResolution)}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[var(--muted-ink)]">
                    Resolved on {formatDate(analysis.actualResolutionDate)}
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                <div className="rounded-[24px] bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Decision timeline</p>
                  <div className="mt-4 space-y-3">
                    {analysis.decisionTimeline.map((point) => (
                      <div key={`${analysis.id}:${point.dayOffset}`} className="rounded-[18px] border border-black/8 bg-[var(--panel)] p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className="bg-white text-[var(--ink)]">Day {point.dayOffset}</Badge>
                          <Badge className="bg-[#e7defa] text-[#5c4c88]">{point.hindsightAssessment ?? "unscored"}</Badge>
                          <Badge className="bg-[#d9ead8] text-[#355b32]">{formatConfidence(point.confidenceAtPoint)}</Badge>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{point.eventAtPoint ?? "No recorded branch yet at this point."}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">
                          {formatDate(point.date)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-[24px] bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Counterfactual scenarios</p>
                  <div className="mt-4 space-y-3">
                    {analysis.counterfactualScenarios.map((scenario) => (
                      <div key={scenario.id} className="rounded-[18px] border border-black/8 bg-[var(--panel)] p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className="bg-white text-[var(--ink)]">{scenario.scenarioLabel}</Badge>
                          <Badge className={scenario.wouldHaveBeenBetter === true ? "bg-[#d9ead8] text-[#355b32]" : scenario.wouldHaveBeenBetter === false ? "bg-[#ffe1e1] text-[#8b2f2f]" : "bg-[#f3f3f3] text-[var(--muted-ink)]"}>
                            {scenarioTone(scenario)}
                          </Badge>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{scenario.hypotheticalOutcome}</p>
                        <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{scenario.lesson}</p>
                        <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">
                          {formatConfidence(scenario.confidenceAtThatPoint)} confidence · {scenario.actionType.replaceAll("_", " ")}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
            <p className="text-sm leading-7 text-[var(--muted-ink)]">
              No resolved claims have been archived yet. Once a claim resolves, Penny will reconstruct the day 0, 30, 60, and 90 branches from the recorded timeline.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
