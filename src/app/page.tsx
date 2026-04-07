import Link from "next/link";
import { ArrowRight, ShieldAlert, Target, Waypoints } from "lucide-react";
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

export default function LandingPage() {
  return (
    <main className="relative overflow-hidden">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-8 lg:px-10">
        <header className="flex items-center justify-between py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Penny</p>
            <p className="mt-1 text-sm text-[var(--muted-ink)]">Not another chatbot. A pressure test for startup ideas.</p>
          </div>
          <Link href="/app">
            <Button variant="secondary">Open dashboard</Button>
          </Link>
        </header>

        <section className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[1fr_0.92fr]">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.28em] text-[var(--muted-ink)]">
              Structured pressure, then structured help
            </p>
            <h1 className="mt-6 max-w-4xl font-display text-6xl leading-[0.95] text-[var(--ink)] sm:text-7xl">
              Bring a messy idea. Leave with a validation path.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--muted-ink)]">
              Penny challenges weak assumptions before you waste time building. The output is not hype. It is a sharper founder brief, a clearer wedge, and the next three tests worth running.
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <Link href="/app/new">
                <Button className="gap-2 px-6 py-3 text-base">
                  Pressure-test this idea
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
                “You’re still describing a category, not a wedge. This idea depends on users changing behavior. Why would they?”
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
      </div>
    </main>
  );
}
