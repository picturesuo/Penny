import { createSessionAction } from "@/app/actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CATEGORY_OPTIONS } from "@/lib/penny";

export default function NewSessionPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <Card className="p-8 sm:p-10">
        <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">New idea session</p>
        <h1 className="mt-3 text-4xl font-semibold text-[var(--ink)]">Bring the rough version.</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--muted-ink)]">
          Penny works best when you give it the real unfinished thought, not polished pitch copy.
        </p>

        <form action={createSessionAction} className="mt-8 space-y-6">
          <div className="space-y-2">
            <label htmlFor="rawIdea" className="text-sm font-medium text-[var(--ink)]">
              What idea are you exploring?
            </label>
            <textarea
              id="rawIdea"
              name="rawIdea"
              rows={8}
              placeholder="Example: I want to build an AI assistant for compliance teams that turns new regulations into concrete operating checklists."
              className="w-full rounded-[28px] border border-black/10 bg-[var(--panel)] px-5 py-5 text-base leading-7 text-[var(--ink)] outline-none placeholder:text-[var(--muted-ink)] focus:border-black/20"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="category" className="text-sm font-medium text-[var(--ink)]">
              Optional category
            </label>
            <select
              id="category"
              name="category"
              className="w-full rounded-full border border-black/10 bg-white px-5 py-3 text-sm text-[var(--ink)] outline-none focus:border-black/20"
              defaultValue=""
            >
              <option value="">Choose a category</option>
              {CATEGORY_OPTIONS.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>

          <Button type="submit" className="px-6 py-3 text-base">
            Pressure-test this idea
          </Button>
        </form>
      </Card>
    </div>
  );
}
