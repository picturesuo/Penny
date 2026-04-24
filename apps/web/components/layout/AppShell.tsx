import type { ReactNode } from "react";
import { Badge, Button, Card, EmptyState, Panel, SegmentedTabs, Textarea } from "../ui";
import { WorkspaceLayout } from "./WorkspaceLayout";
import { SidebarNav } from "./SidebarNav";
import { TopToolbar } from "./TopToolbar";

type AppShellProps = {
  children?: ReactNode;
};

const modeItems = [
  { id: "brain" as const, label: "Brain" },
  { id: "challenge" as const, label: "Challenge" },
  { id: "learn" as const, label: "Learn" },
];

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="app-shell">
      <SidebarNav />
      <div className="app-shell__body">
        <TopToolbar />
        <WorkspaceLayout>
          {children ?? <DefaultWorkspace />}
        </WorkspaceLayout>
      </div>
    </div>
  );
}

function DefaultWorkspace() {
  return (
    <div className="workspace-home">
      <section className="workspace-hero">
        <div>
          <p className="ui-eyebrow">Brain workspace</p>
          <h1>Shape one thought until it is clear enough to challenge.</h1>
          <p>
            Penny keeps the MVP frame quiet: capture a claim, inspect its confidence, and move it into Challenge or Learn without changing context.
          </p>
        </div>
        <SegmentedTabs active="brain" items={modeItems} />
      </section>

      <div className="workspace-grid">
        <Panel eyebrow="Active thought" title="Start with the highest leverage claim">
          <Textarea label="Thought" placeholder="Write the claim you want Penny to hold onto." rows={6} />
          <div className="workspace-actions">
            <Button>Save Thought</Button>
            <Button variant="secondary">Send to Challenge</Button>
          </div>
        </Panel>

        <Panel eyebrow="Mode accents" title="One workspace, three lenses">
          <div className="mode-card-stack">
            <Card>
              <Badge mode="brain">Brain</Badge>
              <p>Organize raw thinking into claims, spheres, and selected context.</p>
            </Card>
            <Card>
              <Badge mode="challenge">Challenge</Badge>
              <p>Make the strongest objection visible before a claim becomes settled.</p>
            </Card>
            <Card>
              <Badge mode="learn">Learn</Badge>
              <p>Turn a claim into a teach-back loop that exposes gaps in understanding.</p>
            </Card>
          </div>
        </Panel>
      </div>

      <EmptyState
        actionLabel="Create first sphere"
        body="This placeholder keeps the shell useful before backend data is connected."
        title="No graph rendering required for the MVP shell"
      />
    </div>
  );
}
