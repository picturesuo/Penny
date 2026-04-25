import Link from "next/link";

import styles from "./Onboarding.module.css";

type IconName =
  | "book"
  | "brain"
  | "chevron-down"
  | "chevron-right"
  | "folder"
  | "message"
  | "panel"
  | "plus"
  | "search"
  | "send"
  | "target";

type SidebarMode = {
  href: string;
  icon: IconName;
  isActive?: boolean;
  label: string;
};

type RecentItem = {
  label: string;
  time: string;
};

const sidebarModes: SidebarMode[] = [
  {
    href: "/app?mode=brain",
    icon: "brain",
    isActive: true,
    label: "Second Brain",
  },
  {
    href: "/app?mode=challenge",
    icon: "target",
    label: "Test",
  },
  {
    href: "/app?mode=learn",
    icon: "book",
    label: "Learn",
  },
];

const recentItems: RecentItem[] = [
  { label: "Marketing strategy ideas", time: "2h ago" },
  { label: "User research notes", time: "1d ago" },
  { label: "Study plan for exams", time: "2d ago" },
  { label: "Project roadmap", time: "3d ago" },
  { label: "Notes on personal finance", time: "5d ago" },
];

const promptModes = [
  { href: "/app?mode=brain", icon: "brain" as const, label: "Brain" },
  { href: "/app?mode=challenge", icon: "target" as const, label: "Challenge" },
  { href: "/app?mode=learn", icon: "book" as const, label: "Learn" },
];

function Icon({ name }: { name: IconName }) {
  const common = {
    "aria-hidden": true,
    className: styles.icon,
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
    viewBox: "0 0 24 24",
  };

  if (name === "book") {
    return (
      <svg {...common}>
        <path d="M4.5 5.6c2.3-.6 4.3-.2 6 1.1v12.1c-1.7-1.2-3.7-1.6-6-1.1V5.6Z" />
        <path d="M19.5 5.6c-2.3-.6-4.3-.2-6 1.1v12.1c1.7-1.2 3.7-1.6 6-1.1V5.6Z" />
      </svg>
    );
  }

  if (name === "brain") {
    return (
      <svg {...common}>
        <path d="M9.2 5.5A3 3 0 0 0 5.8 8a3.1 3.1 0 0 0-1.4 5.6A3.6 3.6 0 0 0 8 18.5a2.9 2.9 0 0 0 2.7-1.7V7.1a2.7 2.7 0 0 0-1.5-1.6Z" />
        <path d="M14.8 5.5A3 3 0 0 1 18.2 8a3.1 3.1 0 0 1 1.4 5.6 3.6 3.6 0 0 1-3.6 4.9 2.9 2.9 0 0 1-2.7-1.7V7.1a2.7 2.7 0 0 1 1.5-1.6Z" />
        <path d="M7.1 11.1c1 .2 1.7.8 2 1.8" />
        <path d="M16.9 11.1c-1 .2-1.7.8-2 1.8" />
      </svg>
    );
  }

  if (name === "chevron-down") {
    return (
      <svg {...common}>
        <path d="m7 10 5 5 5-5" />
      </svg>
    );
  }

  if (name === "chevron-right") {
    return (
      <svg {...common}>
        <path d="m9 6 6 6-6 6" />
      </svg>
    );
  }

  if (name === "folder") {
    return (
      <svg {...common}>
        <path d="M3.8 7.2h6l1.7 2h8.7v8.9a2 2 0 0 1-2 2H5.8a2 2 0 0 1-2-2V7.2Z" />
        <path d="M3.8 7.2V5.9a2 2 0 0 1 2-2h3.1l1.6 1.7" />
      </svg>
    );
  }

  if (name === "message") {
    return (
      <svg {...common}>
        <path d="M5.4 6.5h13.2a2.4 2.4 0 0 1 2.4 2.4v5.2a2.4 2.4 0 0 1-2.4 2.4H9.2l-4.2 3v-3A2.4 2.4 0 0 1 3 14.1V8.9a2.4 2.4 0 0 1 2.4-2.4Z" />
      </svg>
    );
  }

  if (name === "panel") {
    return (
      <svg {...common}>
        <rect width="14" height="16" x="5" y="4" rx="2" />
        <path d="M9 4v16" />
      </svg>
    );
  }

  if (name === "plus") {
    return (
      <svg {...common}>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </svg>
    );
  }

  if (name === "search") {
    return (
      <svg {...common}>
        <circle cx="10.6" cy="10.6" r="5.8" />
        <path d="m15.1 15.1 4 4" />
      </svg>
    );
  }

  if (name === "send") {
    return (
      <svg {...common}>
        <path d="M12 19V5" />
        <path d="m6.5 10.5 5.5-5.5 5.5 5.5" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="7.2" />
      <path d="M12 7.8v4.5l3.1 1.8" />
      <path d="M5.2 9.2 3.5 7.5" />
      <path d="M18.8 9.2 20.5 7.5" />
    </svg>
  );
}

function PennyMark() {
  return (
    <span className={styles.logoMark} aria-hidden="true">
      <span />
    </span>
  );
}

export function Onboarding() {
  return (
    <main className={styles.terminal}>
      <aside className={styles.sidebar} aria-label="Penny navigation">
        <div className={styles.sidebarHeader}>
          <Link className={styles.brand} href="/" aria-label="Penny home">
            <PennyMark />
            <span>Penny</span>
          </Link>
          <button className={styles.iconButton} type="button" aria-label="Collapse sidebar">
            <Icon name="panel" />
          </button>
        </div>

        <Link className={styles.newChat} href="/app?mode=brain">
          <Icon name="plus" />
          <span>New Chat</span>
        </Link>

        <Link className={styles.searchLink} href="/app?mode=brain">
          <Icon name="search" />
          <span>Search chats</span>
        </Link>

        <nav className={styles.section} aria-label="Modes">
          <p className={styles.sectionLabel}>Modes</p>
          <div className={styles.navList}>
            {sidebarModes.map((mode) => (
              <Link
                key={mode.label}
                className={styles.navItem}
                data-active={mode.isActive ? "true" : undefined}
                href={mode.href}
              >
                <Icon name={mode.icon} />
                <span>{mode.label}</span>
              </Link>
            ))}
          </div>
        </nav>

        <nav className={styles.section} aria-label="Projects">
          <p className={styles.sectionLabel}>Projects</p>
          <Link className={styles.projectItem} href="/app?mode=brain">
            <Icon name="folder" />
            <span>Projects</span>
            <Icon name="chevron-right" />
          </Link>
          <Link className={styles.projectItem} href="/app?mode=brain">
            <Icon name="plus" />
            <span>New Project</span>
          </Link>
        </nav>

        <section className={styles.section} aria-labelledby="recent-title">
          <p className={styles.sectionLabel} id="recent-title">
            Recents
          </p>
          <div className={styles.recentList}>
            {recentItems.map((item) => (
              <Link className={styles.recentItem} href="/app?mode=brain" key={item.label}>
                <Icon name="message" />
                <span>{item.label}</span>
                <time>{item.time}</time>
              </Link>
            ))}
          </div>
          <Link className={styles.viewAll} href="/app?mode=brain">
            <span>View all</span>
            <Icon name="chevron-right" />
          </Link>
        </section>

        <button className={styles.account} type="button" aria-label="Open account menu">
          <span className={styles.avatar}>A</span>
          <span className={styles.accountText}>
            <strong>Alex</strong>
            <span>Pro Plan</span>
          </span>
          <Icon name="chevron-down" />
        </button>
      </aside>

      <section className={styles.stage} aria-labelledby="terminal-title">
        <div className={styles.markCloud} aria-hidden="true">
          <span className={styles.heroMark}>
            <PennyMark />
          </span>
        </div>

        <div className={styles.heroText}>
          <h1 id="terminal-title">What are we thinking about today?</h1>
          <p>Your second brain for clarity, challenge, and growth.</p>
        </div>

        <form className={styles.composer} action="/app" aria-label="Start a Penny session">
          <textarea
            aria-label="Ask Penny"
            className={styles.promptInput}
            name="q"
            placeholder="Ask anything, explore an idea, or tackle a challenge..."
            rows={3}
          />

          <div className={styles.composerActions}>
            <button className={styles.attachButton} type="button" aria-label="Attach context">
              <Icon name="plus" />
            </button>

            <div className={styles.modePills} aria-label="Choose mode">
              {promptModes.map((mode, index) => (
                <Link className={styles.modePill} data-active={index === 0 ? "true" : undefined} href={mode.href} key={mode.label}>
                  <Icon name={mode.icon} />
                  <span>{mode.label}</span>
                </Link>
              ))}
            </div>

            <button className={styles.sendButton} type="submit" aria-label="Start thinking">
              <Icon name="send" />
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

export default Onboarding;
