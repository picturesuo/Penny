import Link from "next/link";
import { ArrowRight, BookOpenText, BrainCircuit, GraduationCap, ShieldAlert, Target, Waypoints } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const steps = [
  {
    icon: Target,
    title: "Bring your messy idea",
    copy: "Drop the vague concept, half-formed market, or dangerous hunch on the table.",
  },
  {
    icon: ShieldAlert,
    title: "Penny pressure-tests it",
    copy: "The system attacks weak assumptions, calls out fuzzy logic, and pulls in lightweight context.",
  },
  {
    icon: Waypoints,
    title: "Leave with a validation path",
    copy: "Get a Founder Concept Brief with concrete next steps you can run this week.",
  },
];

const useCases = [
  {
    icon: BookOpenText,
    eyebrow: "01",
    title: "Pressure-tested second brain",
    copy:
      "Build a personal idea wiki inspired by Karpathy’s LLM wiki, but designed to challenge your thinking instead of just storing notes.",
    focus: "Current focus",
    bullets: [
      "Capture claims, assumptions, evidence, counterarguments, and open questions in one place.",
      "Make each note pressure-testable instead of letting it sit as passive documentation.",
      "Turn the wiki into a living map that keeps track of what still needs to be proved.",
    ],
  },
  {
    icon: BrainCircuit,
    eyebrow: "02",
    title: "Stress-test the reasoning",
    copy:
      "Push directly on weak branches, shaky logic, missing evidence, and unchallenged beliefs so the map becomes more honest over time.",
    focus: "Next",
    bullets: [
      "Surface counterarguments, weak dependencies, and unsupported leaps.",
      "Run structured pressure from multiple angles instead of one-shot critique.",
      "Keep the map decision-oriented, not just visually interesting.",
    ],
  },
  {
    icon: GraduationCap,
    eyebrow: "03",
    title: "Learn the best next step",
    copy:
      "Use the map to decide what to learn next, what to validate next, and which gap matters most right now.",
    focus: "Later",
    bullets: [
      "Recommend the next concept, question, or test worth learning.",
      "Tie learning back to a weak branch or decision bottleneck.",
      "Keep progress concrete with a small next move instead of broad advice.",
    ],
  },
];

const tracker = [
  {
    lane: "Now",
    title: "Pressure-tested second brain",
    items: [
      "Define the personal idea wiki structure: claim, assumption, evidence, counterargument, research, and open question.",
      "Make wiki entries first-class objects that can be pressure-tested instead of plain notes.",
      "Show how one idea turns into a living map with actionable unresolved gaps.",
    ],
  },
  {
    lane: "Next",
    title: "Stress testing",
    items: [
      "Add multi-angle pressure paths for contradiction, evidence weakness, dependency risk, and missing comparison.",
      "Sequence stress tests so Penny can push deeper instead of repeating surface critique.",
      "Track which weak branches have already been challenged and what changed.",
    ],
  },
  {
    lane: "Later",
    title: "Learning engine",
    items: [
      "Recommend the best thing to learn based on the current weakest branch.",
      "Connect learning suggestions to concrete map gaps and validation tasks.",
      "Turn the learning loop into a repeatable next-step system instead of a static reading list.",
    ],
  },
];

export default function LandingPage() {
  return (
    <main className="relative overflow-hidden">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-8 lg:px-10">
        <header className="flex items-center justify-between py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Penny</p>
            <p className="mt-1 text-sm text-[var(--muted-ink)]">Not another chatbot. A pressure-tested second brain for personal ideas.</p>
          </div>
          <Link href="/app">
            <Button variant="secondary">Open dashboard</Button>
          </Link>
        </header>

        <section className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[1fr_0.92fr]">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.28em] text-[var(--muted-ink)]">
              A second brain that pushes back
            </p>
            <h1 className="mt-6 max-w-4xl font-display text-6xl leading-[0.95] text-[var(--ink)] sm:text-7xl">
              Build a pressure-tested second brain for personal ideas, not a passive note pile.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--muted-ink)]">
              Penny starts with messy notes and ideas, turns them into structured reasoning, stress-tests the weak logic, and keeps pointing you to the best next thing to learn or validate.
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <Link href="/app/new">
                <Button className="gap-2 px-6 py-3 text-base">
                  Start your first map
                  <ArrowRight className="size-4" />
                </Button>
              </Link>
              <Link href="/app">
                <Button variant="secondary" className="px-6 py-3 text-base">
                  View sessions
                </Button>
              </Link>
            </div>
          </div>

          <Card className="p-6 sm:p-8">
            <div className="rounded-[24px] bg-[var(--ink)] p-5 text-[var(--paper)]">
              <p className="text-xs uppercase tracking-[0.22em] text-white/60">Penny says</p>
              <p className="mt-3 text-lg leading-8">
                “This note is not done because it exists. Show the claim, the dependency, the counterargument, and what would prove you wrong.”
              </p>
            </div>
            <div className="mt-6 grid gap-4">
              {steps.map((step) => (
                <div key={step.title} className="rounded-[24px] bg-[var(--panel)] p-5">
                  <step.icon className="size-5 text-[var(--ink)]" />
                  <h2 className="mt-3 text-xl font-semibold text-[var(--ink)]">{step.title}</h2>
                  <p className="mt-2 text-sm leading-7 text-[var(--muted-ink)]">{step.copy}</p>
                </div>
              ))}
            </div>
          </Card>
        </section>

        <section className="py-6">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Three use cases</p>
            <h2 className="mt-3 text-3xl font-semibold text-[var(--ink)] sm:text-4xl">
              One product, three jobs.
            </h2>
          </div>
          <div className="mt-8 grid gap-5 lg:grid-cols-3">
            {useCases.map((useCase) => (
              <Card key={useCase.title} className="p-6">
                <div className="flex items-center justify-between gap-3">
                  <useCase.icon className="size-5 text-[var(--ink)]" />
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">{useCase.focus}</p>
                </div>
                <p className="mt-4 text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">{useCase.eyebrow}</p>
                <h3 className="mt-2 text-2xl font-semibold text-[var(--ink)]">{useCase.title}</h3>
                <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">{useCase.copy}</p>
                <div className="mt-5 space-y-3">
                  {useCase.bullets.map((bullet) => (
                    <p key={bullet} className="rounded-[20px] bg-[var(--panel)] px-4 py-3 text-sm leading-6 text-[var(--ink)]">
                      {bullet}
                    </p>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </section>

        <section className="py-10">
          <Card className="p-6 sm:p-8">
            <div className="max-w-3xl">
              <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Build tracker</p>
              <h2 className="mt-3 text-3xl font-semibold text-[var(--ink)] sm:text-4xl">
                What Penny is working toward.
              </h2>
              <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">
                The first priority is the pressure-tested second brain. Stress testing and the learning engine stay in the tracker so the product direction remains explicit.
              </p>
            </div>
            <div className="mt-8 grid gap-4 lg:grid-cols-3">
              {tracker.map((column) => (
                <div key={column.lane} className="rounded-[28px] border border-black/8 bg-[var(--panel)] p-5">
                  <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">{column.lane}</p>
                  <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">{column.title}</h3>
                  <div className="mt-4 space-y-3">
                    {column.items.map((item) => (
                      <p key={item} className="rounded-[18px] bg-white px-4 py-3 text-sm leading-6 text-[var(--ink)]">
                        {item}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </section>
      </div>
    </main>
  );
}
