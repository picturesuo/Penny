import Link from "next/link";
import { ArrowRight, BookOpenText, BrainCircuit, GraduationCap, ShieldAlert, Target, Waypoints } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const steps = [
  {
    icon: Target,
    title: "Start in Brain",
    copy: "Drop the half-formed claim, decision, or hunch into a spatial second brain that keeps accumulating over time.",
  },
  {
    icon: ShieldAlert,
    title: "Turn on Challenge",
    copy: "Pressure-test the idea against evidence, precedent, dependencies, and the strongest version of the counterargument.",
  },
  {
    icon: Waypoints,
    title: "Invoke Learn",
    copy: "When something is unclear, teach through the exact claim you are working on and leave with the concept attached.",
  },
];

const useCases = [
  {
    icon: BookOpenText,
    eyebrow: "01",
    title: "Brain is the product",
    copy:
      "A spatial, accumulating knowledge graph for the user’s thinking over time, not a passive note pile or chatbot sidebar.",
    focus: "Current focus",
    bullets: [
      "Capture claims, moves, shapes, and confidence in one living graph.",
      "Keep the map structurally healthy, not just visually interesting.",
      "Let the user revisit old selves, genealogy, and contradictions as part of the product.",
    ],
  },
  {
    icon: BrainCircuit,
    eyebrow: "02",
    title: "Challenge is the dialectic",
    copy:
      "Focus a region of Brain and turn on the stress-test machinery so Penny can push on the claim until the structure is honest.",
    focus: "Next",
    bullets: [
      "Run explicit critique rounds with defend, revise, or absorb responses.",
      "Surface quiet keystones, quiet fragility, and the strongest available precedent.",
      "Show why each critique exists so the system stays auditable.",
    ],
  },
  {
    icon: GraduationCap,
    eyebrow: "03",
    title: "Learn is just-in-time",
    copy:
      "When the user hits confusion, Penny explains the concept in the context of the claim they are already working on.",
    focus: "Later",
    bullets: [
      "Teach back from the live claim instead of from a generic reading list.",
      "Anchor new understanding to the user’s existing graph.",
      "Track mastery, relearning, and gaps so future critiques pitch at the right level.",
    ],
  },
];

const tracker = [
  {
    lane: "Now",
    title: "Brain",
    items: [
      "Keep the graph as the accumulating substrate for claims, moves, shapes, and confidence.",
      "Treat the Map as the visual payoff and the Stream as the daily work surface.",
      "Make Brain feel like a place the user returns to, not a set of disposable notes.",
    ],
  },
  {
    lane: "Next",
    title: "Challenge",
    items: [
      "Keep dialectic rounds, critique strength, provenance, and the why-this-critique panel visible.",
      "Use Bayesian propagation so a confidence change actually moves the rest of the graph.",
      "Surface the quiet keystone and the load-bearing assumptions before synthesis.",
    ],
  },
  {
    lane: "Later",
    title: "Learn",
    items: [
      "Make teach-back the default learning motion at the exact point of confusion.",
      "Anchor every explanation to an existing claim in the graph.",
      "Let the user leave with understanding, not a reading list.",
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
            <p className="mt-1 text-sm text-[var(--muted-ink)]">Not another chatbot. Brain, Challenge, and Learn for personal thinking.</p>
          </div>
          <Link href="/app">
            <Button variant="secondary">Open dashboard</Button>
          </Link>
        </header>

        <section className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[1fr_0.92fr]">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.28em] text-[var(--muted-ink)]">
              Brain, Challenge, Learn
            </p>
            <h1 className="mt-6 max-w-4xl font-display text-6xl leading-[0.95] text-[var(--ink)] sm:text-7xl">
              Build a pressure-tested second brain that challenges your thinking and teaches you what you do not know.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--muted-ink)]">
              Penny starts with raw thought, turns it into a spatial graph of claims and moves, pressure-tests weak logic, and teaches you in the moment you hit confusion.
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
                “This thought is not done because it exists. Show the claim, the dependency, the counterargument, and what would prove you wrong.”
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
                Brain is the product, Challenge is the dialectic, and Learn is the just-in-time understanding layer. The tracker keeps the direction explicit.
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
