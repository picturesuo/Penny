import { useEffect, useState } from "react";
import type { BrainClaim, WorkStructure, WorkStructureStep } from "../types/brain";
import { Section } from "./Section";
import { ThoughtMap } from "./ThoughtMap";

interface LeftRailProps {
  claims: BrainClaim[];
  workStructure?: WorkStructure | null;
  savedPaths: string[];
  focusedClaimId: string | null;
  focusedWorkStructureStepId?: string | null;
  suggestedClaimId: string | null;
  onClaimSelect: (claimId: string) => void;
  onWorkStructureSelect?: (step: WorkStructureStep) => void;
}

export function LeftRail({
  claims,
  workStructure,
  savedPaths,
  focusedClaimId,
  focusedWorkStructureStepId,
  suggestedClaimId,
  onClaimSelect,
  onWorkStructureSelect,
}: LeftRailProps) {
  return (
    <aside className="left-rail" aria-label="Thought map">
      <Section title="THOUGHT MAP" className="thought-map-section">
        <ThoughtMap
          claims={claims}
          workStructure={workStructure ?? null}
          focusedClaimId={focusedClaimId}
          focusedWorkStructureStepId={focusedWorkStructureStepId ?? null}
          suggestedClaimId={suggestedClaimId}
          onClaimSelect={onClaimSelect}
          onWorkStructureSelect={onWorkStructureSelect ?? noopWorkStructureSelect}
        />
      </Section>
      <div className="left-bottom-grid">
        <Section title="LATER" className="later-section">
          {savedPaths.length > 0 ? (
            <ul>
              {savedPaths.slice(0, 3).map((path) => (
                <li key={path}>{path}</li>
              ))}
            </ul>
          ) : (
            <p>Exploration paths you save for later will appear here</p>
          )}
        </Section>
        <Section title="QUICK SELECT" className="quick-select-section">
          <QuickSelectKey />
        </Section>
      </div>
    </aside>
  );
}

function QuickSelectKey() {
  const [lastKey, setLastKey] = useState("Key");

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      setLastKey(formatPressedKey(event));
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div className="quick-select-indicator" aria-live="polite" aria-label={`Last key pressed: ${lastKey}`}>
      <kbd>{lastKey}</kbd>
    </div>
  );
}

function formatPressedKey(event: KeyboardEvent): string {
  const modifierPrefix = [
    event.metaKey && event.key !== "Meta" ? "Cmd+" : "",
    event.ctrlKey && event.key !== "Control" ? "Ctrl+" : "",
    event.altKey && event.key !== "Alt" ? "Alt+" : "",
    event.shiftKey && event.key !== "Shift" && event.key.length > 1 ? "Shift+" : "",
  ].join("");

  return `${modifierPrefix}${keyLabel(event.key)}`;
}

function keyLabel(key: string): string {
  switch (key) {
    case " ":
    case "Spacebar":
      return "Space";
    case "ArrowUp":
      return "Up";
    case "ArrowRight":
      return "Right";
    case "ArrowDown":
      return "Down";
    case "ArrowLeft":
      return "Left";
    case "Escape":
      return "Esc";
    case "Backspace":
      return "Back";
    case "Delete":
      return "Del";
    case "Enter":
      return "Enter";
    case "Tab":
      return "Tab";
    case "Meta":
      return "Cmd";
    case "Control":
      return "Ctrl";
    default:
      return key.length === 1 ? key.toUpperCase() : key.replace(/^Key|^Digit/, "");
  }
}

function noopWorkStructureSelect() {}
