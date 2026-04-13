import { Card } from "@/components/ui/card";
import { CopyBriefButton } from "@/components/penny/copy-brief-button";
import { formatFounderBrief } from "@/lib/founder-brief";
import type { FounderBriefModel } from "@/types/thought-map";

export function FounderBriefCard({ brief }: { brief: FounderBriefModel }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-black/8 bg-[var(--panel)] px-6 py-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Founder Brief</p>
          <h3 className="mt-1 text-xl font-semibold text-[var(--ink)]">Map-derived summary worth revisiting</h3>
        </div>
        <CopyBriefButton value={formatFounderBrief(brief)} />
      </div>

      <div className="grid gap-6 px-6 py-6 text-sm leading-7 text-[var(--ink)] lg:grid-cols-2">
        <Section title="Idea summary" content={brief.ideaSummary} />
        <Section title="Target user" content={brief.targetUser} />
        <Section title="Core claim" content={brief.coreClaim} />
        <ListSection title="Key assumptions" items={brief.keyAssumptions} />
        <ListSection title="Strongest counterarguments" items={brief.strongestCounterarguments} />
        <OrderedSection title="Next 3 validation steps" items={brief.nextValidationSteps} />
      </div>
    </Card>
  );
}

function Section({ title, content }: { title: string; content: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">{title}</p>
      <p className="mt-2">{content}</p>
    </div>
  );
}

function ListSection({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">{title}</p>
      <div className="mt-2 space-y-2">
        {items.map((item) => (
          <p key={item} className="rounded-[20px] bg-[var(--panel)] px-4 py-3">
            {item}
          </p>
        ))}
      </div>
    </div>
  );
}

function OrderedSection({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">{title}</p>
      <div className="mt-2 space-y-2">
        {items.map((item, index) => (
          <p key={item} className="rounded-[20px] bg-[var(--panel)] px-4 py-3">
            <span className="font-medium">{index + 1}.</span> {item}
          </p>
        ))}
      </div>
    </div>
  );
}
