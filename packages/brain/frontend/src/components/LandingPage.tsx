import { ArrowUp, Plus } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { type PennyMode } from "../autopilotUx";
import { PennyMark } from "./PennyMark";

interface LandingPageProps {
  disabled: boolean;
  status: string;
  onModeSelect: (mode: PennyMode) => void;
  onPromptSubmit: (mode: Extract<PennyMode, "Learn" | "Check">, rawIdea: string) => Promise<void>;
  onQuickNote: (rawIdea: string) => Promise<void>;
}

type LandingDestination = Extract<PennyMode, "Learn" | "Check"> | "QuickNote";

type LandingShortcutIntent =
  | { action: "open-mode"; mode: PennyMode }
  | { action: "select-destination"; destination: LandingDestination };

type LandingSubmitIntent =
  | { action: "submit-prompt"; mode: Extract<PennyMode, "Learn" | "Check">; rawIdea: string }
  | { action: "quick-note"; rawIdea: string };

const shortcuts: Array<{ key: string; label: string }> = [
  { key: "B", label: "for Brain" },
  { key: "L", label: "for Learn" },
  { key: "C", label: "for Check" },
  { key: "Q", label: "for Quick note" },
];

function destinationForShortcutKey(key: string | null): LandingDestination | null {
  if (key === "L") {
    return "Learn";
  }

  if (key === "C") {
    return "Check";
  }

  if (key === "Q") {
    return "QuickNote";
  }

  return null;
}

export function landingShortcutIntent(key: string): LandingShortcutIntent | null {
  const normalizedKey = key.trim().toLowerCase();

  if (normalizedKey === "b") {
    return { action: "open-mode", mode: "Brain" };
  }

  if (normalizedKey === "l") {
    return { action: "select-destination", destination: "Learn" };
  }

  if (normalizedKey === "c") {
    return { action: "select-destination", destination: "Check" };
  }

  if (normalizedKey === "q") {
    return { action: "select-destination", destination: "QuickNote" };
  }

  return null;
}

export function landingSubmitIntent(destination: LandingDestination | null, rawIdea: string): LandingSubmitIntent | null {
  const trimmedIdea = rawIdea.trim();

  if (!destination || !trimmedIdea) {
    return null;
  }

  if (destination === "QuickNote") {
    return { action: "quick-note", rawIdea: trimmedIdea };
  }

  return { action: "submit-prompt", mode: destination, rawIdea: trimmedIdea };
}

export function LandingPage({ disabled, status, onModeSelect, onPromptSubmit, onQuickNote }: LandingPageProps) {
  const [rawIdea, setRawIdea] = useState("");
  const [isCtrlDown, setIsCtrlDown] = useState(false);
  const [activeShortcutKey, setActiveShortcutKey] = useState<string | null>(null);
  const [selectedShortcutKey, setSelectedShortcutKey] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeShortcutTimeoutRef = useRef<number | null>(null);
  const submitIntent = landingSubmitIntent(destinationForShortcutKey(selectedShortcutKey), rawIdea);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (event.key === "Control") {
        setIsCtrlDown(true);
        return;
      }

      if (!event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) {
        return;
      }

      const shortcut = shortcuts.find((item) => item.key.toLowerCase() === event.key.toLowerCase());

      if (!shortcut) {
        return;
      }

      event.preventDefault();
      void runShortcut(shortcut.key);
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.key === "Control") {
        setIsCtrlDown(false);
      }
    }

    function handleWindowBlur() {
      setIsCtrlDown(false);
    }

    window.addEventListener("keydown", handleShortcut);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      window.removeEventListener("keydown", handleShortcut);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [disabled, onModeSelect]);

  useEffect(() => {
    return () => {
      if (activeShortcutTimeoutRef.current) {
        window.clearTimeout(activeShortcutTimeoutRef.current);
      }
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const intent = landingSubmitIntent(destinationForShortcutKey(selectedShortcutKey), rawIdea);

    if (!intent || disabled) {
      return;
    }

    setRawIdea("");
    setSelectedShortcutKey(null);

    if (intent.action === "quick-note") {
      await onQuickNote(intent.rawIdea);
    } else {
      await onPromptSubmit(intent.mode, intent.rawIdea);
    }
  }

  async function runShortcut(key: string) {
    const intent = landingShortcutIntent(key);

    if (!intent) {
      return;
    }

    if (intent.action === "open-mode") {
      pulseShortcut(key);
      onModeSelect(intent.mode);
      return;
    }

    if (disabled) {
      return;
    }

    setSelectedShortcutKey(key.toUpperCase());
    inputRef.current?.focus();
  }

  function pulseShortcut(key: string) {
    if (activeShortcutTimeoutRef.current) {
      window.clearTimeout(activeShortcutTimeoutRef.current);
    }

    setActiveShortcutKey(key);
    activeShortcutTimeoutRef.current = window.setTimeout(() => {
      setActiveShortcutKey(null);
      activeShortcutTimeoutRef.current = null;
    }, 180);
  }

  return (
    <main className="landing-page" aria-label="Penny landing page">
      <section className="landing-frame">
        <div className="landing-center">
          <div className="landing-brand" aria-label="Penny. For your thoughts.">
            <div className="landing-wordmark">
              <PennyMark />
              <span>enny</span>
            </div>
            <div className="landing-rule" aria-hidden="true" />
            <p>FOR YOUR THOUGHTS</p>
          </div>

          <form className="landing-composer" onSubmit={handleSubmit}>
            <label className="sr-only" htmlFor="landingIdea">
              Ask Penny anything
            </label>
            <button type="button" className="landing-plus-button" aria-label="Add a new thought" disabled={disabled}>
              <Plus size={18} strokeWidth={1.8} />
            </button>
            <input
              id="landingIdea"
              ref={inputRef}
              value={rawIdea}
              onChange={(event) => setRawIdea(event.target.value)}
              disabled={disabled}
              placeholder="Ask anything..."
              aria-describedby="landingStatus"
            />
            <button
              type="submit"
              className="landing-submit-button"
              disabled={disabled || submitIntent === null}
              aria-label="Send thought"
            >
              <ArrowUp size={18} strokeWidth={2.2} />
            </button>
            <p id="landingStatus" className="sr-only">
              {status}
            </p>
          </form>

          <div className="landing-shortcuts" aria-label="Keyboard shortcuts">
            {shortcuts.map((shortcut, index) => (
              <div className="landing-shortcut-group" key={shortcut.key}>
                {index > 0 ? <span className="landing-shortcut-divider" aria-hidden="true" /> : null}
                <button
                  type="button"
                  disabled={disabled && shortcut.key !== "B"}
                  aria-pressed={selectedShortcutKey === shortcut.key}
                  className={selectedShortcutKey === shortcut.key ? "is-selected" : undefined}
                  onClick={() => {
                    void runShortcut(shortcut.key);
                  }}
                >
                  <kbd
                    className={isCtrlDown || selectedShortcutKey === shortcut.key ? "is-pressed" : undefined}
                    aria-label="Control"
                  >
                    Ctrl
                  </kbd>
                  <kbd
                    className={
                      activeShortcutKey === shortcut.key || selectedShortcutKey === shortcut.key ? "is-pressed" : undefined
                    }
                  >
                    {shortcut.key}
                  </kbd>
                  <span>{shortcut.label}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
