import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VelocityDashboard } from "@/components/penny/velocity-dashboard";
import { buildVelocityReport } from "@/lib/intellectual-velocity";
import { listThoughtMaps } from "@/server/thought-map";
import { getCurrentAuthenticatedUserId } from "@/server/auth";

export default async function VelocityPage() {
  const maps = await listThoughtMaps();
  const userId = await getCurrentAuthenticatedUserId();
  const report = buildVelocityReport(userId, maps, 30);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Dashboard</p>
          <h1 className="mt-2 text-4xl font-semibold text-[var(--ink)]">The compounding rate of your thinking.</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--muted-ink)]">
            Penny shows the rate of improvement, not just the state of the archive, so you can see whether the system is making your thinking faster, sharper, and more durable.
          </p>
        </div>
        <Link href="/app">
          <Button variant="secondary" className="gap-2">
            <ArrowLeft className="size-4" />
            Back to Brain
          </Button>
        </Link>
      </div>

      <VelocityDashboard userId={userId} initialReport={report} />
    </div>
  );
}
