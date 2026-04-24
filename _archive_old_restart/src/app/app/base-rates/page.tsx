import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listThoughtMaps } from "@/server/thought-map";
import { getPersonalBaseRateLibrary } from "@/server/personal-base-rates";
import { getCurrentAuthenticatedUserId } from "@/server/auth";
import { BaseRateLibraryView } from "@/components/penny/base-rate-library";

export default async function BaseRatesPage() {
  const maps = await listThoughtMaps();
  const userId = await getCurrentAuthenticatedUserId();
  const library = await getPersonalBaseRateLibrary(userId);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Calibration memory</p>
          <h1 className="mt-2 text-4xl font-semibold text-[var(--ink)] sm:text-5xl">
            Your personal base rates.
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--muted-ink)]">
            Penny derives these from your own resolved predictions. They only become meaningful after enough samples accumulate in a bucket.
          </p>
        </div>
        <Link href="/app">
          <Button variant="secondary" className="gap-2">
            <ArrowLeft className="size-4" />
            Back to home
          </Button>
        </Link>
      </div>

      <BaseRateLibraryView library={library} />
    </div>
  );
}
