import { ArrowUpRight, BrainCircuit, GraduationCap, ShieldAlert } from "lucide-react";
import { PennyLogo } from "@/components/penny/penny-logo";

const lanes = [
  {
    title: "Brain",
    description: "Capture and organize the ideas you want to keep alive.",
    icon: BrainCircuit,
    accent: "var(--brain)",
    badge: "Think structurally",
  },
  {
    title: "Challenge",
    description: "Pressure-test one claim until the structure becomes honest.",
    icon: ShieldAlert,
    accent: "var(--challenge)",
    badge: "Stress-test a claim",
  },
  {
    title: "Learn",
    description: "Teach through the exact concept blocking your current work.",
    icon: GraduationCap,
    accent: "var(--learn)",
    badge: "Close a knowledge gap",
  },
] as const;

export default function LandingPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--paper)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(185,106,69,0.10),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(95,143,120,0.08),transparent_30%)]" />

      <div className="relative mx-auto flex min-h-screen max-w-[1280px] flex-col px-6 py-8 lg:px-10">
        <header className="flex items-center justify-start">
          <PennyLogo markClassName="size-11 rounded-[14px]" labelClassName="text-xl font-medium tracking-[-0.01em]" />
        </header>

        <section className="flex flex-1 flex-col justify-center py-16">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-[11px] uppercase tracking-[0.28em] text-[var(--muted-ink)]">Static landing mock</p>
            <h1 className="mt-6 font-display text-5xl leading-[0.94] text-[var(--ink)] sm:text-6xl lg:text-7xl">
              What do you want to do today?
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-[var(--muted-ink)] sm:text-lg">
              Choose one lane and start there. Brain stores the work, Challenge pressure-tests it, and Learn closes the gap
              that is blocking you right now.
            </p>
          </div>

          <div className="mt-14 grid gap-6 lg:grid-cols-3">
            {lanes.map((lane) => {
              const Icon = lane.icon;

              return (
                <article
                  key={lane.title}
                  className="flex min-h-[340px] flex-col rounded-[var(--radius-xl)] border border-[var(--line)] bg-[var(--panel)] p-7 shadow-[var(--shadow-soft)]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div
                      className="flex size-14 items-center justify-center rounded-full border border-[var(--line)] bg-white/70"
                      style={{ color: lane.accent }}
                    >
                      <Icon className="size-6" />
                    </div>
                    <span
                      className="rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em]"
                      style={{
                        borderColor: "color-mix(in srgb, var(--line) 72%, transparent)",
                        color: lane.accent,
                        backgroundColor: "rgba(255,255,255,0.68)",
                      }}
                    >
                      {lane.badge}
                    </span>
                  </div>

                  <div className="mt-10">
                    <h2 className="font-display text-[2rem] leading-none text-[var(--ink)]">{lane.title}</h2>
                    <p className="mt-4 max-w-[18rem] text-sm leading-7 text-[var(--muted-ink)]">{lane.description}</p>
                  </div>

                  <div className="mt-auto pt-10">
                    <button
                      type="button"
                      aria-label={`Open ${lane.title}`}
                      className="flex size-14 items-center justify-center rounded-full border border-[var(--line)] bg-white text-[var(--ink)] transition hover:-translate-y-0.5"
                    >
                      <ArrowUpRight className="size-5" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
