"use client";

import { RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { CognitiveBiasProfile } from "@/types/thought-map";

type BiasProfileProps = {
  profile: CognitiveBiasProfile | null;
  loading?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
};

function formatRate(successes: number, attempts: number) {
  if (!attempts) {
    return "n/a";
  }

  return `${Math.round((successes / attempts) * 100)}%`;
}

function trendLabel(trend: CognitiveBiasProfile["overallCalibrationTrend"]) {
  if (trend === "improving") {
    return "improving";
  }

  if (trend === "degrading") {
    return "degrading";
  }

  return "stable";
}

export function BiasProfile({ profile, loading = false, refreshing = false, onRefresh }: BiasProfileProps) {
  return (
    <Card className="border border-black/8 bg-[var(--panel)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">Bias Profile</p>
          <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">Named bias patterns derived from shapes and outcomes.</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
            These are the named patterns Penny can now use to modulate critique when the evidence supports it.
          </p>
        </div>
        <Button variant="secondary" className="gap-2" onClick={onRefresh} disabled={loading || refreshing || !onRefresh}>
          <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {!profile ? (
        <p className="mt-4 text-sm leading-6 text-[var(--muted-ink)]">No bias profile is available yet.</p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge className="bg-white text-[var(--ink)]">Trend: {trendLabel(profile.overallCalibrationTrend)}</Badge>
            <Badge className="bg-[#e7defa] text-[#5c4c88]">
              Strongest: {profile.strongestBias?.name ?? "n/a"}
            </Badge>
            <Badge className="bg-[#d9ead8] text-[#355b32]">
              Most improved: {profile.mostImprovedBias?.name ?? "n/a"}
            </Badge>
            <Badge className="bg-white text-[var(--muted-ink)]">
              Updated {profile.lastUpdated.toLocaleDateString()}
            </Badge>
          </div>

          <div className="mt-5 space-y-3">
            {profile.biasEntries.length ? (
              profile.biasEntries.map((entry) => (
                <details key={entry.biasType.id} className="rounded-[18px] border border-black/8 bg-white/80 p-4">
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-[var(--ink)]">{entry.biasType.name}</p>
                      <Badge className="bg-white text-[var(--muted-ink)]">{entry.status}</Badge>
                      <Badge className="bg-[#e7defa] text-[#5c4c88]">{entry.evidenceCount} evidence</Badge>
                      <Badge className="bg-[#fff6ed] text-[#8b4d1f]">trend {entry.trend}</Badge>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{entry.biasType.description}</p>
                  </summary>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-[var(--panel)] p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Domains</p>
                      <p className="mt-2 text-sm leading-6 text-[var(--ink)]">
                        {entry.claimDomains.length ? entry.claimDomains.join(", ") : "general"}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-[var(--panel)] p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Mitigation rate</p>
                      <p className="mt-2 text-sm leading-6 text-[var(--ink)]">
                        {entry.mitigationSuccesses}/{entry.mitigationAttempts} attempts · {formatRate(entry.mitigationSuccesses, entry.mitigationAttempts)} success
                      </p>
                    </div>
                  </div>

                  <p className="mt-4 text-sm leading-6 text-[var(--ink)]">
                    Penny would use this bias entry to sharpen critique in the active domain and surface one of these prompts:
                  </p>
                  <ul className="mt-3 space-y-2">
                    {entry.biasType.mitigationPrompts.slice(0, 2).map((prompt) => (
                      <li key={prompt} className="rounded-2xl bg-[var(--panel)] p-3 text-sm leading-6 text-[var(--muted-ink)]">
                        {prompt}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-4 space-y-2">
                    {entry.evidenceInstances.slice(0, 4).map((instance) => (
                      <div key={instance.eventId} className="rounded-2xl bg-[var(--panel)] p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className="bg-white text-[var(--ink)]">{instance.eventType.replaceAll("_", " ")}</Badge>
                          <Badge className="bg-[#e7defa] text-[#5c4c88]">signal {instance.signalStrength}%</Badge>
                          <Badge className="bg-white text-[var(--muted-ink)]">
                            {instance.timestamp.toLocaleDateString()}
                          </Badge>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{instance.description}</p>
                      </div>
                    ))}
                  </div>
                </details>
              ))
            ) : (
              <p className="rounded-[18px] bg-white/80 p-4 text-sm leading-6 text-[var(--muted-ink)]">
                No confirmed bias patterns yet. Penny will surface them once the evidence is strong enough.
              </p>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
