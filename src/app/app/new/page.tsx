import { ThoughtMapForm } from "@/components/penny/thought-map-form";
import { Card } from "@/components/ui/card";

export default function NewSessionPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <Card className="p-8 sm:p-10">
        <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">New thought map</p>
        <h1 className="mt-3 text-4xl font-semibold text-[var(--ink)]">Bring the rough thought.</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--muted-ink)]">
          Penny works best when you start with the unfinished version, then click through the weak branches until the map gets sharper.
        </p>
        <ThoughtMapForm />
      </Card>
    </div>
  );
}
