"use client";

import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { MarginFragmentModel } from "@/types/penny";

export function CaptureInbox({
  captures,
}: {
  captures: MarginFragmentModel[];
}) {
  const router = useRouter();
  const pending = captures.filter((capture) => capture.status === "floating");

  async function updateCapture(captureId: string, status: "surfaced" | "archived") {
    const response = await fetch(`/api/margin/fragments/${captureId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ status }),
    });

    if (!response.ok) {
      throw new Error("Could not update capture");
    }
  }

  async function processCapture(capture: MarginFragmentModel) {
    await updateCapture(capture.id, "surfaced");
    router.push(`/app/new?prefill=${encodeURIComponent(capture.content)}`);
  }

  async function dismissCapture(captureId: string) {
    await updateCapture(captureId, "archived");
    router.refresh();
  }

  if (pending.length === 0) {
    return (
      <Card className="p-6">
        <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Capture inbox</p>
        <h3 className="mt-2 text-2xl font-semibold text-[var(--ink)]">Nothing pending</h3>
        <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">
          New margin captures will show up here until you turn them into claims or dismiss them.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Capture inbox</p>
      <h3 className="mt-2 text-2xl font-semibold text-[var(--ink)]">Unprocessed captures ({pending.length})</h3>
      <div className="mt-4 space-y-3">
        {pending.map((capture) => (
          <div key={capture.id} className="rounded-[22px] border border-black/8 bg-[var(--panel)] p-4">
            <p className="text-sm leading-7 text-[var(--ink)]">{capture.content}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button className="px-3 py-2 text-xs" onClick={() => void processCapture(capture)}>
                Process
              </Button>
              <Button className="px-3 py-2 text-xs" variant="secondary" onClick={() => void dismissCapture(capture.id)}>
                Dismiss
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
