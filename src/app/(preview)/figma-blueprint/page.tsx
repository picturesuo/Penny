import type { Metadata } from "next";
import {
  ArrowUpRight,
  BookOpenText,
  BrainCircuit,
  ChevronRight,
  GraduationCap,
  LayoutGrid,
  Search,
  ShieldAlert,
  Sparkles,
  UserRound,
} from "lucide-react";
import { PennyLogo } from "@/components/penny/penny-logo";

export const metadata: Metadata = {
  title: "Penny Figma Blueprint Preview",
  description: "An isolated visual mock for the Penny frame blueprint.",
};

const modeCards = [
  {
    title: "Brain",
    description: "Capture and organize the ideas you want to keep alive before they flatten into notes.",
    badge: "Think structurally",
    accent: "var(--brain)",
    icon: BrainCircuit,
  },
  {
    title: "Challenge",
    description: "Pressure-test one claim until the honest weakness, not the flattering version, becomes visible.",
    badge: "Stress-test a claim",
    accent: "var(--challenge)",
    icon: ShieldAlert,
  },
  {
    title: "Learn",
    description: "Close the concept gap that is blocking the current argument instead of leaving the work to go study.",
    badge: "Teach in context",
    accent: "var(--learn)",
    icon: GraduationCap,
  },
] as const;

const sphereLabels = ["Work", "Writing", "Life", "Learning"] as const;

const claimCards = [
  {
    title: "Enterprise buyers will accept an opinionated onboarding path.",
    description: "The working claim is that strict guidance increases setup quality enough to outweigh the loss of flexibility.",
    confidence: "76%",
    lastChallenged: "2 days ago",
    dependencies: "4 linked claims",
  },
  {
    title: "The founder brief should be produced only after one full critique loop.",
    description: "This avoids synthesis landing on rhetoric before the model has absorbed a real counterargument.",
    confidence: "64%",
    lastChallenged: "Today",
    dependencies: "2 linked claims",
  },
  {
    title: "Learning moments should stay inside the active claim workflow.",
    description: "The system should teach only what unlocks the work in front of the user instead of opening a detached lesson lane.",
    confidence: "71%",
    lastChallenged: "Yesterday",
    dependencies: "3 linked claims",
  },
] as const;

const relatedConcepts = [
  "Bayesian confidence updates",
  "Evidence quality weighting",
  "Dependency cascades",
  "Precedent retrieval",
] as const;

export default function FigmaBlueprintPage() {
  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[var(--paper)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(182,106,60,0.18),transparent_26%),radial-gradient(circle_at_78%_18%,rgba(214,161,69,0.16),transparent_22%),radial-gradient(circle_at_bottom_right,rgba(79,138,123,0.14),transparent_30%)]" />

      <div className="relative mx-auto max-w-[1560px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="penny-card-soft penny-reveal overflow-hidden">
          <div className="border-b border-black/8 px-5 py-4 sm:px-7">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="penny-label">Preview-only route</p>
                <h1 className="font-display mt-3 text-4xl leading-[0.92] text-[var(--ink)] sm:text-5xl">
                  Penny Figma Blueprint
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--muted-ink)] sm:text-base">
                  An isolated mock built from your frame spec. It lives off the main product path and stacks the four
                  key screens in one place so you can judge hierarchy, tone, and contrast quickly.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
                <PreviewChip label="Home" />
                <PreviewChip label="Brain" />
                <PreviewChip label="Challenge" />
                <PreviewChip label="Learn" />
              </div>
            </div>
          </div>

          <div className="space-y-8 px-3 py-4 sm:px-4 sm:py-5 lg:px-5 lg:py-6">
            <FrameShell frameLabel="Screen / Home" accent="var(--brain)">
              <section className="relative overflow-hidden rounded-[28px] border border-black/8 bg-[linear-gradient(140deg,#fcf7f2_0%,#f5ede3_52%,#efe3d6_100%)] px-6 py-8 shadow-[0_18px_44px_rgba(45,36,31,0.08)] sm:px-10 sm:py-12 lg:min-h-[820px] lg:px-14 lg:py-14">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.54),transparent_34%),linear-gradient(180deg,transparent_0%,rgba(255,255,255,0.26)_100%)]" />
                <div className="relative flex min-h-[720px] flex-col">
                  <header className="flex items-center justify-between gap-4">
                    <PennyLogo markClassName="size-11 rounded-[14px]" labelClassName="text-xl font-medium tracking-[-0.01em]" />
                    <div className="rounded-full border border-black/8 bg-white/75 px-4 py-2 text-[11px] uppercase tracking-[0.24em] text-[var(--muted-ink)]">
                      Figma frame study
                    </div>
                  </header>

                  <div className="mx-auto flex flex-1 max-w-5xl flex-col items-center justify-center py-14 text-center sm:py-18 lg:py-24">
                    <p className="penny-label">One brain, multiple modes</p>
                    <h2 className="font-display mt-6 max-w-4xl text-5xl leading-[0.9] tracking-[-0.04em] text-[var(--ink)] sm:text-6xl lg:text-8xl">
                      What do you want to do today?
                    </h2>
                    <p className="mt-6 max-w-2xl text-base leading-8 text-[var(--muted-ink)] sm:text-lg">
                      Home is simple on purpose. Choose the lane that matches the actual job: structure the work, pressure
                      test a claim, or learn the concept blocking the argument.
                    </p>

                    <div className="mt-12 grid w-full gap-5 lg:grid-cols-3">
                      {modeCards.map((card) => (
                        <ModeCard key={card.title} {...card} />
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            </FrameShell>

            <FrameShell frameLabel="Screen / Brain" accent="var(--brain)">
              <section className="rounded-[28px] border border-black/8 bg-[linear-gradient(180deg,#fcfaf7_0%,#f5ede4_100%)] shadow-[0_18px_44px_rgba(45,36,31,0.08)]">
                <TopBar label="Brain" accent="var(--brain)" />
                <div className="grid gap-5 p-4 lg:min-h-[760px] lg:grid-cols-[220px_minmax(0,1fr)_320px]">
                  <LeftRail activeMode="Brain" />

                  <section className="penny-card-soft flex flex-col p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/8 pb-4">
                      <div>
                        <p className="penny-label">Section / Stream</p>
                        <h3 className="mt-2 text-2xl font-semibold text-[var(--ink)]">Brain stream</h3>
                      </div>
                      <button className="penny-press rounded-full bg-[var(--brain)] px-4 py-3 text-sm font-medium text-white shadow-[0_14px_30px_rgba(182,106,60,0.24)]">
                        + New Thought
                      </button>
                    </div>

                    <div className="mt-5 space-y-4">
                      {claimCards.map((claim) => (
                        <ClaimCard key={claim.title} {...claim} />
                      ))}
                    </div>
                  </section>

                  <aside className="penny-card-soft flex flex-col gap-4 p-5">
                    <div>
                      <p className="penny-label">Panel / Inspector</p>
                      <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">
                        Enterprise buyers will accept an opinionated onboarding path.
                      </h3>
                    </div>

                    <div className="rounded-[22px] border border-black/8 bg-white/80 p-4">
                      <p className="penny-label">Confidence block</p>
                      <div className="mt-3 flex items-end justify-between">
                        <span className="font-display text-5xl leading-none text-[var(--ink)]">76%</span>
                        <span className="rounded-full bg-[#ebf4f1] px-3 py-1 text-xs font-medium text-[var(--learn)]">
                          Stable
                        </span>
                      </div>
                      <div className="mt-4 h-3 rounded-full bg-[#eadfd2]">
                        <div className="h-full w-[76%] rounded-full bg-[linear-gradient(90deg,var(--challenge),var(--learn))]" />
                      </div>
                    </div>

                    <div className="rounded-[22px] border border-black/8 bg-[linear-gradient(180deg,#fffdfa_0%,#f6efe6_100%)] p-4">
                      <p className="penny-label">Mini graph</p>
                      <div className="relative mt-4 h-40 overflow-hidden rounded-[18px] border border-black/8 bg-[radial-gradient(circle_at_top,#ffffff,transparent_52%),linear-gradient(180deg,#fbf5ed_0%,#f1e6d7_100%)]">
                        <GraphNode className="left-[16%] top-[56%]" size="lg" />
                        <GraphNode className="left-[46%] top-[22%]" size="md" />
                        <GraphNode className="left-[70%] top-[58%]" size="sm" />
                        <GraphNode className="left-[36%] top-[66%]" size="sm" />
                        <GraphEdge className="left-[25%] top-[56%] w-[28%] rotate-[-21deg]" />
                        <GraphEdge className="left-[48%] top-[38%] w-[22%] rotate-[33deg]" />
                        <GraphEdge className="left-[31%] top-[61%] w-[19%] rotate-[8deg]" />
                      </div>
                    </div>

                    <div className="rounded-[22px] border border-black/8 bg-white/80 p-4">
                      <p className="penny-label">Dependents</p>
                      <ul className="mt-3 space-y-3 text-sm leading-6 text-[var(--ink)]">
                        <li className="flex items-start justify-between gap-3">
                          <span>Setup quality drives time-to-value.</span>
                          <span className="text-[var(--muted-ink)]">2</span>
                        </li>
                        <li className="flex items-start justify-between gap-3">
                          <span>Opinionated flows need stronger defaults.</span>
                          <span className="text-[var(--muted-ink)]">1</span>
                        </li>
                      </ul>
                    </div>

                    <div className="rounded-[22px] border border-[#d7c8ba] bg-[linear-gradient(180deg,#fbf4ea_0%,#f1e1cc_100%)] p-4">
                      <p className="penny-label">Insight box</p>
                      <p className="mt-3 text-sm leading-7 text-[var(--ink)]">
                        The strongest exposed risk is not adoption in general. It is whether forced structure helps power
                        users enough to justify first-run friction.
                      </p>
                    </div>
                  </aside>
                </div>
              </section>
            </FrameShell>

            <FrameShell frameLabel="Screen / Challenge" accent="var(--challenge)">
              <section className="rounded-[28px] border border-black/8 bg-[linear-gradient(180deg,#fffaf0_0%,#f6ecd8_100%)] shadow-[0_18px_44px_rgba(45,36,31,0.08)]">
                <TopBar label="Challenge" accent="var(--challenge)" />
                <div className="grid gap-5 p-4 lg:min-h-[760px] lg:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="flex flex-col gap-5">
                    <div className="grid gap-5 xl:grid-cols-2">
                      <ChallengeCard
                        eyebrow="Your claim"
                        title="Opinionated onboarding will increase setup quality enough to improve retention."
                        body="The claim assumes early guidance raises activation and that the users who dislike rigid onboarding are not the ones driving expansion."
                        tone="soft"
                      />
                      <ChallengeCard
                        eyebrow="Counterargument"
                        title="The rigid path may hide weak product comprehension and make teams blame the workflow instead of the product."
                        body="If customers need heavy onboarding ceremony, the real issue may be that the product model still lacks self-evidence. Better choreography can fake clarity."
                        tone="amber"
                      />
                    </div>

                    <div className="rounded-[28px] border border-[#d8cbb9] bg-[linear-gradient(180deg,#fdf8f0_0%,#f3e6d4_100%)] p-5 shadow-[0_16px_38px_rgba(45,36,31,0.06)]">
                      <p className="penny-label">Weakness card</p>
                      <h3 className="mt-3 text-2xl font-semibold text-[var(--ink)]">The hidden weakness is interpretability.</h3>
                      <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--muted-ink)]">
                        If a user cannot explain why the system wants a specific sequence, your retention gain is probably temporary compliance rather than durable product understanding.
                      </p>
                    </div>

                    <div className="mt-auto rounded-[28px] border border-black/8 bg-white/82 p-4 shadow-[0_14px_34px_rgba(45,36,31,0.05)]">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <p className="penny-label">How do you want to respond?</p>
                          <p className="mt-2 text-sm leading-7 text-[var(--muted-ink)]">
                            Challenge should feel intense and explicit. The next move is part of the design.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-3">
                          <ResponseButton label="Defend" tone="neutral" />
                          <ResponseButton label="Revise" tone="primary" />
                          <ResponseButton label="Absorb" tone="soft" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <aside className="flex flex-col gap-4">
                    <SidePanel
                      title="Critique transparency"
                      description="Penny shows why this challenge appeared: it is testing whether the user is compensating for product ambiguity with process design."
                      accent="var(--challenge)"
                    />
                    <SidePanel
                      title="Dependency cascade"
                      description="If this claim weakens, it also pressures activation assumptions, setup friction tolerance, and the shape of the founder brief."
                      accent="var(--brain)"
                    />
                  </aside>
                </div>
              </section>
            </FrameShell>

            <FrameShell frameLabel="Screen / Learn" accent="var(--learn)">
              <section className="rounded-[28px] border border-black/8 bg-[linear-gradient(180deg,#f7fbf8_0%,#e8f0ea_100%)] shadow-[0_18px_44px_rgba(45,36,31,0.08)]">
                <TopBar label="Learn" accent="var(--learn)" />
                <div className="grid gap-5 p-4 lg:min-h-[760px] lg:grid-cols-[minmax(0,1fr)_320px]">
                  <section className="penny-card-soft flex flex-col gap-5 p-6">
                    <div>
                      <p className="penny-label">Concept title</p>
                      <h3 className="font-display mt-3 text-4xl leading-[0.94] text-[var(--ink)] sm:text-5xl">
                        Bayesian confidence updates
                      </h3>
                    </div>

                    <div className="rounded-[24px] border border-black/8 bg-white/82 p-5">
                      <p className="penny-label">Explanation</p>
                      <p className="mt-3 max-w-3xl text-sm leading-8 text-[var(--ink)] sm:text-base">
                        In Penny, learning should stay claim-anchored. A Bayesian update is not abstract math here; it is
                        the decision rule for how much one new challenge, precedent, or evidence item should move the user&apos;s confidence.
                      </p>
                    </div>

                    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
                      <div className="rounded-[24px] border border-black/8 bg-[linear-gradient(180deg,#fefdfb_0%,#f4f8f5_100%)] p-5">
                        <p className="penny-label">Teach back</p>
                        <div className="mt-3 min-h-[220px] rounded-[20px] border border-dashed border-black/12 bg-white/70 p-4 text-sm leading-7 text-[var(--muted-ink)]">
                          “A confidence update should depend on how surprising the new evidence is and how reliable the source is. A weak critique should not move a high-confidence claim very far.”
                        </div>
                      </div>

                      <div className="rounded-[24px] border border-[#c8ddd3] bg-[linear-gradient(180deg,#edf7f2_0%,#dcece4_100%)] p-5">
                        <p className="penny-label">Feedback</p>
                        <p className="mt-3 text-sm leading-7 text-[var(--ink)]">
                          Good. The missing piece is calibration: surprise alone is not enough. Penny also needs the prior
                          confidence and the quality weighting of the evidence.
                        </p>
                        <div className="mt-4 rounded-[18px] bg-white/70 px-4 py-3 text-xs uppercase tracking-[0.18em] text-[var(--learn)]">
                          Gap nearly closed
                        </div>
                      </div>
                    </div>
                  </section>

                  <aside className="flex flex-col gap-4">
                    <div className="penny-card-soft p-5">
                      <p className="penny-label">Mini graph</p>
                      <div className="relative mt-4 h-44 overflow-hidden rounded-[20px] border border-black/8 bg-[radial-gradient(circle_at_top,#ffffff,transparent_55%),linear-gradient(180deg,#eff8f3_0%,#deece5_100%)]">
                        <GraphNode className="left-[18%] top-[56%]" size="md" tone="learn" />
                        <GraphNode className="left-[46%] top-[28%]" size="lg" tone="learn" />
                        <GraphNode className="left-[74%] top-[60%]" size="sm" tone="learn" />
                        <GraphEdge className="left-[24%] top-[52%] w-[28%] rotate-[-24deg]" tone="learn" />
                        <GraphEdge className="left-[49%] top-[42%] w-[22%] rotate-[30deg]" tone="learn" />
                      </div>
                    </div>

                    <div className="penny-card-soft p-5">
                      <p className="penny-label">Related concepts</p>
                      <ul className="mt-4 space-y-3">
                        {relatedConcepts.map((concept) => (
                          <li
                            key={concept}
                            className="flex items-center justify-between rounded-[18px] border border-black/8 bg-white/78 px-4 py-3 text-sm text-[var(--ink)]"
                          >
                            <span>{concept}</span>
                            <ChevronRight className="size-4 text-[var(--muted-ink)]" />
                          </li>
                        ))}
                      </ul>
                    </div>
                  </aside>
                </div>
              </section>
            </FrameShell>
          </div>
        </div>
      </div>
    </main>
  );
}

function FrameShell({
  children,
  frameLabel,
  accent,
}: {
  children: React.ReactNode;
  frameLabel: string;
  accent: string;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3 px-2">
        <div className="flex items-center gap-3">
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: accent }} />
          <p className="penny-meta">{frameLabel}</p>
        </div>
        <span className="rounded-full border border-black/8 bg-white/70 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-[var(--muted-ink)]">
          Responsive mock
        </span>
      </div>
      {children}
    </section>
  );
}

function PreviewChip({ label }: { label: string }) {
  return <span className="rounded-full border border-black/8 bg-white/74 px-3 py-2">{label}</span>;
}

function ModeCard({
  title,
  description,
  badge,
  accent,
  icon: Icon,
}: {
  title: string;
  description: string;
  badge: string;
  accent: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <article className="group flex min-h-[320px] flex-col rounded-[30px] border border-black/8 bg-white/84 p-6 shadow-[0_18px_38px_rgba(45,36,31,0.06)] transition duration-200 hover:-translate-y-1">
      <div className="flex items-start justify-between gap-3">
        <div
          className="flex size-14 items-center justify-center rounded-[18px] border border-black/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.95)_0%,rgba(248,241,232,0.92)_100%)]"
          style={{ color: accent }}
        >
          <Icon className="size-6" />
        </div>
        <span
          className="rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em]"
          style={{
            borderColor: "rgba(18,16,14,0.08)",
            color: accent,
            backgroundColor: "rgba(255,255,255,0.76)",
          }}
        >
          {badge}
        </span>
      </div>

      <div className="mt-10">
        <h3 className="font-display text-[2.5rem] leading-none tracking-[-0.03em] text-[var(--ink)]">{title}</h3>
        <p className="mt-4 text-sm leading-7 text-[var(--muted-ink)]">{description}</p>
      </div>

      <div className="mt-auto flex items-center justify-between pt-12">
        <span className="text-sm font-medium text-[var(--ink)]">Enter mode</span>
        <div
          className="flex size-12 items-center justify-center rounded-full text-white shadow-[0_14px_28px_rgba(45,36,31,0.14)]"
          style={{ backgroundColor: accent }}
        >
          <ArrowUpRight className="size-5" />
        </div>
      </div>
    </article>
  );
}

function TopBar({ label, accent }: { label: string; accent: string }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-black/8 px-4 py-4 sm:px-6">
      <div className="flex items-center gap-4">
        <PennyLogo markClassName="size-10 rounded-[14px]" labelClassName="text-lg font-medium tracking-[-0.01em]" />
        <div className="hidden h-6 w-px bg-black/8 sm:block" />
        <div className="flex items-center gap-2 text-sm text-[var(--muted-ink)]">
          <span>Home</span>
          <ChevronRight className="size-4" />
          <span className="font-medium" style={{ color: accent }}>
            {label}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-full border border-black/8 bg-white/78 px-4 py-2 text-sm text-[var(--muted-ink)]">
          <Search className="size-4" />
          Search
        </div>
        <div className="flex size-10 items-center justify-center rounded-full border border-black/8 bg-white/78 text-[var(--ink)]">
          <UserRound className="size-5" />
        </div>
      </div>
    </header>
  );
}

function LeftRail({ activeMode }: { activeMode: string }) {
  return (
    <aside className="penny-card-soft flex flex-col gap-5 p-5">
      <div>
        <p className="penny-label">Modes</p>
        <div className="mt-3 space-y-2">
          {modeCards.map((card) => {
            const active = card.title === activeMode;
            return (
              <div
                key={card.title}
                className="flex items-center justify-between rounded-[18px] border px-4 py-3 text-sm"
                style={{
                  borderColor: active ? "transparent" : "rgba(18,16,14,0.08)",
                  background: active
                    ? `linear-gradient(180deg, color-mix(in srgb, ${card.accent} 16%, white) 0%, color-mix(in srgb, ${card.accent} 9%, white) 100%)`
                    : "rgba(255,255,255,0.72)",
                  color: active ? "var(--ink)" : "var(--muted-ink)",
                }}
              >
                <span>{card.title}</span>
                <span className="text-[11px] uppercase tracking-[0.18em]" style={{ color: active ? card.accent : "inherit" }}>
                  {active ? "Live" : "Mode"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="h-px bg-black/8" />

      <div>
        <p className="penny-label">Spheres</p>
        <div className="mt-3 space-y-2">
          {sphereLabels.map((sphere) => (
            <div key={sphere} className="rounded-[18px] border border-black/8 bg-white/76 px-4 py-3 text-sm text-[var(--ink)]">
              {sphere}
            </div>
          ))}
          <div className="rounded-[18px] border border-dashed border-black/12 bg-white/46 px-4 py-3 text-sm text-[var(--muted-ink)]">
            + New Sphere
          </div>
        </div>
      </div>
    </aside>
  );
}

function ClaimCard({
  title,
  description,
  confidence,
  lastChallenged,
  dependencies,
}: {
  title: string;
  description: string;
  confidence: string;
  lastChallenged: string;
  dependencies: string;
}) {
  return (
    <article className="rounded-[24px] border border-black/8 bg-white/84 p-5 shadow-[0_12px_30px_rgba(45,36,31,0.04)]">
      <h4 className="text-lg font-semibold leading-7 text-[var(--ink)]">{title}</h4>
      <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">{description}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <MetaPill label={`Confidence ${confidence}`} accent="var(--brain)" />
        <MetaPill label={`Last challenged ${lastChallenged}`} accent="var(--challenge)" />
        <MetaPill label={dependencies} accent="var(--learn)" />
      </div>
    </article>
  );
}

function MetaPill({ label, accent }: { label: string; accent: string }) {
  return (
    <span
      className="rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.16em]"
      style={{
        borderColor: "rgba(18,16,14,0.08)",
        backgroundColor: "rgba(255,255,255,0.78)",
        color: accent,
      }}
    >
      {label}
    </span>
  );
}

function ChallengeCard({
  eyebrow,
  title,
  body,
  tone,
}: {
  eyebrow: string;
  title: string;
  body: string;
  tone: "soft" | "amber";
}) {
  const isAmber = tone === "amber";

  return (
    <article
      className="rounded-[28px] border p-5 shadow-[0_16px_36px_rgba(45,36,31,0.06)]"
      style={{
        borderColor: isAmber ? "rgba(214,161,69,0.22)" : "rgba(18,16,14,0.08)",
        background: isAmber
          ? "linear-gradient(180deg,#fff8e9 0%,#f4e7c8 100%)"
          : "linear-gradient(180deg,#fffdf9 0%,#f4ece2 100%)",
      }}
    >
      <p className="penny-label">{eyebrow}</p>
      <h3 className="mt-3 text-2xl font-semibold leading-9 text-[var(--ink)]">{title}</h3>
      <p className="mt-4 text-sm leading-7 text-[var(--muted-ink)]">{body}</p>
    </article>
  );
}

function ResponseButton({ label, tone }: { label: string; tone: "primary" | "neutral" | "soft" }) {
  const styles =
    tone === "primary"
      ? "bg-[var(--challenge)] text-[var(--ink)]"
      : tone === "soft"
        ? "bg-[#e4efe9] text-[var(--learn)]"
        : "bg-white text-[var(--ink)]";

  return (
    <button className={`penny-press rounded-full border border-black/8 px-5 py-3 text-sm font-medium shadow-[0_12px_24px_rgba(45,36,31,0.05)] ${styles}`}>
      {label}
    </button>
  );
}

function SidePanel({
  title,
  description,
  accent,
}: {
  title: string;
  description: string;
  accent: string;
}) {
  return (
    <div className="penny-card-soft p-5">
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-[16px] bg-white/80" style={{ color: accent }}>
          {title === "Critique transparency" ? <Sparkles className="size-5" /> : <LayoutGrid className="size-5" />}
        </div>
        <div>
          <p className="penny-label">Right panel</p>
          <h3 className="mt-1 text-lg font-semibold text-[var(--ink)]">{title}</h3>
        </div>
      </div>
      <p className="mt-4 text-sm leading-7 text-[var(--muted-ink)]">{description}</p>
    </div>
  );
}

function GraphNode({
  className,
  size,
  tone = "default",
}: {
  className: string;
  size: "lg" | "md" | "sm";
  tone?: "default" | "learn";
}) {
  const dimensions = size === "lg" ? "h-14 w-14" : size === "md" ? "h-11 w-11" : "h-9 w-9";
  const background =
    tone === "learn"
      ? "bg-[linear-gradient(180deg,#f4fbf7_0%,#dceddf_100%)]"
      : "bg-[linear-gradient(180deg,#fffdfa_0%,#f2e6d4_100%)]";

  return (
    <div
      className={`absolute flex ${dimensions} -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-black/8 ${background} shadow-[0_8px_18px_rgba(45,36,31,0.08)] ${className}`}
    >
      {tone === "learn" ? <BookOpenText className="size-4 text-[var(--learn)]" /> : <BrainCircuit className="size-4 text-[var(--brain)]" />}
    </div>
  );
}

function GraphEdge({ className, tone = "default" }: { className: string; tone?: "default" | "learn" }) {
  return (
    <div
      className={`absolute h-px origin-left ${className}`}
      style={{
        background:
          tone === "learn"
            ? "linear-gradient(90deg, rgba(95,143,120,0.18) 0%, rgba(95,143,120,0.7) 50%, rgba(95,143,120,0.18) 100%)"
            : "linear-gradient(90deg, rgba(185,106,69,0.18) 0%, rgba(185,106,69,0.7) 50%, rgba(185,106,69,0.18) 100%)",
      }}
    />
  );
}
