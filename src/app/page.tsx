import Link from "next/link";
import { ArrowUpRight, BrainCircuit, GraduationCap, ShieldAlert } from "lucide-react";
import { PennyLogo } from "@/components/penny/penny-logo";
import { getCurrentUser } from "@/lib/auth";
import { buildChallengeView, buildShellView } from "@/server/workspace-projections";

export default async function LandingPage() {
  const user = await getCurrentUser();
  const shellView = user?.id ? await buildShellView({ userId: user.id }) : null;
  const challengeView =
    user?.id && shellView?.selection.mapId
      ? await buildChallengeView({
          userId: user.id,
          mapId: shellView.selection.mapId,
        })
      : null;
  const lanes = buildLandingLanes({
    claimId: shellView?.selection.claimId ?? null,
    mapId: shellView?.selection.mapId ?? null,
    roundId: challengeView?.currentRound?.id ?? null,
  });

  return (
    <main className="min-h-screen overflow-hidden bg-[linear-gradient(180deg,#faf7f3_0%,#f7f3ee_100%)]">
      <div className="mx-auto flex min-h-screen max-w-[1220px] flex-col px-6 py-6 lg:px-10">
        <header className="flex items-center justify-start pb-2">
          <PennyLogo markClassName="size-9 rounded-[12px]" labelClassName="text-lg font-medium tracking-[-0.01em]" />
        </header>

        <section className="flex flex-1 flex-col justify-center py-16 lg:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--muted-ink)]">Choose a mode</p>
            <h1 className="mt-5 font-display text-[3rem] leading-[1.02] text-[var(--ink)] sm:text-[4.5rem]">
              What do you want to do today?
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base leading-8 text-[var(--muted-ink)] sm:text-lg">
              Three ways to move the same body of thought forward.
            </p>
          </div>

          <div className="mx-auto mt-20 grid w-full max-w-[960px] gap-6 md:grid-cols-3">
            {lanes.map((lane) => {
              const Icon = lane.icon;

              return (
                <Link
                  key={lane.title}
                  href={lane.href}
                  aria-label={`Open ${lane.title}`}
                  className="group flex min-h-[300px] flex-col items-center rounded-[24px] border bg-[rgba(255,255,255,0.7)] px-8 pb-8 pt-9 text-center penny-press"
                  style={{ borderColor: `color-mix(in srgb, ${lane.accent} 24%, var(--line))` }}
                >
                  <div className="flex size-14 items-center justify-center rounded-full border border-[var(--line)] bg-white/88" style={{ color: lane.accent }}>
                    <Icon className="size-6" strokeWidth={1.8} />
                  </div>

                  <div className="mt-9">
                    <h2 className="font-display text-[2rem] leading-none text-[var(--ink)]">{lane.title}</h2>
                    <p className="mx-auto mt-4 max-w-[11rem] text-sm leading-7 text-[var(--muted-ink)]">{lane.description}</p>
                  </div>

                  <div className="mt-auto pt-12">
                    <span
                      className="flex size-11 items-center justify-center rounded-full text-white transition group-hover:-translate-y-0.5"
                      style={{ backgroundColor: lane.accent }}
                    >
                      <ArrowUpRight className="size-4.5" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>

          <p className="mt-16 text-center text-sm text-[var(--muted-ink)]">Mode selection, not a marketing page.</p>
        </section>
      </div>
    </main>
  );
}

function buildLandingLanes(selection: {
  claimId: string | null;
  mapId: string | null;
  roundId: string | null;
}) {
  return [
    {
      title: "Brain",
      description: "Capture and organize what you think.",
      icon: BrainCircuit,
      accent: "var(--brain)",
      href: buildWorkspaceLauncherHref("brain", selection),
    },
    {
      title: "Challenge",
      description: "Put an idea under pressure.",
      icon: ShieldAlert,
      accent: "var(--challenge)",
      href: buildWorkspaceLauncherHref("challenge", selection),
    },
    {
      title: "Learn",
      description: "Understand what is blocking you.",
      icon: GraduationCap,
      accent: "var(--learn)",
      href: buildWorkspaceLauncherHref("learn", selection),
    },
  ] as const;
}

function buildWorkspaceLauncherHref(
  mode: "brain" | "challenge" | "learn",
  selection: {
    claimId: string | null;
    mapId: string | null;
    roundId: string | null;
  },
) {
  if (!selection.mapId) {
    if (mode === "brain") {
      return "/app";
    }

    if (mode === "challenge") {
      return "/app/new?prefill=What%20claim%20should%20Penny%20challenge%3F";
    }

    return "/app/lessons";
  }

  const params = new URLSearchParams();

  if (selection.claimId) {
    params.set("claimId", selection.claimId);
  }

  if (selection.roundId) {
    params.set("roundId", selection.roundId);
  }

  if (mode !== "brain") {
    params.set("launcher", mode);
  }

  const query = params.toString();
  return query ? `/maps/${selection.mapId}?${query}` : `/maps/${selection.mapId}`;
}
