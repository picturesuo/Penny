"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { QuickCapture } from "@/types/quick-capture";

export function QuickCapture({
  onSaved,
  userId,
}: {
  onSaved?: () => void;
  userId?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "c") {
        event.preventDefault();
        setIsOpen(true);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  async function handleSave() {
    const content = text.trim();
    if (!content) {
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/quick-capture", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          userId,
          rawText: content,
          captureSource: "web_shortcut",
          sphere: "work",
          currentStage: "dashboard",
          currentFocus: content.slice(0, 120),
          currentContext: content,
          currentResponse: null,
          recentSessionMinutes: null,
        }),
      });

      if (!response.ok) {
        throw new Error("Could not save capture");
      }

      const payload = (await response.json()) as { capture?: QuickCapture };
      setText("");
      setIsOpen(false);
      setMessage(payload.capture ? "Captured and ready for later." : "Captured.");
      onSaved?.();
    } catch {
      setMessage("Penny could not save this capture right now.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button className="gap-2" data-onboarding-target="quick-capture" onClick={() => setIsOpen(true)}>
        <Plus className="size-4" />
        Quick capture
      </Button>
      {message ? <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">{message}</p> : null}
      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" onClick={() => setIsOpen(false)}>
          <div className="w-full max-w-xl rounded-[32px] border border-black/10 bg-white p-6 shadow-[0_30px_120px_rgba(0,0,0,0.22)]" onClick={(event) => event.stopPropagation()}>
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Capture a thought</p>
            <h3 className="mt-2 text-2xl font-semibold text-[var(--ink)]">Store the raw thought before it disappears.</h3>
            <textarea
              autoFocus
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="What do you believe right now?"
              rows={6}
              className="mt-4 w-full rounded-[24px] border border-black/10 bg-[var(--panel)] px-4 py-3 text-sm leading-7 text-[var(--ink)] outline-none placeholder:text-[var(--muted-ink)]"
            />
            <div className="mt-4 flex flex-wrap gap-3">
              <Button disabled={saving || text.trim().length === 0} onClick={handleSave}>
                {saving ? "Saving…" : "Capture"}
              </Button>
              <Button variant="secondary" onClick={() => setIsOpen(false)}>
                Close
              </Button>
              <span className="self-center text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">Cmd/Ctrl + Shift + C</span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
