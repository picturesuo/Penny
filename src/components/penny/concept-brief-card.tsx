import { Card } from "@/components/ui/card";
import { CopyBriefButton } from "@/components/penny/copy-brief-button";

export function ConceptBriefCard({ brief }: { brief: string }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-black/8 bg-[var(--panel)] px-6 py-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">
            Founder Concept Brief
          </p>
          <h3 className="mt-1 text-xl font-semibold text-[var(--ink)]">
            First-pass memo worth saving
          </h3>
        </div>
        <CopyBriefButton value={brief} />
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap px-6 py-6 font-sans text-sm leading-7 text-[var(--ink)]">
        {brief}
      </pre>
    </Card>
  );
}
