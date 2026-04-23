"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShellSphere, useAppShell } from "@/components/penny/app-shell";
import { OrnamentalGraph } from "@/components/penny/ornamental-graph";
import { Card } from "@/components/ui/card";

type BrainStreamClaim = {
  confidence: number;
  dependents: string[];
  id: string;
  insight: string;
  lastChallenged: string;
  linkedClaimCount: number;
  summary: string;
  title: string;
};

const SPHERES: AppShellSphere[] = [
  { label: "Work", active: true, meta: "4 maps" },
  { label: "Writing", meta: "2 maps" },
  { label: "Life", meta: "1 map" },
  { label: "Learning", meta: "3 maps" },
];

const streamClaims: BrainStreamClaim[] = [
  {
    id: "distribution-advantage",
    title: "Distribution advantage matters more than model quality in winning this market.",
    summary: "This is the current lead claim because multiple downstream decisions depend on whether access beats pure model quality.",
    confidence: 72,
    lastChallenged: "9 days ago",
    linkedClaimCount: 6,
    dependents: ["Go-to-market strategy", "User acquisition channels", "Moat durability"],
    insight: "The claim is structurally central, but its weakest point is still whether convenience remains defensible once quality converges.",
  },
  {
    id: "access-over-quality",
    title: "Users care more about access and convenience than model quality.",
    summary: "This claim holds the behavioral assumption underneath the current market thesis.",
    confidence: 65,
    lastChallenged: "2 days ago",
    linkedClaimCount: 4,
    dependents: ["Onboarding strategy", "Retention model", "Product packaging"],
    insight: "The claim still needs more evidence from power users rather than early adoption anecdotes.",
  },
  {
    id: "quality-threshold",
    title: "Model quality beyond a threshold has diminishing returns.",
    summary: "This is the efficiency claim that makes distribution spend rational instead of premature.",
    confidence: 64,
    lastChallenged: "4 days ago",
    linkedClaimCount: 3,
    dependents: ["Pricing posture", "Inference budget", "Partner channel strategy"],
    insight: "The core uncertainty is where the threshold actually sits for the target workflow, not whether one exists.",
  },
  {
    id: "distribution-built",
    title: "Distribution can be built or acquired faster than a durable model moat.",
    summary: "This is the practical execution claim that turns the thesis into a near-term operating choice.",
    confidence: 83,
    lastChallenged: "1 week ago",
    linkedClaimCount: 5,
    dependents: ["Sales motion", "Partnership strategy", "Market sequencing"],
    insight: "It is strong structurally, but it inherits risk from the assumptions around channel defensibility.",
  },
];

export default function DashboardPage() {
  const { resetShell, setShell } = useAppShell();
  const [selectedClaimId, setSelectedClaimId] = useState(streamClaims[0]?.id ?? null);
  const selectedClaim = useMemo(
    () => streamClaims.find((claim) => claim.id === selectedClaimId) ?? streamClaims[0],
    [selectedClaimId],
  );
  const recentClaims = streamClaims.filter((claim) => claim.id !== selectedClaim.id);

  useEffect(() => {
    setShell({
      breadcrumbs: [
        { label: "Work" },
        { label: "Market Thesis" },
        { label: selectedClaim.title },
      ],
      inspector: <BrainInspector claim={selectedClaim} />,
      spheres: SPHERES,
      topBarLabel: "Brain stream",
    });

    return resetShell;
  }, [resetShell, selectedClaim, setShell]);

  return (
    <section className="space-y-8">
      <div className="max-w-2xl">
        <p className="penny-label">Stream</p>
        <h1 className="mt-3 font-display text-[2.1rem] leading-[1.02] text-[var(--ink)]">Continue where the work already has momentum.</h1>
      </div>

      <button
        type="button"
        onClick={() => setSelectedClaimId(selectedClaim.id)}
        className="block w-full text-left"
        aria-label={`Open ${selectedClaim.title}`}
      >
        <Card className="penny-card-soft rounded-[26px] p-6 transition duration-150 hover:-translate-y-0.5">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0 flex-1">
              <p className="penny-label">Continue where you left off</p>
              <h2 className="mt-4 text-[1.7rem] font-semibold leading-[1.18] text-[var(--ink)]">{selectedClaim.title}</h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--muted-ink)]">{selectedClaim.summary}</p>
              <div className="mt-5 flex flex-wrap gap-2 text-sm text-[var(--muted-ink)]">
                <span>{selectedClaim.confidence}% confidence</span>
                <span>•</span>
                <span>Last challenged {selectedClaim.lastChallenged}</span>
                <span>•</span>
                <span>{selectedClaim.linkedClaimCount} linked claims</span>
              </div>
            </div>
            <div className="rounded-[20px] border border-[var(--line)] bg-white/8 px-4 py-3">
              <OrnamentalGraph variant="cluster" accent="var(--brain)" className="h-16 w-16" />
            </div>
          </div>
        </Card>
      </button>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="penny-label">Recent claims</p>
          <p className="text-sm text-[var(--muted-ink)]">Pick a claim to refresh the inspector.</p>
        </div>

        <div className="space-y-3">
          {recentClaims.map((claim) => (
            <button
              key={claim.id}
              type="button"
              onClick={() => setSelectedClaimId(claim.id)}
              className="block w-full text-left"
              aria-label={`Open ${claim.title}`}
            >
              <Card className="penny-card rounded-[22px] p-5 transition duration-150 hover:-translate-y-0.5">
                <div className="flex items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-medium leading-7 text-[var(--ink)]">{claim.title}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-sm text-[var(--muted-ink)]">
                      <span>{claim.confidence}% confidence</span>
                      <span>•</span>
                      <span>Last challenged {claim.lastChallenged}</span>
                      <span>•</span>
                      <span>{claim.linkedClaimCount} linked claims</span>
                    </div>
                  </div>
                  <div className="rounded-[18px] border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
                    <OrnamentalGraph variant="cluster" accent="var(--brain)" className="h-8 w-8" />
                  </div>
                </div>
              </Card>
            </button>
          ))}
        </div>
      </section>
    </section>
  );
}

function BrainInspector({ claim }: { claim: BrainStreamClaim }) {
  return (
    <>
      <Card className="penny-card rounded-[24px] px-5 py-5 shadow-[var(--shadow-card)]">
        <p className="penny-label">Selected claim</p>
        <h2 className="mt-3 text-lg font-semibold leading-7 text-[var(--ink)]">{claim.title}</h2>

        <div className="mt-6">
          <p className="penny-label">Confidence</p>
          <p className="mt-2 text-[2.15rem] font-semibold leading-none text-[var(--ink)]">{claim.confidence}%</p>
          <p className="mt-2 text-sm text-[var(--muted-ink)]">Last challenged {claim.lastChallenged}</p>
        </div>

        <div className="mt-6">
          <p className="penny-label">Mini graph</p>
          <div className="mt-3 rounded-[18px] border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
            <OrnamentalGraph variant="brain-map" accent="var(--brain)" className="mx-auto h-24 max-w-[15rem]" />
          </div>
        </div>

        <div className="mt-6">
          <p className="penny-label">Dependents</p>
          <div className="mt-3 space-y-2 text-sm leading-6 text-[var(--ink)]">
            {claim.dependents.map((item) => (
              <div key={item} className="rounded-[16px] border border-[var(--line)] bg-white px-3 py-2.5">
                {item}
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card className="penny-card rounded-[22px] px-5 py-5 shadow-[var(--shadow-card)]">
        <p className="penny-label">Insight</p>
        <p className="mt-3 text-sm leading-7 text-[var(--ink)]">{claim.insight}</p>
      </Card>
    </>
  );
}
