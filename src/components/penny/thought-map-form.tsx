"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThoughtMapForm() {
  const router = useRouter();
  const [rawThought, setRawThought] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const response = await fetch("/api/maps", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ rawThought }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as {
          details?: { fieldErrors?: Record<string, string[]> };
        };
        const message =
          payload.details?.fieldErrors?.rawThought?.[0] ??
          "Penny needs one real thought to start the map.";
        setError(message);
        return;
      }

      const payload = (await response.json()) as { map: { id: string } };
      router.push(`/app/maps/${payload.map.id}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-6">
      <div className="space-y-2">
        <label htmlFor="rawThought" className="text-sm font-medium text-[var(--ink)]">
          What idea are you exploring?
        </label>
        <textarea
          id="rawThought"
          name="rawThought"
          rows={8}
          value={rawThought}
          onChange={(event) => setRawThought(event.target.value)}
          placeholder="Example: Founders need a visual way to structure startup ideas, pressure test assumptions, and surface better research questions before building."
          className="w-full rounded-[28px] border border-black/10 bg-[var(--panel)] px-5 py-5 text-base leading-7 text-[var(--ink)] outline-none placeholder:text-[var(--muted-ink)] focus:border-black/20"
        />
      </div>

      {error ? <p className="text-sm text-[#8b3d33]">{error}</p> : null}

      <Button type="submit" className="gap-2 px-6 py-3 text-base" disabled={isPending || rawThought.trim().length < 12}>
        {isPending ? "Starting map..." : "Start thought map"}
        <ArrowRight className="size-4" />
      </Button>
    </form>
  );
}
