import { ThoughtMapForm } from "@/components/penny/thought-map-form";
import { Card } from "@/components/ui/card";

export default function NewSessionPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <Card className="p-8 sm:p-10">
        <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">New thought map</p>
        <h1 className="mt-3 text-4xl font-semibold text-[var(--ink)]">Start with one rough entry from your second brain.</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--muted-ink)]">
          Penny works best when you bring the unfinished version: the claim you believe, the assumption you are leaning on, the evidence you half-trust, or the counterargument you cannot shake yet.
        </p>
        <ThoughtMapForm />
      </Card>
    </div>
  );
}
