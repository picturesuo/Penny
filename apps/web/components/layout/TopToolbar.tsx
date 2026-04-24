"use client";

import { Button } from "../ui";
import { CommandPalette } from "../../src/components/command/CommandPalette";
import { useCommandPalette, type CommandPaletteItem } from "../../src/hooks/useCommandPalette";

const defaultCommandItems: CommandPaletteItem[] = [
  {
    id: "session:brain",
    type: "session",
    title: "Brain session",
    subtitle: "Jump to Brain",
    href: "/workspace?mode=brain",
    keywords: ["workspace", "mode", "thoughts"],
    onSelect: () => {
      window.location.assign("/workspace?mode=brain");
    },
  },
  {
    id: "session:challenge",
    type: "session",
    title: "Challenge session",
    subtitle: "Jump to Challenge",
    href: "/workspace?mode=challenge",
    keywords: ["workspace", "mode", "claims"],
    onSelect: () => {
      window.location.assign("/workspace?mode=challenge");
    },
  },
  {
    id: "session:learn",
    type: "session",
    title: "Learn session",
    subtitle: "Jump to Learn",
    href: "/workspace?mode=learn",
    keywords: ["workspace", "mode"],
    onSelect: () => {
      window.location.assign("/workspace?mode=learn");
    },
  },
  {
    id: "map:market-thesis",
    type: "map",
    title: "Market thesis",
    subtitle: "Current map",
    confidence: null,
    href: "/workspace?mode=brain",
    keywords: ["brain", "workspace"],
    onSelect: () => {
      window.location.assign("/workspace?mode=brain");
    },
  },
  {
    id: "thought:active",
    type: "thought",
    title: "Shape one thought until it is clear enough to challenge.",
    subtitle: "Active thought",
    confidence: null,
    href: "/workspace?mode=brain",
    keywords: ["brain", "claim"],
    onSelect: () => {
      window.location.assign("/workspace?mode=brain");
    },
  },
  {
    id: "claim:highest-leverage",
    type: "claim",
    title: "Start with the highest leverage claim",
    subtitle: "Workspace claim",
    confidence: null,
    href: "/workspace?mode=brain",
    keywords: ["thought", "brain", "challenge"],
    onSelect: () => {
      window.location.assign("/workspace?mode=brain");
    },
  },
];

export function TopToolbar() {
  const commandPalette = useCommandPalette({ items: defaultCommandItems });

  return (
    <header className="top-toolbar">
      <CommandPalette
        isOpen={commandPalette.isOpen}
        items={commandPalette.filteredItems}
        onClose={commandPalette.close}
        onSelectItem={commandPalette.selectItem}
        query={commandPalette.query}
        setQuery={commandPalette.setQuery}
      />
      <div className="top-toolbar__breadcrumbs" aria-label="Breadcrumb">
        <a href="#">Penny</a>
        <span aria-hidden="true">/</span>
        <a href="#">Market thesis</a>
        <span aria-hidden="true">/</span>
        <span>Brain</span>
      </div>

      <div className="top-toolbar__actions">
        <button className="top-toolbar__command-button" type="button" onClick={commandPalette.open}>
          <span>Search your brain…</span>
          <kbd>Cmd/Ctrl K</kbd>
        </button>
        <Button icon="F" variant="secondary">Filter</Button>
        <Button icon="+">New Thought</Button>
        <Button aria-label="Settings" className="ui-button--icon-only" icon="S" variant="ghost">
          <span className="ui-sr-only">Settings</span>
        </Button>
      </div>
    </header>
  );
}
