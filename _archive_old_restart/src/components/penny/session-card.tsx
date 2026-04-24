import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StageChip } from "@/components/penny/stage-chip";
import { formatDate } from "@/lib/utils";
import type { SessionCardModel } from "@/types/penny";

export function SessionCard({ session }: { session: SessionCardModel }) {
  return (
    <Link href={`/app/session/${session.id}`}>
      <Card className="h-full p-6 transition hover:-translate-y-0.5 hover:shadow-[0_24px_90px_rgba(15,23,42,0.12)]">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3">
            <StageChip stage={session.currentStage} />
            <div>
              <h3 className="text-xl font-semibold text-[var(--ink)]">{session.title}</h3>
              <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted-ink)]">
                {session.problem || session.rawIdea}
              </p>
            </div>
          </div>
          <ArrowRight className="mt-1 size-5 text-[var(--muted-ink)]" />
        </div>
        <div className="mt-6 flex items-center justify-between text-sm text-[var(--muted-ink)]">
          <span>{formatDate(session.updatedAt)}</span>
          <span>Clarity {session.clarityScore}</span>
        </div>
      </Card>
    </Link>
  );
}
