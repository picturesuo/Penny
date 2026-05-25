import { PennyMark } from "./PennyMark";

interface HeaderProps {
  sessionLabel: string;
  thinkingLabel: string;
  activeItem?: string;
  onNavItemSelect?: (item: string) => void;
  onLogoSelect?: () => void;
}

export const navItems = ["Brain", "Create", "Learn"] as const;

export function Header({ sessionLabel, thinkingLabel, activeItem = "Brain", onNavItemSelect, onLogoSelect }: HeaderProps) {
  const editionDate = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date());

  return (
    <header className={`newspaper-header is-${activeItem.toLowerCase()}`}>
      <div className="masthead">
        <button className="brand" type="button" aria-label="Go to Penny home" onClick={onLogoSelect}>
          <PennyMark />
          <span className="brand-name">enny</span>
        </button>

        <nav className="nav-tabs" aria-label="Penny modes">
          {navItems.map((item) => (
            <button
              key={item}
              className={`nav-tab${item === activeItem ? " is-active" : ""}`}
              type="button"
              onClick={() => onNavItemSelect?.(item)}
            >
              {item}
            </button>
          ))}
        </nav>

        <div className="edition-block" aria-label={`${sessionLabel}. ${thinkingLabel}`}>
          <div className="edition-rules" aria-hidden="true">
            <span className="is-dark" />
            <span className="is-dark" />
            <span />
            <span />
            <span />
          </div>
          <p>{editionDate}</p>
          <p>Edition 3.0</p>
          <p className="sr-only">{sessionLabel}</p>
          <p className="sr-only">{thinkingLabel}</p>
        </div>
      </div>

      <div className="strapline">
        <span>FOR YOUR THOUGHTS</span>
        <span>IDEATION INSTRUMENT FOR BETTER DECISIONS</span>
      </div>
    </header>
  );
}
