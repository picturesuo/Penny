"use client";

import { useMemo, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { CognitiveFingerprint, CognitiveFingerprintEntry } from "@/types/cognitive-fingerprint";

export function CognitiveFingerprintView({ fingerprint }: { fingerprint: CognitiveFingerprint }) {
  const [currentFingerprint, setCurrentFingerprint] = useState(fingerprint);
  const [selectedPatternId, setSelectedPatternId] = useState(
    fingerprint.dominantPattern?.id ?? fingerprint.confirmedPatterns[0]?.id ?? fingerprint.emergingPatterns[0]?.id ?? null,
  );
  const [disputeText, setDisputeText] = useState("");
  const [falsificationCondition, setFalsificationCondition] = useState("");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedPattern = useMemo(() => {
    const pool = [
      ...currentFingerprint.confirmedPatterns,
      ...currentFingerprint.emergingPatterns,
      ...currentFingerprint.retiredPatterns,
    ];
    return pool.find((pattern) => pattern.id === selectedPatternId) ?? currentFingerprint.dominantPattern ?? pool[0] ?? null;
  }, [currentFingerprint, selectedPatternId]);

  async function handleSaveReview(acknowledged: boolean) {
    if (!selectedPattern) {
      return;
    }

    startTransition(async () => {
      setSaveMessage(null);

      try {
        const response = await fetch(`/api/users/${currentFingerprint.userId}/fingerprint`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            patternId: selectedPattern.id,
            disputeText: disputeText.trim() || null,
            falsificationCondition: falsificationCondition.trim() || null,
            acknowledged,
          }),
        });

        if (!response.ok) {
          setSaveMessage("Could not save the review.");
          return;
        }

        const payload = (await response.json()) as { fingerprint: CognitiveFingerprint };
        setCurrentFingerprint(payload.fingerprint);
        setSaveMessage(acknowledged ? "Pattern acknowledged." : "Review saved.");
      } catch {
        setSaveMessage("Could not save the review.");
      }
    });
  }

  function selectPattern(pattern: CognitiveFingerprintEntry) {
    setSelectedPatternId(pattern.id);
    setDisputeText(pattern.userDisputeText ?? "");
    setFalsificationCondition(pattern.userFalsificationCondition ?? "");
    setSaveMessage(null);
  }

  if (!selectedPattern) {
    return (
      <Card className="p-6 sm:p-8">
        <p className="text-sm leading-7 text-[var(--muted-ink)]">No cognitive fingerprint is available yet.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-black/8 bg-[linear-gradient(135deg,rgba(18,18,24,0.95),rgba(40,33,58,0.94))] p-6 text-white sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.24em] text-white/60">Living cognitive fingerprint</p>
            <h1 className="mt-2 text-4xl font-semibold text-white sm:text-5xl">How you think, as Penny has actually observed it.</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-white/72">
              This is the named, evidenced pattern set that Penny has accumulated from repeated behavior, not a generic personality profile.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:max-w-[380px]">
            <Badge className="bg-white/12 text-white">{currentFingerprint.totalPatternsDetected} patterns</Badge>
            <Badge className="bg-white/12 text-white">{currentFingerprint.uniquenessScore}/100 distinct</Badge>
            <Badge className="bg-white/12 text-white">{currentFingerprint.confirmedPatterns.length} confirmed</Badge>
            <Badge className="bg-white/12 text-white">{currentFingerprint.retiredPatterns.length} retired</Badge>
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-[28px] border border-white/10 bg-white/8 p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-white/60">Summary</p>
            <blockquote className="mt-3 text-lg leading-8 text-white">{currentFingerprint.summaryParagraph}</blockquote>
            <div className="mt-4 space-y-3 rounded-[22px] bg-white/8 p-4 text-sm leading-6 text-white/72">
              <p>Version {currentFingerprint.version} lens {currentFingerprint.lensVersion}.</p>
              <p>{currentFingerprint.dominantPattern ? `Dominant pattern: ${currentFingerprint.dominantPattern.patternName}.` : "No dominant pattern has emerged yet."}</p>
              <p>{currentFingerprint.mostImprovedPattern ? `Most improved: ${currentFingerprint.mostImprovedPattern.patternName}.` : "No pattern has clearly improved yet."}</p>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/8 p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-white/60">Pattern spine</p>
            <div className="mt-4 grid gap-3">
              {[...currentFingerprint.confirmedPatterns, ...currentFingerprint.emergingPatterns, ...currentFingerprint.retiredPatterns].map((pattern) => (
                <button
                  key={pattern.id}
                  className={`rounded-[22px] border p-4 text-left transition ${
                    pattern.id === selectedPattern.id
                      ? "border-white/30 bg-white/10"
                      : "border-white/10 bg-white/6 hover:border-white/20"
                  }`}
                  onClick={() => selectPattern(pattern)}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-white/10 text-white">{pattern.status}</Badge>
                    <Badge className="bg-white/10 text-white">{pattern.patternCategory}</Badge>
                    <Badge className="bg-white/10 text-white">{pattern.confidenceInPattern}%</Badge>
                  </div>
                  <p className="mt-3 text-sm font-medium text-white">{pattern.patternName}</p>
                  <p className="mt-2 text-sm leading-6 text-white/68">{pattern.patternDescription}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6 sm:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Selected pattern</p>
            <h2 className="mt-2 text-3xl font-semibold text-[var(--ink)]">{selectedPattern.patternName}</h2>
            <p className="mt-2 text-sm leading-7 text-[var(--muted-ink)]">{selectedPattern.patternDescription}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-[var(--panel)] text-[var(--ink)]">{selectedPattern.status}</Badge>
            <Badge className="bg-[#e7defa] text-[#5c4c88]">{selectedPattern.evidenceCount} evidence points</Badge>
            <Badge className="bg-[var(--panel)] text-[var(--ink)]">{selectedPattern.confidenceInPattern}% confident</Badge>
          </div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-4">
            <section className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">How it affects you</p>
              <p className="mt-3 text-sm leading-7 text-[var(--ink)]">{selectedPattern.howItAffectsYou}</p>
              <p className="mt-4 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">How Penny responds</p>
              <p className="mt-2 text-sm leading-7 text-[var(--ink)]">{selectedPattern.howPennyResponds}</p>
            </section>

            <section className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Trajectory</p>
              <div className="mt-4 space-y-3">
                {selectedPattern.trajectory.length ? (
                  selectedPattern.trajectory.map((point) => (
                    <div key={`${selectedPattern.id}-${point.date.toISOString()}`} className="rounded-[18px] border border-black/8 bg-white p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="bg-white text-[var(--ink)]">{point.eventTrigger}</Badge>
                        <Badge className="bg-[#d9ead8] text-[#355b32]">{point.strength}%</Badge>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{point.date.toLocaleDateString()}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm leading-7 text-[var(--muted-ink)]">No trajectory is available yet.</p>
                )}
              </div>
              {selectedPattern.hasEverImproved ? (
                <p className="mt-4 rounded-[18px] bg-white p-4 text-sm leading-6 text-[var(--ink)]">
                  This pattern has weakened at least once. That is the growth signal Penny should keep watching.
                </p>
              ) : null}
            </section>
          </div>

          <div className="space-y-4">
            <section className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Evidence</p>
              <div className="mt-4 space-y-3">
                {selectedPattern.evidenceInstances.length ? (
                  selectedPattern.evidenceInstances.map((evidence) => (
                    <div key={evidence.id} className="rounded-[18px] border border-black/8 bg-white p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="bg-[var(--panel)] text-[var(--ink)]">{evidence.eventType}</Badge>
                        <Badge className="bg-white text-[var(--muted-ink)]">{Math.round(evidence.signalStrength * 100)}% strength</Badge>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{evidence.eventDescription}</p>
                      <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{evidence.claimContext}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm leading-7 text-[var(--muted-ink)]">No evidence is available yet.</p>
                )}
              </div>
            </section>

            <section className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Review</p>
              <p className="mt-2 text-sm leading-7 text-[var(--muted-ink)]">
                Dispute the pattern or state the condition that would make it false.
              </p>
              <textarea
                value={disputeText}
                onChange={(event) => setDisputeText(event.target.value)}
                placeholder="What is wrong with this pattern description?"
                rows={4}
                className="mt-4 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm leading-6 text-[var(--ink)] outline-none transition focus:border-black/20"
              />
              <textarea
                value={falsificationCondition}
                onChange={(event) => setFalsificationCondition(event.target.value)}
                placeholder="This pattern would be wrong if..."
                rows={3}
                className="mt-3 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm leading-6 text-[var(--ink)] outline-none transition focus:border-black/20"
              />
              <div className="mt-3 flex flex-wrap gap-3">
                <Button onClick={() => handleSaveReview(false)} disabled={isPending}>
                  {isPending ? "Saving..." : "Save review"}
                </Button>
                <Button variant="secondary" onClick={() => handleSaveReview(true)} disabled={isPending}>
                  I acknowledge this
                </Button>
                {saveMessage ? <p className="text-sm text-[var(--muted-ink)]">{saveMessage}</p> : null}
              </div>
            </section>

            <section className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">User review state</p>
              <div className="mt-4 space-y-2 text-sm leading-6 text-[var(--ink)]">
                <p>Acknowledged: {selectedPattern.userAcknowledged ? "yes" : "no"}</p>
                <p>Dispute: {selectedPattern.userDisputeText?.trim() ? selectedPattern.userDisputeText : "none recorded"}</p>
                <p>Falsification: {selectedPattern.userFalsificationCondition?.trim() ? selectedPattern.userFalsificationCondition : "none recorded"}</p>
              </div>
            </section>
          </div>
        </div>
      </Card>
    </div>
  );
}
