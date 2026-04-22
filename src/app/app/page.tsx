import { OrnamentalGraph } from "@/components/penny/ornamental-graph";
import { Card } from "@/components/ui/card";

const recentThoughts = [
  {
    title: "Users care more about access and convenience than model quality.",
    meta: "65% confidence • 2 days ago",
  },
  {
    title: "Model quality beyond a threshold has diminishing returns.",
    meta: "64% confidence • 4 days ago",
  },
  {
    title: "Distribution can be built or acquired.",
    meta: "83% confidence • 1 week ago",
  },
] as const;

export default function DashboardPage() {
  return (
    <section className="space-y-5">
      <Card className="penny-card p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="penny-label">Stream</p>
            <h1 className="mt-2 text-2xl font-semibold text-[var(--ink)]">Continue where you left off</h1>
          </div>
          <p className="text-sm text-[var(--muted-ink)]">The center stays focused on one active thread and a short recent trail.</p>
        </div>
      </Card>

      <Card className="penny-card-soft p-5">
        <p className="penny-label">Highlighted thread</p>
        <div className="mt-4 flex gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold leading-8 text-[var(--ink)]">
              Distribution advantage matters more than model quality in winning this market.
            </h2>
            <p className="mt-4 text-sm leading-6 text-[var(--muted-ink)]">72% confidence • Last challenged 9 days ago</p>
          </div>
          <div className="hidden rounded-[18px] border border-[var(--line)] bg-white px-4 py-3 md:block">
            <OrnamentalGraph variant="cluster" accent="var(--brain)" className="h-14 w-14" />
          </div>
        </div>
      </Card>

      <section className="space-y-3">
        <div>
          <p className="penny-label">Recent thoughts</p>
        </div>

        {recentThoughts.map((thought) => (
          <Card key={thought.title} className="penny-card p-5 shadow-[var(--shadow-card)]">
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-base font-medium leading-7 text-[var(--ink)]">{thought.title}</p>
                <p className="mt-2 text-sm text-[var(--muted-ink)]">{thought.meta}</p>
              </div>
              <div className="rounded-[18px] border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5">
                <OrnamentalGraph variant="cluster" accent="var(--brain)" className="h-8 w-8" />
              </div>
            </div>
          </Card>
        ))}

        <div className="pt-2 text-sm text-[var(--muted-ink)]">View all thoughts →</div>
      </section>
    </section>
  );
}
