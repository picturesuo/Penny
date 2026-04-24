import type { ReactNode } from "react";
import { Badge, ConfidenceBadge, Panel } from "../ui";

type InspectorRailProps = {
  children?: ReactNode;
};

export function InspectorRail({ children }: InspectorRailProps) {
  return (
    <aside className="inspector-rail" aria-label="Inspector">
      {children ?? (
        <>
          <Panel eyebrow="Selected claim" title="Investor attention is scarce">
            <p className="inspector-rail__copy">
              Strong enough to test, but it still needs sharper evidence before it becomes a planning assumption.
            </p>
            <div className="inspector-rail__badges">
              <ConfidenceBadge value={68} />
              <Badge mode="challenge">Needs challenge</Badge>
            </div>
          </Panel>

          <Panel eyebrow="Next useful move" title="Stress-test the weakest premise">
            <p className="inspector-rail__copy">
              Ask for the strongest counterexample before adding more supporting detail.
            </p>
          </Panel>
        </>
      )}
    </aside>
  );
}
