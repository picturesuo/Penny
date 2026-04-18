import { ThoughtMapForm } from "@/components/penny/thought-map-form";
import { Card } from "@/components/ui/card";
import { getDemoThoughtUserId } from "@/lib/thought-map";

export default function NewSessionPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <Card className="p-8 sm:p-10">
        <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">New thought map</p>
        <h1 className="mt-3 text-4xl font-semibold text-[var(--ink)]">Start with one rough claim from your personal idea wiki.</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--muted-ink)]">
          Think of this like the first note in a pressure-tested LLM-style wiki: capture the claim, its confidence, where it came from, what is at risk, and what would make it resolve.
        </p>
        <ThoughtMapForm userId={getDemoThoughtUserId()} />
      </Card>
    </div>
  );
}
