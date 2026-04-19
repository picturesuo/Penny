'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type NewMapDialogContextValue = {
  open: () => void;
  close: () => void;
};

const NewMapDialogContext = createContext<NewMapDialogContextValue | null>(null);

const DEFAULT_CLAIM = {
  insideViewEstimate: 60,
  confidence: 60,
  resolutionDate: null,
  provenance: "intuition" as const,
  provenanceDetail: "",
  sourceCitation: "",
  sourceTrustLevel: "self" as const,
  stakes: [] as const,
  dependencyNotes: "",
  status: "open" as const,
  temporalScope: "",
  conditionalStatement: "",
  structureKind: "assertion" as const,
};

export function NewMapDialogProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const value = useMemo<NewMapDialogContextValue>(
    () => ({
      open,
      close,
    }),
    [close, open],
  );

  return (
    <NewMapDialogContext.Provider value={value}>
      {children}
      <NewMapModal open={isOpen} onClose={close} />
    </NewMapDialogContext.Provider>
  );
}

export function useNewMapDialog() {
  const context = useContext(NewMapDialogContext);

  if (!context) {
    throw new Error("useNewMapDialog must be used within a NewMapDialogProvider");
  }

  return context;
}

export function NewMapButton({
  label = "Start thought map",
  className,
  showIcon = true,
  variant = "primary",
  ...buttonProps
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label?: string;
  showIcon?: boolean;
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  const { open } = useNewMapDialog();

  return (
    <Button {...buttonProps} variant={variant} className={className} onClick={open}>
      {showIcon ? <Plus className="size-4" /> : null}
      {label}
    </Button>
  );
}

export function NewMapModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [rawThought, setRawThought] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setRawThought("");
    setCreating(false);
    setError(null);

    const timeout = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = rawThought.trim();
    if (trimmed.length < 12 || creating) {
      setError("Give Penny one real thought, not a slogan.");
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const response = await fetch("/api/maps", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rawThought: trimmed,
          claim: DEFAULT_CLAIM,
        }),
      });

      if (!response.ok) {
        let message = "Failed to create map";

        try {
          const data = (await response.json()) as { error?: string; details?: { formErrors?: string[]; fieldErrors?: Record<string, string[]> } };
          message = data.error || data.details?.formErrors?.[0] || Object.values(data.details?.fieldErrors ?? {}).flat()[0] || message;
        } catch {
          // Ignore JSON parsing failures and keep the generic message.
        }

        throw new Error(message);
      }

      const payload = (await response.json()) as { map?: { id?: string } };
      const mapId = payload.map?.id;

      if (!mapId) {
        throw new Error("The map was created but Penny could not open it.");
      }

      onClose();
      router.push(`/app/maps/${mapId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong");
      setCreating(false);
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6 backdrop-blur-sm" onClick={onClose}>
      <Card
        role="dialog"
        aria-modal="true"
        aria-label="Create a new map"
        className="w-full max-w-2xl border-black/8 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(244,240,230,0.98))] p-6 shadow-[0_30px_90px_rgba(16,24,40,0.25)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">New map</p>
            <h2 className="mt-2 text-3xl font-semibold text-[var(--ink)]">Start with one real thought.</h2>
            <p className="mt-2 text-sm leading-7 text-[var(--muted-ink)]">
              Give Penny the decision, belief, or risk you want to pressure-test first. It will turn that into a map and open it immediately.
            </p>
          </div>
          <button
            type="button"
            className="rounded-full p-2 text-[var(--muted-ink)] transition hover:bg-black/5 hover:text-[var(--ink)]"
            onClick={onClose}
            aria-label="Close new map dialog"
          >
            <X className="size-5" />
          </button>
        </div>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-[var(--ink)]">What are you thinking about?</span>
            <input
              ref={inputRef}
              type="text"
              value={rawThought}
              onChange={(event) => setRawThought(event.target.value)}
              placeholder="Series A readiness, product direction, hiring decision"
              className="w-full rounded-[18px] border border-black/10 bg-white px-4 py-3 text-sm text-[var(--ink)] outline-none transition placeholder:text-[var(--muted-ink)] focus:border-black/20"
              maxLength={400}
            />
          </label>

          <p className="text-xs leading-6 text-[var(--muted-ink)]">
            Penny will use this as the seed thought for the map and open the workspace after it is created.
          </p>

          {error ? (
            <div className="rounded-[18px] border border-[#f0c0b7] bg-[#fff4f1] px-4 py-3 text-sm text-[#8b3d2f]">
              {error}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="gap-2" disabled={creating || rawThought.trim().length < 12}>
              {creating ? "Creating..." : "Create map"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
