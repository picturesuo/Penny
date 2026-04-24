"use client";

import { useMemo, useState, useTransition } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SessionIntentionType, ThinkingSession } from "@/types/thought-map";

type MapOption = {
  id: string;
  title: string;
  claimIds: string[];
};

const INTENTION_TYPES: Array<{ value: SessionIntentionType; label: string; description: string }> = [
  { value: "stress_test", label: "Stress test", description: "Pressure-test a claim or map that already feels shaky." },
  { value: "explore_new_claim", label: "Explore new claim", description: "Start from a fresh idea and let the structure emerge." },
  { value: "resolve_pending", label: "Resolve pending", description: "Work through an unresolved claim or choice." },
  { value: "generate_artifact", label: "Generate artifact", description: "Turn the map into a brief, memo, or decision artifact." },
  { value: "review_blind_spots", label: "Review blind spots", description: "Inspect what the map is still not seeing." },
  { value: "revisit_queue", label: "Revisit queue", description: "Clear the next round of queued follow-ups." },
  { value: "open_exploration", label: "Open exploration", description: "Think openly without a fixed destination." },
];

export function SessionStart({
  mapId,
  mapTitle,
  maps,
  onStarted,
  onDismissed,
}: {
  mapId: string;
  mapTitle: string;
  maps: MapOption[];
  onStarted: (session: ThinkingSession) => void;
  onDismissed: (session: ThinkingSession) => void;
}) {
  const [declaredIntention, setDeclaredIntention] = useState("");
  const [intentionType, setIntentionType] = useState<SessionIntentionType>("open_exploration");
  const [timeBudgetMinutes, setTimeBudgetMinutes] = useState<string>("");
  const [selectedMapIds, setSelectedMapIds] = useState<string[]>([mapId]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedClaimIds = useMemo(
    () =>
      maps
        .filter((map) => selectedMapIds.includes(map.id))
        .flatMap((map) => map.claimIds)
        .filter((claimId, index, list) => list.indexOf(claimId) === index),
    [maps, selectedMapIds],
  );

  function toggleMap(mapOptionId: string) {
    setSelectedMapIds((current) =>
      current.includes(mapOptionId) ? current.filter((id) => id !== mapOptionId) : [...current, mapOptionId],
    );
  }

  async function startSession(mode: "begin" | "dismiss") {
    setError(null);

    const response = await fetch("/api/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mapId,
        declaredIntention:
          mode === "dismiss"
            ? `Exploration mode for ${mapTitle}`
            : declaredIntention.trim() || `Thinking session for ${mapTitle}`,
        intentionType: mode === "dismiss" ? "open_exploration" : intentionType,
        scopedClaimIds: selectedClaimIds,
        timeBudgetMinutes: timeBudgetMinutes.trim().length ? Number(timeBudgetMinutes) : null,
      }),
    });

    if (!response.ok) {
      setError("Penny could not start the session.");
      return;
    }

    const payload = (await response.json()) as { session: ThinkingSession };

    if (mode === "dismiss") {
      await fetch("/api/sessions", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: payload.session.id,
          eventType: "session_dismissed",
          claimId: null,
          description: "User dismissed the ritual and entered exploration mode.",
        }),
      });
      onDismissed(payload.session);
      return;
    }

    onStarted(payload.session);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[32px] border border-black/10 bg-[var(--paper)] p-6 shadow-[0_40px_120px_rgba(15,23,42,0.24)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">Session start ritual</p>
            <h2 className="mt-1 text-2xl font-semibold text-[var(--ink)]">What are you here to think about today?</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
              Penny will hold this intention alongside the map so the work has a declared beginning and a coherent finish.
            </p>
          </div>
          <Button type="button" variant="ghost" className="h-10 w-10 p-0" onClick={() => void startSession("dismiss")}>
            <X className="size-4" />
          </Button>
        </div>

        <div className="mt-6 grid gap-5">
          <label className="space-y-2">
            <span className="text-sm font-medium text-[var(--ink)]">Declared intention</span>
            <textarea
              rows={4}
              value={declaredIntention}
              onChange={(event) => setDeclaredIntention(event.target.value)}
              placeholder="Example: pressure-test the market size claim before I spend another week on it."
              className="w-full rounded-[24px] border border-black/10 bg-white px-4 py-3 text-sm leading-6 text-[var(--ink)] outline-none placeholder:text-[var(--muted-ink)] focus:border-black/20"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium text-[var(--ink)]">What kind of session is this?</span>
            <select
              value={intentionType}
              onChange={(event) => setIntentionType(event.target.value as SessionIntentionType)}
              className="w-full rounded-[24px] border border-black/10 bg-white px-4 py-3 text-sm text-[var(--ink)] outline-none focus:border-black/20"
            >
              {INTENTION_TYPES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <p className="text-xs leading-5 text-[var(--muted-ink)]">
              {INTENTION_TYPES.find((item) => item.value === intentionType)?.description}
            </p>
          </label>

          <div className="grid gap-5 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-[var(--ink)]">How much time do you have?</span>
              <input
                type="number"
                min={1}
                max={480}
                value={timeBudgetMinutes}
                onChange={(event) => setTimeBudgetMinutes(event.target.value)}
                placeholder="Optional"
                className="w-full rounded-[24px] border border-black/10 bg-white px-4 py-3 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted-ink)] focus:border-black/20"
              />
            </label>

            <div className="space-y-2">
              <span className="text-sm font-medium text-[var(--ink)]">Which claims or maps do you want to focus on?</span>
              <div className="max-h-56 space-y-2 overflow-y-auto rounded-[24px] border border-black/10 bg-white p-3">
                {maps.map((option) => {
                  const active = selectedMapIds.includes(option.id);

                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={[
                        "w-full rounded-[18px] border px-4 py-3 text-left transition",
                        active
                          ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]"
                          : "border-black/10 bg-[var(--panel)] text-[var(--muted-ink)] hover:border-black/20 hover:text-[var(--ink)]",
                      ].join(" ")}
                      onClick={() => toggleMap(option.id)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium">{option.title}</span>
                        <span className="text-xs uppercase tracking-[0.16em]">{option.claimIds.length} claims</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {error ? <p className="text-sm text-[#8b4d1f]">{error}</p> : null}

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              className="px-5 py-3"
              disabled={isPending}
              onClick={() => {
                startTransition(() => {
                  void startSession("begin");
                });
              }}
            >
              Begin session
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="px-5 py-3"
              disabled={isPending}
              onClick={() => {
                startTransition(() => {
                  void startSession("dismiss");
                });
              }}
            >
              Enter exploration mode
            </Button>
          </div>
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
            Dismissal is logged if you skip the ritual.
          </p>
        </div>
      </div>
    </div>
  );
}
