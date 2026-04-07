import type { ReactNode } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { regenerateChallengeAction, resolveAssumptionAction, submitAnswerAction } from "@/app/actions";
import { ConceptBriefCard } from "@/components/penny/concept-brief-card";
import { StageChip } from "@/components/penny/stage-chip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { SessionState } from "@/types/penny";

export function SessionWorkspace({ session }: { session: SessionState }) {
  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <Card className="flex min-h-[720px] flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-black/8 px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
              Conversation
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-[var(--ink)]">{session.title}</h2>
          </div>
          <StageChip stage={session.currentStage} />
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
          {session.conversation.map((message) => (
            <div
              key={message.id}
              className={cn(
                "max-w-[88%] rounded-[24px] px-5 py-4 text-sm leading-7",
                message.role === "assistant" &&
                  "bg-[var(--panel)] text-[var(--ink)] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]",
                message.role === "user" &&
                  "ml-auto bg-[var(--ink)] text-[var(--paper)]",
                message.role === "system" &&
                  "border border-dashed border-black/10 bg-white text-[var(--muted-ink)]",
              )}
            >
              {message.content}
            </div>
          ))}
        </div>
        <div className="border-t border-black/8 bg-white px-6 py-5">
          <form action={submitAnswerAction.bind(null, session.id)} className="space-y-4">
            <textarea
              name="answer"
              rows={4}
              placeholder="Answer directly. Specific beats impressive."
              className="w-full rounded-[24px] border border-black/10 bg-[var(--panel)] px-5 py-4 text-sm text-[var(--ink)] outline-none ring-0 placeholder:text-[var(--muted-ink)] focus:border-black/20"
            />
            <Button type="submit">Submit answer</Button>
          </form>
          <form action={regenerateChallengeAction.bind(null, session.id)} className="mt-3">
            <Button variant="secondary" className="gap-2">
              <RefreshCcw className="size-4" />
              Regenerate challenge
            </Button>
          </form>
        </div>
      </Card>

      <div className="space-y-6">
        <Card className="p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
                Live structure
              </p>
              <h3 className="mt-1 text-xl font-semibold text-[var(--ink)]">
                Thinking on the right, pressure on the left
              </h3>
            </div>
            <div className="rounded-full bg-[var(--panel)] px-3 py-2 text-sm text-[var(--muted-ink)]">
              Clarity {session.clarityScore}
            </div>
          </div>

          <div className="mt-6 space-y-5 text-sm leading-7">
            <Section title="Idea summary" content={session.ideaSummary || session.rawIdea} />
            <Section title="Target user" content={session.targetUser || "Still blurry"} />
            <Section title="Core problem" content={session.problem || "Still fuzzy"} />
            <Section title="Proposed solution" content={session.solution || "Still generic"} />

            <ListSection
              title="Assumptions"
              items={session.assumptions}
              renderAction={(item) =>
                session.resolvedAssumptions.includes(item) ? (
                  <span className="text-xs uppercase tracking-[0.16em] text-[#37624d]">Resolved</span>
                ) : (
                  <form action={resolveAssumptionAction.bind(null, session.id, item)}>
                    <button className="text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">
                      Mark resolved
                    </button>
                  </form>
                )
              }
            />
            <ListSection title="Risks" items={session.risks} tone="warning" />
            <EvidenceSection
              title="Evidence for"
              items={session.evidenceFor}
              empty="No support surfaced yet."
            />
            <EvidenceSection
              title="Evidence against"
              items={session.evidenceAgainst}
              empty={session.logicOnlyMode ? "Logic-only mode is active." : "No pushback surfaced yet."}
              tone="warning"
            />
            <EvidenceSection
              title="Draft next steps"
              items={session.marketPatterns}
              empty="Validation steps will tighten as the session progresses."
            />
          </div>
        </Card>

        {session.logicOnlyMode ? (
          <Card className="border-[#e0b8a8] bg-[#fff5ef] p-5">
            <div className="flex gap-3 text-sm text-[#6f2c25]">
              <AlertTriangle className="mt-0.5 size-4" />
              <p>Evidence retrieval failed. Penny is continuing in logic-only mode rather than stalling.</p>
            </div>
          </Card>
        ) : null}

        {session.conceptBrief ? <ConceptBriefCard brief={session.conceptBrief} /> : null}
      </div>
    </div>
  );
}

function Section({ title, content }: { title: string; content: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">{title}</p>
      <p className="mt-1 text-[var(--ink)]">{content}</p>
    </div>
  );
}

function ListSection({
  title,
  items,
  tone,
  renderAction,
}: {
  title: string;
  items: string[];
  tone?: "warning";
  renderAction?: (item: string) => ReactNode;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">{title}</p>
      <div className="mt-2 space-y-2">
        {items.length ? (
          items.map((item) => (
            <div
              key={item}
              className={cn(
                "flex items-start justify-between gap-4 rounded-[22px] px-4 py-3",
                tone === "warning" ? "bg-[#fff3ef]" : "bg-[var(--panel)]",
              )}
            >
              <p>{item}</p>
              {renderAction ? renderAction(item) : null}
            </div>
          ))
        ) : (
          <p className="rounded-[22px] bg-[var(--panel)] px-4 py-3 text-[var(--muted-ink)]">
            Nothing extracted yet.
          </p>
        )}
      </div>
    </div>
  );
}

function EvidenceSection({
  title,
  items,
  empty,
  tone,
}: {
  title: string;
  items: { point: string; whyItMatters?: string }[];
  empty: string;
  tone?: "warning";
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">{title}</p>
      <div className="mt-2 space-y-2">
        {items.length ? (
          items.map((item) => (
            <div
              key={item.point}
              className={cn(
                "rounded-[22px] px-4 py-3",
                tone === "warning" ? "bg-[#fff3ef]" : "bg-[var(--panel)]",
              )}
            >
              <p>{item.point}</p>
              {item.whyItMatters ? (
                <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[var(--muted-ink)]">
                  {item.whyItMatters}
                </p>
              ) : null}
            </div>
          ))
        ) : (
          <p className="rounded-[22px] bg-[var(--panel)] px-4 py-3 text-[var(--muted-ink)]">{empty}</p>
        )}
      </div>
    </div>
  );
}
