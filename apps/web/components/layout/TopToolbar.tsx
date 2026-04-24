import { Button, Input } from "../ui";

export function TopToolbar() {
  return (
    <header className="top-toolbar">
      <div className="top-toolbar__breadcrumbs" aria-label="Breadcrumb">
        <a href="#">Penny</a>
        <span aria-hidden="true">/</span>
        <a href="#">Market thesis</a>
        <span aria-hidden="true">/</span>
        <span>Brain</span>
      </div>

      <div className="top-toolbar__actions">
        <Input aria-label="Search" className="top-toolbar__search" placeholder="Search thoughts" type="search" />
        <Button icon="F" variant="secondary">Filter</Button>
        <Button icon="+">New Thought</Button>
        <Button aria-label="Settings" className="ui-button--icon-only" icon="S" variant="ghost">
          <span className="ui-sr-only">Settings</span>
        </Button>
      </div>
    </header>
  );
}
