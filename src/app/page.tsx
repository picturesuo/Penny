import { ArrowUpRight, BrainCircuit, GraduationCap, ShieldAlert } from "lucide-react";
import { PennyLogo } from "@/components/penny/penny-logo";

const lanes = [
  {
    title: "Brain",
    description: "Capture and organize what you think.",
    icon: BrainCircuit,
    accent: "var(--brain)",
  },
  {
    title: "Challenge",
    description: "Put an idea under pressure.",
    icon: ShieldAlert,
    accent: "var(--challenge)",
  },
  {
    title: "Learn",
    description: "Understand what is blocking you.",
    icon: GraduationCap,
    accent: "var(--learn)",
  },
] as const;

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[linear-gradient(180deg,#faf7f3_0%,#f7f3ee_100%)]">
      <div className="mx-auto flex min-h-screen max-w-[1280px] flex-col px-6 py-6 lg:px-10">
        <header className="flex items-center justify-start border-b border-[var(--line)] pb-4">
          <PennyLogo markClassName="size-9 rounded-[12px]" labelClassName="text-lg font-medium tracking-[-0.01em]" />
        </header>

        <section className="flex flex-1 flex-col justify-center py-12 lg:py-16">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="font-display text-[2.8rem] leading-[1.05] text-[var(--ink)] sm:text-6xl">
              What do you want to do today?
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-base leading-8 text-[var(--muted-ink)] sm:text-lg">
              Three ways to think better.
            </p>
          </div>

          <div className="mx-auto mt-14 grid w-full max-w-[980px] gap-6 md:grid-cols-3">
            {lanes.map((lane) => {
              const Icon = lane.icon;

              return (
                <article
                  key={lane.title}
                  className="flex min-h-[306px] flex-col items-center rounded-[22px] border bg-[rgba(255,255,255,0.76)] px-7 pb-7 pt-8 text-center shadow-[0_8px_24px_rgba(45,36,31,0.03)]"
                  style={{ borderColor: `color-mix(in srgb, ${lane.accent} 24%, var(--line))` }}
                >
                  <div
                    className="flex size-14 items-center justify-center rounded-full border border-[var(--line)] bg-white/80"
                    style={{ color: lane.accent }}
                  >
                    <Icon className="size-6" strokeWidth={1.8} />
                  </div>

                  <div className="mt-8">
                    <h2 className="font-display text-[2rem] leading-none text-[var(--ink)]">{lane.title}</h2>
                    <p className="mx-auto mt-4 max-w-[11rem] text-sm leading-7 text-[var(--muted-ink)]">{lane.description}</p>
                  </div>

                  <div className="mt-auto pt-10">
                    <button
                      type="button"
                      aria-label={`Open ${lane.title}`}
                      className="flex size-11 items-center justify-center rounded-full text-white transition hover:-translate-y-0.5"
                      style={{ backgroundColor: lane.accent }}
                    >
                      <ArrowUpRight className="size-4.5" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          <p className="mt-12 text-center text-sm text-[var(--muted-ink)]">Clarity isn&apos;t given. It&apos;s built.</p>
        </section>
      </div>
    </main>
  );
}
