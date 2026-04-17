import type { ReactNode } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import {
  regenerateChallengeAction,
  resolveAssumptionAction,
  submitAnswerAction,
  submitReflectionAction,
} from "@/app/actions";
import { ConceptBriefCard } from "@/components/penny/concept-brief-card";
import { StageChip } from "@/components/penny/stage-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { SessionState } from "@/types/penny";

export function SessionWorkspace({ session }: { session: SessionState }) {
  const isCaptureMode = session.currentStage === "intake" || session.currentStage === "clarify" || session.currentStage === "assumptions";
  const isReflectionMode = !isCaptureMode;
  const isDeepWork = session.currentStage === "pressure-test" || session.currentStage === "evidence";
  const shouldStopSoon =
    session.currentStage === "brief" ||
    session.questionBudget - session.questionsAsked.length <= 1 ||
    (session.clarityScore >= 78 && session.answers.length >= 3);
  const showReflectionRitual = shouldStopSoon || session.currentStage === "brief";
  const processingPrompt =
    session.currentStage === "brief"
      ? "Check your reasoning against the critiques. Where did you lean on instinct vs. evidence?"
      : isCaptureMode
        ? "What's your gut say? Don't overthink it."
        : "Walk through this slowly. What's the weakest link?";
  const analysisFatigue =
    isReflectionMode &&
    (session.logicOnlyMode || shouldStopSoon || (session.answers.length >= 4 && session.questionsAsked.length >= 3));
  const modeTitle = isCaptureMode ? "Capture" : "Reflection";
  const modeDescription = isCaptureMode
    ? "Dump raw thought here. Start with instinct, keep it loose, and let structure harden later."
    : session.currentStage === "brief"
      ? "Now the tunnel is asking for metacognition: compare instinct with evidence, then check whether Penny’s critiques are actually changing your view."
      : "Work over what was captured. New capture is intentionally paused so critique can stay focused and cognitive load stays honest.";

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
        <div className="border-b border-black/8 bg-[var(--panel)] px-6 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={isCaptureMode ? "bg-[#d9ead8] text-[#355b32]" : "bg-[#e7defa] text-[#5c4c88]"}>
              {modeTitle} mode
            </Badge>
            {isDeepWork ? (
              <Badge className="bg-[#fff6ed] text-[#8b4d1f]">Cognitive protection on</Badge>
            ) : null}
            {analysisFatigue ? <Badge className="bg-[#fff6ed] text-[#8b4d1f]">System 2 may be overloaded</Badge> : null}
            {shouldStopSoon ? <Badge className="bg-white text-[var(--ink)]">Honest ending likely</Badge> : null}
          </div>
          <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{modeDescription}</p>
          <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">{processingPrompt}</p>
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
          {isCaptureMode ? (
            <form action={submitAnswerAction.bind(null, session.id)} className="space-y-4">
              <textarea
                name="answer"
                rows={4}
                placeholder={processingPrompt}
                className="w-full rounded-[24px] border border-black/10 bg-[var(--panel)] px-5 py-4 text-sm text-[var(--ink)] outline-none ring-0 placeholder:text-[var(--muted-ink)] focus:border-black/20"
              />
              <Button type="submit">Save capture</Button>
            </form>
          ) : (
            <div className="rounded-[24px] border border-dashed border-black/10 bg-[var(--panel)] px-5 py-4">
              <p className="text-sm font-medium text-[var(--ink)]">Capture is paused in reflection mode.</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                Keep working the current artifact. New input can wait until the next capture session.
              </p>
            </div>
          )}
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
                {isCaptureMode ? "Capture surface" : "Reflection surface"}
              </p>
              <h3 className="mt-1 text-xl font-semibold text-[var(--ink)]">
                {isCaptureMode ? "Raw input stays fluid and unpressured" : "Now Penny can critique the captured structure"}
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

            {isCaptureMode ? (
              <>
                <ListSection title="Assumptions" items={session.assumptions} />
                <ListSection title="Risks" items={session.risks} tone="warning" />
                <p className="rounded-[22px] bg-[var(--panel)] px-4 py-3 text-[var(--muted-ink)]">
                  Critique surfaces stay muted while the capture is still being formed.
                </p>
              </>
            ) : (
              <>
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
                  empty={session.logicOnlyMode ? "Evidence retrieval is offline." : "No pushback surfaced yet."}
                  tone="warning"
                />
                <EvidenceSection
                  title="Draft next steps"
                  items={session.marketPatterns}
                  empty="Validation steps will tighten as the session progresses."
                />
              </>
            )}
          </div>
        </Card>

        {isReflectionMode && session.logicOnlyMode ? (
          <Card className="border-[#e0b8a8] bg-[#fff5ef] p-5">
            <div className="flex gap-3 text-sm text-[#6f2c25]">
              <AlertTriangle className="mt-0.5 size-4" />
              <p>Evidence retrieval failed. Penny is continuing in logic-only mode rather than stalling.</p>
            </div>
          </Card>
        ) : null}

        {isReflectionMode ? (
          <Card className="p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Processing mode</p>
            <h3 className="mt-1 text-xl font-semibold text-[var(--ink)]">
              {session.currentStage === "brief"
                ? "Metacognitive synthesis"
                : isDeepWork
                  ? "Analytical stress-test"
                  : "Reflection without capture"}
            </h3>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{processingPrompt}</p>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
              {analysisFatigue
                ? "The reflective system looks taxed. If you’re only accepting critiques because they sound right, stop and come back fresh."
                : "Penny keeps the prompt context-sensitive instead of pretending there is a clean System 1 / System 2 split."}
            </p>
          </Card>
        ) : null}

        {shouldStopSoon ? (
          <Card className="border-[#e0b8a8] bg-[#fff5ef] p-5">
            <div className="flex gap-3 text-sm text-[#6f2c25]">
              <AlertTriangle className="mt-0.5 size-4" />
              <p>
                You&apos;ve done real work here. This is a good place to stop; come back fresh for the last few claims.
              </p>
            </div>
          </Card>
        ) : null}

        {showReflectionRitual ? (
          <Card className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Session-end reflection ritual</p>
                <h3 className="mt-1 text-xl font-semibold text-[var(--ink)]">Close the loop in 60 seconds.</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                  Check your reasoning against the critiques. Where did you lean on instinct vs. evidence? Penny keeps this as a reflection artifact instead of letting it disappear.
                </p>
              </div>
              <Badge className="bg-[#e7defa] text-[#5c4c88]">shape data</Badge>
            </div>

            <form action={submitReflectionAction.bind(null, session.id)} className="mt-4 space-y-4">
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]" htmlFor="surprised">
                  What surprised you today?
                </label>
                <textarea
                  id="surprised"
                  name="surprised"
                  rows={2}
                  placeholder="Name the thing that changed your mind or attention."
                  className="w-full rounded-[20px] border border-black/10 bg-[var(--panel)] px-4 py-3 text-sm text-[var(--ink)] outline-none ring-0 placeholder:text-[var(--muted-ink)] focus:border-black/20"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]" htmlFor="resisted">
                  What did you resist?
                </label>
                <textarea
                  id="resisted"
                  name="resisted"
                  rows={2}
                  placeholder="Name the critique, shift, or conclusion you kept pushing away."
                  className="w-full rounded-[20px] border border-black/10 bg-[var(--panel)] px-4 py-3 text-sm text-[var(--ink)] outline-none ring-0 placeholder:text-[var(--muted-ink)] focus:border-black/20"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]" htmlFor="returnTo">
                  What do you want to come back to?
                </label>
                <textarea
                  id="returnTo"
                  name="returnTo"
                  rows={2}
                  placeholder="Name the claim or decision you want to reopen next time."
                  className="w-full rounded-[20px] border border-black/10 bg-[var(--panel)] px-4 py-3 text-sm text-[var(--ink)] outline-none ring-0 placeholder:text-[var(--muted-ink)] focus:border-black/20"
                />
              </div>
              <Button type="submit" variant="secondary" className="gap-2">
                Save reflection
              </Button>
            </form>
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
