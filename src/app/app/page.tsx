import { ArrowUpRight, Clock3, Network, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

const spheres = [
  {
    title: "Work",
    note: "Active thesis work",
    active: true,
  },
  {
    title: "Writing",
    note: "Arguments in progress",
    active: false,
  },
  {
    title: "People",
    note: "Advisors and distribution",
    active: false,
  },
  {
    title: "Learning",
    note: "Mental models to revisit",
    active: false,
  },
] as const;

const recentThoughts = [
  {
    title: "Referral loops compound faster than paid acquisition at this stage",
    note: "Pressure-test distribution quality against retention, not signup volume.",
    tag: "Distribution",
    updatedAt: "22 minutes ago",
  },
  {
    title: "Team onboarding friction may be hiding the actual network effect",
    note: "Check whether collaboration value appears only after the second shared workspace.",
    tag: "Product",
    updatedAt: "48 minutes ago",
  },
  {
    title: "A narrow initial wedge might make the thesis easier to defend",
    note: "Find whether founder workflow focus makes the claim more legible or less ambitious.",
    tag: "Market",
    updatedAt: "1 hour ago",
  },
  {
    title: "Evidence quality is still too intuitive in the pricing branch",
    note: "Gather stronger comparison points before treating willingness-to-pay as settled.",
    tag: "Evidence",
    updatedAt: "Yesterday",
  },
] as const;

export default function DashboardPage() {
  return (
    <section className="grid gap-6 xl:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="space-y-4">
        <Card className="border-black/8 bg-white/84 p-5 shadow-[var(--shadow-soft)]">
          <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--muted-ink)]">Spheres</p>
          <h1 className="mt-2 font-display text-3xl leading-none text-[var(--ink)]">Brain</h1>
          <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">
            The archive stays organized by sphere so today’s thinking still belongs to a broader landscape.
          </p>
          <div className="mt-5 space-y-2.5">
            {spheres.map((sphere) => (
              <div
                key={sphere.title}
                className={[
                  "rounded-[var(--radius-lg)] border px-4 py-3",
                  sphere.active ? "bg-[color:rgba(185,106,69,0.10)]" : "bg-[var(--panel)]",
                ].join(" ")}
                style={{ borderColor: sphere.active ? "color-mix(in srgb, var(--brain) 32%, var(--line))" : "var(--line)" }}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-[var(--ink)]">{sphere.title}</p>
                  {sphere.active ? <Badge className="bg-white text-[var(--brain)]">Active</Badge> : null}
                </div>
                <p className="mt-1 text-sm leading-6 text-[var(--muted-ink)]">{sphere.note}</p>
              </div>
            ))}
          </div>
        </Card>
      </aside>

      <div className="space-y-6">
        <Card className="border-black/8 bg-white/84 p-6 shadow-[var(--shadow-soft)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--muted-ink)]">Brain stream</p>
              <h2 className="mt-2 font-display text-4xl leading-[0.95] text-[var(--ink)]">Continue where you left off.</h2>
              <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">
                The stream keeps one highlighted thread in front, then lets recent thoughts trail behind it without turning the page into a dashboard dump.
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm text-[var(--muted-ink)]">
              <Clock3 className="size-4" />
              Updated this morning
            </div>
          </div>
        </Card>

        <Card className="border-black/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,242,235,0.96))] p-6 shadow-[var(--shadow-soft)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-[color:rgba(185,106,69,0.12)] text-[var(--brain)]">Highlighted thread</Badge>
                <Badge className="bg-white text-[var(--ink)]">Distribution Claim</Badge>
              </div>
              <h3 className="mt-4 font-display text-[2rem] leading-[1.02] text-[var(--ink)]">
                Strong network effects may only appear once distribution and collaboration become the same loop.
              </h3>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--muted-ink)]">
                The current thread is trying to distinguish superficial virality from a real product loop. The next useful move is to keep the claim narrow enough to challenge.
              </p>
            </div>
            <button
              type="button"
              className="flex size-14 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-white text-[var(--ink)] transition hover:-translate-y-0.5"
              aria-label="Open highlighted thread"
            >
              <ArrowUpRight className="size-5" />
            </button>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <div className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-white/72 p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--muted-ink)]">Sphere</p>
              <p className="mt-2 text-sm font-medium text-[var(--ink)]">Work</p>
            </div>
            <div className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-white/72 p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--muted-ink)]">Current pressure</p>
              <p className="mt-2 text-sm font-medium text-[var(--ink)]">Separate distribution from retention.</p>
            </div>
            <div className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-white/72 p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--muted-ink)]">Why now</p>
              <p className="mt-2 text-sm font-medium text-[var(--ink)]">This thread underpins the current market thesis.</p>
            </div>
          </div>
        </Card>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--muted-ink)]">Recent thoughts</p>
              <h3 className="mt-2 text-2xl font-semibold text-[var(--ink)]">Stream and recent cards</h3>
            </div>
            <Sparkles className="size-5 text-[var(--brain)]" />
          </div>

          <div className="space-y-3">
            {recentThoughts.map((thought) => (
              <Card key={thought.title} className="border-black/8 bg-white/82 p-5 shadow-[var(--shadow-soft)]">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-3xl">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-[var(--panel)] text-[var(--ink)]">{thought.tag}</Badge>
                      <span className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">{thought.updatedAt}</span>
                    </div>
                    <p className="mt-3 text-lg font-medium leading-7 text-[var(--ink)]">{thought.title}</p>
                    <p className="mt-2 text-sm leading-7 text-[var(--muted-ink)]">{thought.note}</p>
                  </div>
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--panel)] text-[var(--ink)]">
                    <Network className="size-4" />
                  </span>
                </div>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
