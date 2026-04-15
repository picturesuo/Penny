"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpenText } from "lucide-react";
import { Button } from "@/components/ui/button";

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

export function ThoughtMapForm() {
  const router = useRouter();
  const [rawThought, setRawThought] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const response = await fetch("/api/maps", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ rawThought }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as {
          details?: { fieldErrors?: Record<string, string[]> };
        };
        const message =
          payload.details?.fieldErrors?.rawThought?.[0] ??
          "Penny needs one real thought to start the map.";
        setError(message);
        return;
      }

      const payload = (await response.json()) as { map: { id: string } };
      router.push(`/app/maps/${payload.map.id}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-6">
      <div className="space-y-2">
        <label htmlFor="rawThought" className="text-sm font-medium text-[var(--ink)]">
          What should Penny map first?
        </label>
        <p className="text-sm leading-6 text-[var(--muted-ink)]">
          Start with one wiki-style entry: a claim, assumption, evidence fragment, counterargument, or open question.
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
        <textarea
          id="rawThought"
          name="rawThought"
          rows={8}
          value={rawThought}
          onChange={(event) => setRawThought(event.target.value)}
          placeholder="Example: Assumption: Founders will keep using a personal idea wiki only if it pressure-tests their notes instead of just storing them. Dependency: The critique has to stay actionable, not abstract."
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
