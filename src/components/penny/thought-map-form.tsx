"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpenText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CLAIM_PROVENANCES,
  CLAIM_STATUSES,
  CLAIM_STAKES,
  type ClaimProvenance,
  type ClaimStake,
  type ClaimStatus,
  type CreateThoughtMapInput,
} from "@/types/thought-map";

const STARTER_IDEAS = [
  "Compliance teams at mid-sized fintechs need a faster way to turn regulatory changes into concrete action plans without hiring more analysts.",
  "Busy professionals need a simple accountability system that makes them follow through on workouts after the first two weeks.",
  "Local HVAC contractors need quoting and follow-up handled automatically so leads do not die between the first call and booked work.",
] as const;

const CAPTURE_STARTERS = [
  {
    label: "Claim",
    template: "Claim: [What do you currently believe is true?]\nWhy it matters: [Why this matters if the claim holds.]",
  },
  {
    label: "Assumption",
    template: "Assumption: [What must be true for this idea or plan to work?]\nDependency: [What is this assumption relying on?]",
  },
  {
    label: "Evidence",
    template: "Evidence: [What real signal supports this?]\nLimit: [What is still missing or weak about the evidence?]",
  },
  {
    label: "Counterargument",
    template: "Counterargument: [What is the strongest reason this could fail or be wrong?]\nWhat would change my mind: [What proof would settle it?]",
  },
  {
    label: "Open question",
    template: "Open question: [What do you need to learn next?]\nWhy this blocks progress: [What decision or action depends on the answer?]",
  },
] as const;

const STAKE_LABELS: Record<ClaimStake, string> = {
  reputation: "Reputation",
  money: "Money",
  time: "Time",
  relationship: "Relationship",
  self_image: "Self-image",
};

function prettyLabel(value: string) {
  return value.replaceAll("_", " ");
}

export function ThoughtMapForm() {
  const router = useRouter();
  const [rawThought, setRawThought] = useState("");
  const [claim, setClaim] = useState<{
    confidence: number;
    resolutionDate: string;
    provenance: ClaimProvenance;
    provenanceDetail: string;
    stakes: ClaimStake[];
    dependencyNotes: string;
    status: ClaimStatus;
  }>({
    confidence: 60,
    resolutionDate: "",
    provenance: "intuition",
    provenanceDetail: "",
    stakes: [],
    dependencyNotes: "",
    status: "open",
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleStake(stake: ClaimStake) {
    setClaim((current) => ({
      ...current,
      stakes: current.stakes.includes(stake)
        ? current.stakes.filter((existing) => existing !== stake)
        : [...current.stakes, stake],
    }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const payload: CreateThoughtMapInput = {
        rawThought,
        claim: {
          confidence: claim.confidence,
          resolutionDate: claim.resolutionDate || null,
          provenance: claim.provenance,
          provenanceDetail: claim.provenanceDetail.trim(),
          stakes: claim.stakes,
          dependencyNotes: claim.dependencyNotes.trim(),
          status: claim.status,
        },
      };

      const response = await fetch("/api/maps", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const payload = (await response.json()) as {
          details?: { fieldErrors?: Record<string, string[]> };
        };
        const message =
          payload.details?.fieldErrors?.rawThought?.[0] ??
          payload.details?.fieldErrors?.claim?.[0] ??
          "Penny needs one real thought to start the map.";
        setError(message);
        return;
      }

      const responsePayload = (await response.json()) as { map: { id: string } };
      router.push(`/app/maps/${responsePayload.map.id}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-6">
      <div className="space-y-2">
        <label htmlFor="rawThought" className="text-sm font-medium text-[var(--ink)]">
          What should Penny map first?
        </label>
        <p className="text-sm leading-6 text-[var(--muted-ink)]">
          Start with one wiki-style claim. The capture form below records confidence, provenance, stakes, dependencies, and claim status so Penny can score and revisit it later.
        </p>
        <div className="rounded-[24px] border border-black/8 bg-white p-4">
          <div className="flex items-center gap-2">
            <BookOpenText className="size-4 text-[var(--muted-ink)]" />
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Idea wiki starters</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {CAPTURE_STARTERS.map((starter) => (
              <button
                key={starter.label}
                type="button"
                className="rounded-full border border-black/10 bg-[var(--panel)] px-3 py-2 text-left text-sm leading-6 text-[var(--muted-ink)] transition hover:border-black/20 hover:text-[var(--ink)]"
                onClick={() => {
                  setRawThought(starter.template);
                  setError(null);
                }}
              >
                {starter.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {STARTER_IDEAS.map((idea, index) => (
            <button
              key={idea}
              type="button"
              className="rounded-full border border-black/10 bg-white px-3 py-2 text-left text-sm leading-6 text-[var(--muted-ink)] transition hover:border-black/20 hover:text-[var(--ink)]"
              onClick={() => {
                setRawThought(idea);
                setError(null);
              }}
            >
              Try idea {index + 1}
            </button>
          ))}
        </div>

        <div className="rounded-[28px] border border-black/10 bg-white p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Claim metadata</p>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <label className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[var(--ink)]">Probability</span>
                <span className="text-sm text-[var(--muted-ink)]">{claim.confidence}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={claim.confidence}
                onChange={(event) =>
                  setClaim((current) => ({ ...current, confidence: Number(event.target.value) }))
                }
                className="w-full accent-[var(--ink)]"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-[var(--ink)]">Resolution date</span>
              <input
                type="date"
                value={claim.resolutionDate}
                onChange={(event) =>
                  setClaim((current) => ({ ...current, resolutionDate: event.target.value }))
                }
                className="w-full rounded-[18px] border border-black/10 bg-[var(--panel)] px-4 py-3 text-sm text-[var(--ink)] outline-none focus:border-black/20"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-[var(--ink)]">Provenance</span>
              <select
                value={claim.provenance}
                onChange={(event) =>
                  setClaim((current) => ({
                    ...current,
                    provenance: event.target.value as ClaimProvenance,
                  }))
                }
                className="w-full rounded-[18px] border border-black/10 bg-[var(--panel)] px-4 py-3 text-sm text-[var(--ink)] outline-none focus:border-black/20"
              >
                {CLAIM_PROVENANCES.map((option) => (
                  <option key={option} value={option}>
                    {prettyLabel(option)}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium text-[var(--ink)]">Claim status</span>
              <select
                value={claim.status}
                onChange={(event) =>
                  setClaim((current) => ({
                    ...current,
                    status: event.target.value as ClaimStatus,
                  }))
                }
                className="w-full rounded-[18px] border border-black/10 bg-[var(--panel)] px-4 py-3 text-sm text-[var(--ink)] outline-none focus:border-black/20"
              >
                {CLAIM_STATUSES.map((option) => (
                  <option key={option} value={option}>
                    {prettyLabel(option)}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 lg:col-span-2">
              <span className="text-sm font-medium text-[var(--ink)]">Provenance detail</span>
              <input
                type="text"
                value={claim.provenanceDetail}
                onChange={(event) =>
                  setClaim((current) => ({ ...current, provenanceDetail: event.target.value }))
                }
                placeholder="Intuition, cited source, inherited from a person, or derived from another claim"
                className="w-full rounded-[18px] border border-black/10 bg-[var(--panel)] px-4 py-3 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted-ink)] focus:border-black/20"
              />
            </label>

            <div className="space-y-2 lg:col-span-2">
              <span className="text-sm font-medium text-[var(--ink)]">Stakes tags</span>
              <div className="flex flex-wrap gap-2">
                {CLAIM_STAKES.map((stake) => {
                  const active = claim.stakes.includes(stake);

                  return (
                    <button
                      key={stake}
                      type="button"
                      className={[
                        "rounded-full border px-3 py-2 text-sm transition",
                        active
                          ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]"
                          : "border-black/10 bg-[var(--panel)] text-[var(--muted-ink)] hover:border-black/20 hover:text-[var(--ink)]",
                      ].join(" ")}
                      onClick={() => toggleStake(stake)}
                    >
                      {STAKE_LABELS[stake]}
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="space-y-2 lg:col-span-2">
              <span className="text-sm font-medium text-[var(--ink)]">Dependency notes</span>
              <textarea
                rows={3}
                value={claim.dependencyNotes}
                onChange={(event) =>
                  setClaim((current) => ({ ...current, dependencyNotes: event.target.value }))
                }
                placeholder="What other claims must be true for this one to hold?"
                className="w-full rounded-[18px] border border-black/10 bg-[var(--panel)] px-4 py-3 text-sm leading-6 text-[var(--ink)] outline-none placeholder:text-[var(--muted-ink)] focus:border-black/20"
              />
            </label>
          </div>
        </div>

        <textarea
          id="rawThought"
          name="rawThought"
          rows={7}
          value={rawThought}
          onChange={(event) => setRawThought(event.target.value)}
          placeholder="Example: Founders will keep using a personal idea wiki only if it pressure-tests their notes instead of just storing them."
          className="w-full rounded-[28px] border border-black/10 bg-[var(--panel)] px-5 py-5 text-base leading-7 text-[var(--ink)] outline-none placeholder:text-[var(--muted-ink)] focus:border-black/20"
        />
      </div>

      {error ? <p className="text-sm text-[#8b3d33]">{error}</p> : null}

      <Button type="submit" className="gap-2 px-6 py-3 text-base" disabled={isPending || rawThought.trim().length < 12}>
        {isPending ? "Starting map..." : "Start idea-wiki map"}
        <ArrowRight className="size-4" />
      </Button>
    </form>
  );
}
