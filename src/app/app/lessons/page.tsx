import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LessonLibraryView } from "@/components/penny/lesson-library";
import { getLessonLibrary } from "@/server/lesson-library";
import { getDemoThoughtUserId } from "@/lib/thought-map";
import { listThoughtMaps } from "@/server/thought-map";

export default async function LessonsPage() {
  const maps = await listThoughtMaps();
  const userId = maps[0]?.userId ?? getDemoThoughtUserId();
  const library = await getLessonLibrary(userId);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Archive</p>
          <h1 className="mt-2 text-4xl font-semibold text-[var(--ink)] sm:text-5xl">
            The lessons only exist because you lived through the decision.
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--muted-ink)]">
            Penny turns post-mortems, resolutions, strong concessions, and counterfactual insights into a searchable library that can surface again when a new claim hits the same structure.
          </p>
        </div>
        <Link href="/app">
          <Button variant="secondary" className="gap-2">
            <ArrowLeft className="size-4" />
            Back to Brain
          </Button>
        </Link>
      </div>

      <LessonLibraryView userId={userId} initialLessons={library.lessons} generatedAt={library.generatedAt} />
    </div>
  );
}
