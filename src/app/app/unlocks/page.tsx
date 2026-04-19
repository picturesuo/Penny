import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeatureUnlockProgress } from "@/components/penny/feature-unlock-progress";
import { buildFeatureUnlockStatuses, buildUnlockSummary } from "@/lib/time-locked-features";
import { getDemoThoughtUserId } from "@/lib/thought-map";
import { listThoughtMaps } from "@/server/thought-map";

export default async function UnlocksPage() {
  const maps = await listThoughtMaps();
  const userId = maps[0]?.userId ?? getDemoThoughtUserId();
  const unlockStatuses = buildFeatureUnlockStatuses({ userId, maps });
  const summary = buildUnlockSummary(unlockStatuses);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Time-locked features</p>
          <h1 className="mt-2 text-4xl font-semibold text-[var(--ink)]">Things Penny can only unlock once there is enough history.</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--muted-ink)]">
            The point is not to gate the product. The point is to avoid pretending a feature is meaningful before the data exists to support it.
          </p>
        </div>
        <Link href="/app">
          <Button variant="secondary" className="gap-2">
            <ArrowLeft className="size-4" />
            Back to Brain
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Unlocked" value={`${summary.unlockedCount}`} />
        <StatCard label="Locked" value={`${summary.lockedCount}`} />
        <StatCard label="Recently unlocked" value={`${summary.recentlyUnlockedCount}`} />
      </div>

      <FeatureUnlockProgress unlockStatuses={unlockStatuses} />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
      <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-[var(--ink)]">{value}</p>
    </div>
  );
}
