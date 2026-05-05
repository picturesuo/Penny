import { ArrowUp, Upload } from "lucide-react";
import { type ChangeEvent, type FormEvent, type MouseEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { type PennyMode } from "../autopilotUx";
import type { LearnSourceMaterialInput } from "../api/brainClient";
import { PennyMark } from "./PennyMark";

interface LandingPageProps {
  disabled: boolean;
  status: string;
  onModeSelect: (mode: PennyMode) => void;
  onPromptSubmit: (
    mode: Extract<PennyMode, "Learn" | "Check">,
    rawIdea: string,
    sourceMaterial?: LearnSourceMaterialInput,
  ) => Promise<void>;
  onQuickNote: (rawIdea: string) => Promise<void>;
}

type LandingDestination = Extract<PennyMode, "Learn" | "Check"> | "QuickNote";

type LandingShortcutIntent =
  | { action: "open-mode"; mode: PennyMode }
  | { action: "select-destination"; destination: LandingDestination };

type LandingSubmitIntent =
  | { action: "submit-prompt"; mode: Extract<PennyMode, "Learn" | "Check">; rawIdea: string }
  | { action: "quick-note"; rawIdea: string };

export const landingShortcuts: Array<{ key: string; label: string }> = [
  { key: "B", label: "for Brain" },
  { key: "C", label: "for Check" },
  { key: "L", label: "for Learn" },
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

function labelForDestination(destination: LandingDestination): string {
  if (destination === "QuickNote") {
    return "Quick note";
  }

  return destination;
}

function labelForShortcutKey(key: string): string {
  const destination = destinationForShortcutKey(key);

  return destination ? labelForDestination(destination) : "Brain";
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
  const [sourceMaterial, setSourceMaterial] = useState<LearnSourceMaterialInput | null>(null);
  const [isCtrlDown, setIsCtrlDown] = useState(false);
  const [activeShortcutKey, setActiveShortcutKey] = useState<string | null>(null);
  const [selectedShortcutKey, setSelectedShortcutKey] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeShortcutTimeoutRef = useRef<number | null>(null);
  const submitIntent = landingSubmitIntent(destinationForShortcutKey(selectedShortcutKey), rawIdea);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useLayoutEffect(() => {
    const input = inputRef.current;

    if (!input) {
      return;
    }

    const maxHeight = Number.parseFloat(window.getComputedStyle(input).maxHeight);
    const nextHeight = Number.isFinite(maxHeight) ? Math.min(input.scrollHeight, maxHeight) : input.scrollHeight;

    input.style.height = "auto";
    input.style.height = `${nextHeight}px`;
    input.style.overflowY = input.scrollHeight > nextHeight ? "auto" : "hidden";
  }, [rawIdea]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (selectedShortcutKey) {
          event.preventDefault();
          clearSelectedShortcut();
        }
        return;
      }

      if (event.key === "Control") {
        setIsCtrlDown(true);
        return;
      }

      if ((!event.ctrlKey && !event.metaKey) || event.altKey || event.shiftKey) {
        return;
      }

      const shortcut = landingShortcuts.find((item) => item.key.toLowerCase() === event.key.toLowerCase());

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
  }, [disabled, onModeSelect, selectedShortcutKey]);

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
    setSourceMaterial(null);
    setSelectedShortcutKey(null);

    if (intent.action === "quick-note") {
      await onQuickNote(intent.rawIdea);
    } else {
      await onPromptSubmit(intent.mode, intent.rawIdea, intent.mode === "Learn" ? sourceMaterial ?? undefined : undefined);
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const material = await sourceMaterialFromFile(file);
    setSourceMaterial(material);
    setSelectedShortcutKey("L");

    if (!rawIdea.trim()) {
      setRawIdea(`Teach me ${file.name} in concise clustered lesson steps.`);
    }

    event.target.value = "";
  }

  function handlePromptBoxClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target;

    if (target instanceof Element && target.closest("button")) {
      return;
    }

    inputRef.current?.focus();
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

  function clearSelectedShortcut() {
    setSelectedShortcutKey(null);
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

          <div className="landing-prompt-box" onClick={handlePromptBoxClick}>
            <form className="landing-composer" onSubmit={handleSubmit}>
              <label className="sr-only" htmlFor="landingIdea">
                Ask Penny anything
              </label>
              <textarea
                id="landingIdea"
                ref={inputRef}
                value={rawIdea}
                onChange={(event) => setRawIdea(event.target.value)}
                disabled={disabled}
                placeholder="Ask anything..."
                aria-describedby="landingStatus"
                rows={1}
              />
              <p id="landingStatus" className="sr-only">
                {status}
              </p>
              <input
                ref={fileInputRef}
                type="file"
                className="sr-only"
                accept=".txt,.md,.pdf,.ppt,.pptx,.doc,.docx,text/*,application/pdf"
                onChange={(event) => {
                  void handleFileChange(event);
                }}
              />
              <button
                type="button"
                className={sourceMaterial ? "landing-file-button is-attached" : "landing-file-button"}
                disabled={disabled}
                onClick={() => fileInputRef.current?.click()}
                aria-label="Attach source file for Learn"
                title={sourceMaterial ? sourceMaterial.fileName : "Attach source file for Learn"}
              >
                <Upload size={17} strokeWidth={2.1} />
              </button>
              <button
                type="submit"
                className={selectedShortcutKey === null ? "landing-submit-button" : "landing-submit-button is-visible"}
                disabled={disabled || submitIntent === null}
                aria-label="Send thought"
              >
                <ArrowUp size={18} strokeWidth={2.2} />
              </button>
            </form>

            <div className="landing-prompt-actions">
              {sourceMaterial ? (
                <div className="landing-file-chip">
                  <span>{sourceMaterial.kind.toUpperCase()}</span>
                  <strong title={sourceMaterial.fileName}>{sourceMaterial.fileName}</strong>
                  <button type="button" onClick={() => setSourceMaterial(null)} aria-label="Remove attached source">
                    remove
                  </button>
                </div>
              ) : null}
              <div className="landing-shortcuts" aria-label="Keyboard shortcuts">
                {landingShortcuts.map((shortcut, index) => (
                  <div
                    className={selectedShortcutKey && selectedShortcutKey !== shortcut.key ? "landing-shortcut-group is-hidden" : "landing-shortcut-group"}
                    key={shortcut.key}
                  >
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
                      {selectedShortcutKey === shortcut.key ? (
                        <span>{labelForShortcutKey(shortcut.key)}</span>
                      ) : (
                        <span>{shortcut.label}</span>
                      )}
                    </button>
                  </div>
                ))}
              </div>
              {selectedShortcutKey ? (
                <button type="button" className="landing-escape-button" onClick={clearSelectedShortcut} aria-label="Clear selected mode">
                  esc
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

async function sourceMaterialFromFile(file: File): Promise<LearnSourceMaterialInput> {
  const extractedText = await extractFileText(file);

  return {
    kind: inferSourceKind(file),
    fileName: file.name,
    extractedText: extractedText.slice(0, 120_000),
  };
}

async function extractFileText(file: File): Promise<string> {
  if (file.type.startsWith("text/") || /\.(txt|md|csv|json)$/i.test(file.name)) {
    return file.text();
  }

  const buffer = await file.arrayBuffer();
  const decoded = new TextDecoder("utf-8", { fatal: false }).decode(buffer);

  return decoded
    .replace(/\(([^()\u0000-\u001f]{3,180})\)/g, " $1 ")
    .replace(/[^\S\r\n]+/g, " ")
    .replace(/[^\x09\x0a\x0d\x20-\x7e]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function inferSourceKind(file: File): LearnSourceMaterialInput["kind"] {
  const name = file.name.toLowerCase();

  if (name.endsWith(".pdf") || file.type === "application/pdf") {
    return "pdf";
  }

  if (/\.(ppt|pptx)$/i.test(name)) {
    return "slides";
  }

  if (/\.(doc|docx)$/i.test(name)) {
    return "document";
  }

  return "text";
}
