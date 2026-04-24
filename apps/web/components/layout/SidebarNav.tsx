import { modeAccents, type PennyMode } from "../../lib/design/tokens";
import { Badge } from "../ui";
import { PennyLogo } from "./PennyLogo";

const modes: PennyMode[] = ["brain", "challenge", "learn"];

const spheres = ["Market thesis", "Product beliefs", "Open questions"];
const sessions = ["Pitch review", "Pricing model", "Risk audit"];

export function SidebarNav() {
  return (
    <aside className="app-sidebar" aria-label="Penny navigation">
      <PennyLogo />

      <nav className="app-sidebar__nav" aria-label="Modes">
        {modes.map((mode) => (
          <a
            aria-current={mode === "brain" ? "page" : undefined}
            className="app-sidebar__link"
            data-mode={mode}
            data-active={mode === "brain"}
            href="#"
            key={mode}
          >
            <span className="app-sidebar__dot" aria-hidden="true" />
            <span>{modeAccents[mode].label}</span>
          </a>
        ))}
      </nav>

      <section className="app-sidebar__section" aria-labelledby="spheres-title">
        <div className="app-sidebar__section-header">
          <h2 id="spheres-title">Spheres</h2>
          <Badge>3</Badge>
        </div>
        <div className="app-sidebar__stack">
          {spheres.map((sphere) => (
            <a href="#" key={sphere}>
              {sphere}
            </a>
          ))}
        </div>
      </section>

      <section className="app-sidebar__section" aria-labelledby="sessions-title">
        <div className="app-sidebar__section-header">
          <h2 id="sessions-title">Recent sessions</h2>
        </div>
        <div className="app-sidebar__stack">
          {sessions.map((session) => (
            <a href="#" key={session}>
              {session}
            </a>
          ))}
        </div>
      </section>

      <footer className="app-sidebar__account">
        <span className="app-sidebar__avatar" aria-hidden="true">B</span>
        <div>
          <strong>Ben</strong>
          <span>Local workspace</span>
        </div>
      </footer>
    </aside>
  );
}
