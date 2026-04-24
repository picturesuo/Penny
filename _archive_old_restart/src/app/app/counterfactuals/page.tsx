import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CounterfactualDashboard } from "@/components/penny/counterfactual-dashboard";
import { buildCounterfactualArchiveForUser } from "@/server/counterfactual";
import { listThoughtMaps } from "@/server/thought-map";
import { getCurrentAuthenticatedUserId } from "@/server/auth";

export default async function CounterfactualsPage() {
  const maps = await listThoughtMaps();
  const userId = await getCurrentAuthenticatedUserId();
  const archive = await buildCounterfactualArchiveForUser(userId);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Archive</p>
          <h1 className="mt-2 text-4xl font-semibold text-[var(--ink)] sm:text-5xl">
            The roads not taken become legible.
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--muted-ink)]">
            Penny reconstructs what might have happened if you had acted on the belief at capture, day 30, day 60, and day 90. The analysis is grounded in recorded history, not retroactive mythology.
          </p>
        </div>
        <Link href="/app">
          <Button variant="secondary" className="gap-2">
            <ArrowLeft className="size-4" />
            Back to Brain
          </Button>
        </Link>
      </div>

      <CounterfactualDashboard archive={archive} />
    </div>
  );
}
