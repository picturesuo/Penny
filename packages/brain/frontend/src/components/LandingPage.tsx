import { ArrowUp, Mic, Paperclip, Plus } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { type PennyMode } from "../autopilotUx";
import { PennyMark } from "./PennyMark";

interface LandingPageProps {
  disabled: boolean;
  status: string;
  onSeed: (rawIdea: string) => Promise<void>;
  onModeSelect: (mode: PennyMode) => void;
  onQuickNote: (rawIdea: string) => Promise<void>;
}

const shortcuts: Array<{ key: string; label: string; mode?: PennyMode; action: "mode" | "quick-note" }> = [
  { key: "B", label: "for Brain", mode: "Brain", action: "mode" },
  { key: "C", label: "for Check", mode: "Check", action: "mode" },
  { key: "L", label: "for Learn", mode: "Learn", action: "mode" },
  { key: "Q", label: "for Quick note", action: "quick-note" },
];

export function LandingPage({ disabled, status, onSeed, onModeSelect, onQuickNote }: LandingPageProps) {
  const [rawIdea, setRawIdea] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) {
        return;
      }

      const shortcut = shortcuts.find((item) => item.key.toLowerCase() === event.key.toLowerCase());

      if (!shortcut) {
        return;
      }

      event.preventDefault();

      if (shortcut.action === "quick-note") {
        void handleQuickNote();
        return;
      }

      if (shortcut.mode) {
        onModeSelect(shortcut.mode);
      }
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [rawIdea, onModeSelect]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedIdea = rawIdea.trim();

    if (!trimmedIdea) {
      return;
    }

    await onSeed(trimmedIdea);
    setRawIdea("");
  }

  async function handleQuickNote() {
    const trimmedIdea = rawIdea.trim();

    if (!trimmedIdea || disabled) {
      onModeSelect("Learn");
      return;
    }

    await onQuickNote(trimmedIdea);
    setRawIdea("");
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
            <textarea
              id="landingIdea"
              ref={textareaRef}
              value={rawIdea}
              onChange={(event) => setRawIdea(event.target.value)}
              disabled={disabled}
              placeholder="Ask anything..."
              rows={3}
              aria-describedby="landingStatus"
            />
            <div className="landing-composer-actions">
              <div className="landing-attachment-actions" aria-label="Input actions">
                <button type="button" aria-label="Add a new thought" disabled={disabled}>
                  <Plus size={24} strokeWidth={1.8} />
                </button>
                <button type="button" className="landing-file-button" aria-label="Add files" disabled={disabled}>
                  <Paperclip size={23} strokeWidth={1.8} />
                  <span>Add files</span>
                </button>
              </div>
              <div className="landing-send-actions">
                <button type="button" aria-label="Use voice input" disabled={disabled}>
                  <Mic size={23} strokeWidth={1.8} />
                </button>
                <button
                  type="submit"
                  className="landing-submit-button"
                  disabled={disabled || rawIdea.trim().length === 0}
                  aria-label="Send thought"
                >
                  <ArrowUp size={24} strokeWidth={2.1} />
                </button>
              </div>
            </div>
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
                  onClick={() =>
                    shortcut.action === "quick-note" ? void handleQuickNote() : shortcut.mode && onModeSelect(shortcut.mode)
                  }
                >
                  <kbd aria-label="Command">⌘</kbd>
                  <kbd>{shortcut.key}</kbd>
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
