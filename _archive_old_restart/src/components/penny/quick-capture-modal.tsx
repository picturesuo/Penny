'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type QuickCaptureOpenOptions = {
  defaultMapId?: string;
  onSaved?: () => void;
};

type CaptureEntryMode = "type" | "import" | "quick";

type QuickCaptureContextValue = {
  open: (options?: QuickCaptureOpenOptions) => void;
  close: () => void;
};

const QuickCaptureContext = createContext<QuickCaptureContextValue | null>(null);

type QuickCaptureModalState = {
  isOpen: boolean;
  defaultMapId: string | null;
  onSaved: (() => void) | null;
};

export function QuickCaptureModalProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<QuickCaptureModalState>({
    isOpen: false,
    defaultMapId: null,
    onSaved: null,
  });

  const open = useCallback((options?: QuickCaptureOpenOptions) => {
    setState({
      isOpen: true,
      defaultMapId: options?.defaultMapId ?? null,
      onSaved: options?.onSaved ?? null,
    });
  }, []);

  const close = useCallback(() => {
    setState((current) => ({
      ...current,
      isOpen: false,
      defaultMapId: null,
      onSaved: null,
    }));
  }, []);

  const value = useMemo<QuickCaptureContextValue>(
    () => ({
      open,
      close,
    }),
    [close, open],
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase() ?? "";
      const isEditable = tagName === "input" || tagName === "textarea" || target?.isContentEditable === true;

      if (isEditable) {
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "c") {
        event.preventDefault();
        open();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <QuickCaptureContext.Provider value={value}>
      {children}
      <QuickCaptureModal
        isOpen={state.isOpen}
        defaultMapId={state.defaultMapId ?? undefined}
        onClose={close}
        onSaved={state.onSaved ?? undefined}
      />
    </QuickCaptureContext.Provider>
  );
}

export function useQuickCaptureModal() {
  const context = useContext(QuickCaptureContext);

  if (!context) {
    throw new Error("useQuickCaptureModal must be used within a QuickCaptureModalProvider");
  }

  return context;
}

export function QuickCaptureButton({
  defaultMapId,
  label = "Capture",
}: {
  defaultMapId?: string;
  label?: string;
}) {
  const { open } = useQuickCaptureModal();

  return (
    <Button className="gap-2" data-onboarding-target="quick-capture" onClick={() => open({ defaultMapId })}>
      {label}
    </Button>
  );
}

export function QuickCaptureModal({
  isOpen,
  defaultMapId,
  onClose,
  onSaved,
}: {
  isOpen: boolean;
  defaultMapId?: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [mode, setMode] = useState<CaptureEntryMode>("quick");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setText("");
    setError(null);
    setMode("quick");

    const timeout = window.setTimeout(() => {
      textareaRef.current?.focus();
    }, 50);

    return () => window.clearTimeout(timeout);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || mode !== "quick") {
      return;
    }

    const timeout = window.setTimeout(() => {
      textareaRef.current?.focus();
    }, 50);

    return () => window.clearTimeout(timeout);
  }, [isOpen, mode]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && isOpen) {
        event.preventDefault();
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  async function handleSave() {
    if (mode !== "quick") {
      if (mode === "type") {
        onClose();
        router.push("/app?intent=capture&captureMode=type");
        return;
      }

      onClose();
      router.push(defaultMapId ? `/maps/${defaultMapId}?launcher=capture&openImport=1` : "/app?intent=capture&captureMode=import");
      return;
    }

    const rawText = text.trim();
    if (!rawText || saving) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/quick-capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawText,
          captureSource: "web_shortcut",
          mapId: defaultMapId ?? undefined,
          sourceMapId: defaultMapId ?? undefined,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save");
      }

      setText("");
      onClose();
      onSaved?.();
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Penny could not save this capture right now.");
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Quick capture"
    >
      <Card
        className="w-full max-w-xl border-black/10 bg-white p-6 shadow-[0_30px_120px_rgba(0,0,0,0.22)]"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Capture</p>
        <h3 className="mt-2 text-2xl font-semibold text-[var(--ink)]">Choose how you want to get material into Penny.</h3>
        <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">
          Type into Brain, paste or import a source, or save a quick note without deciding the full structure yet.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {([
            ["type", "Type into Brain"],
            ["import", "Paste or import"],
            ["quick", "Quick note"],
          ] as const).map(([candidate, label]) => (
            <Button
              key={candidate}
              type="button"
              variant={mode === candidate ? "primary" : "secondary"}
              onClick={() => {
                setMode(candidate);
                setError(null);
              }}
            >
              {label}
            </Button>
          ))}
        </div>
        {mode === "quick" ? (
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Capture the quick note, fragment, or fleeting thought you do not want to lose..."
            rows={6}
            className="mt-4 w-full rounded-[24px] border border-black/10 bg-[var(--panel)] px-4 py-3 text-sm leading-7 text-[var(--ink)] outline-none placeholder:text-[var(--muted-ink)]"
          />
        ) : (
          <div className="mt-4 rounded-[24px] border border-black/10 bg-[var(--panel)] px-4 py-4 text-sm leading-7 text-[var(--ink)]">
            {mode === "type"
              ? "Open the capture launcher and turn one typed thought into a live map."
              : defaultMapId
                ? "Open the importer in the current map so you can paste source text, add a URL, or upload a document."
                : "Open the capture launcher and route into Penny’s import flow from there."}
          </div>
        )}
        {error ? <p className="mt-3 text-sm text-[#8b3d2f]">{error}</p> : null}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            disabled={saving || (mode === "quick" && text.trim().length === 0)}
            onClick={() => void handleSave()}
          >
            {saving ? "Saving…" : mode === "quick" ? "Save quick note" : mode === "type" ? "Open capture" : "Open importer"}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <span className="self-center text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">Cmd/Ctrl + Shift + C</span>
        </div>
      </Card>
    </div>
  );
}
