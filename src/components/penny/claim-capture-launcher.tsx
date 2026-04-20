'use client';

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { ClaimCaptureForm, type ClaimCaptureFormData } from "@/components/penny/claim-capture-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type ClaimCaptureLauncherProps = {
  mapId: string;
  availableClaims?: Array<{
    id: string;
    text: string;
  }>;
};

export function ClaimCaptureLauncher({ mapId, availableClaims = [] }: ClaimCaptureLauncherProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(data: ClaimCaptureFormData) {
    const response = await fetch(`/api/maps/${mapId}/claims`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string; details?: unknown } | null;
      throw new Error(payload?.error === "invalid_request" ? "Please check the claim fields and try again." : payload?.error || "Failed to save claim");
    }

    startTransition(() => {
      router.refresh();
      setOpen(false);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-start">
        <Button className="gap-2" onClick={() => setOpen(true)}>
          <Plus className="size-4" />
          Add claim
        </Button>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <Card
            className="w-full max-w-2xl border-black/8 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(244,240,230,0.98))] p-5 shadow-[0_30px_90px_rgba(16,24,40,0.25)]"
            role="dialog"
            aria-modal="true"
            aria-label="Capture a claim"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Capture claim</p>
                <h2 className="mt-2 text-3xl font-semibold text-[var(--ink)]">Save the smallest version of the belief.</h2>
                <p className="mt-2 text-sm leading-7 text-[var(--muted-ink)]">
                  Capture the claim text, confidence, provenance context, and any existing dependencies before the map grows around it.
                </p>
              </div>
              <button
                type="button"
                className="rounded-full p-2 text-[var(--muted-ink)] transition hover:bg-black/5 hover:text-[var(--ink)]"
                onClick={() => setOpen(false)}
                aria-label="Close claim capture dialog"
              >
                <X className="size-5" />
              </button>
            </div>

            <ClaimCaptureForm
              mapId={mapId}
              availableClaims={availableClaims}
              onSubmit={handleSubmit}
              onCancel={() => setOpen(false)}
            />
            {isPending ? <div className="mt-3 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Refreshing map…</div> : null}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
