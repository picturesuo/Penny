"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpenText,
  BrainCircuit,
  ChevronRight,
  Compass,
  Search,
  Settings2,
  TimerReset,
} from "lucide-react";
import { Nav } from "@/components/penny/nav";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

type AppShellProps = {
  children: React.ReactNode;
  userEmail: string;
  userId: string;
};

type ShellNavItem = {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  match: (pathname: string) => boolean;
};

type Breadcrumb = {
  href: string;
  label: string;
};

type SurfaceSummary = {
  badge: string;
  title: string;
  description: string;
  inspectorNotes: string[];
};

const shellNavItems: ShellNavItem[] = [
  {
    href: "/app",
    icon: BrainCircuit,
    label: "Brain",
    match: (pathname) => pathname === "/app" || pathname === "/dashboard" || pathname.startsWith("/maps/"),
  },
  {
    href: "/app/search",
    icon: Search,
    label: "Search",
    match: (pathname) => pathname.startsWith("/app/search"),
  },
  {
    href: "/app/lessons",
    icon: BookOpenText,
    label: "Lessons",
    match: (pathname) => pathname.startsWith("/app/lessons"),
  },
  {
    href: "/app/velocity",
    icon: TimerReset,
    label: "Velocity",
    match: (pathname) => pathname.startsWith("/app/velocity"),
  },
  {
    href: "/app/settings",
    icon: Settings2,
    label: "Settings",
    match: (pathname) => pathname.startsWith("/app/settings"),
  },
];

export function AppShell({ children, userEmail, userId }: AppShellProps) {
  const pathname = usePathname();
  const breadcrumbs = buildBreadcrumbs(pathname);
  const surface = describeSurface(pathname);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8f2e8_0%,#f5efe4_28%,#f8f6f1_100%)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[26rem] bg-[radial-gradient(circle_at_top_left,rgba(214,162,82,0.12),transparent_50%),radial-gradient(circle_at_top_right,rgba(63,92,138,0.08),transparent_40%)]" />
      <div className="relative mx-auto max-w-[1600px] px-4 py-4 sm:px-6 lg:px-8">
        <div className="sticky top-0 z-40 space-y-3 pb-3 backdrop-blur supports-[backdrop-filter]:bg-[rgba(248,242,232,0.72)]">
          <Card className="border-black/8 bg-white/88 px-4 py-3 shadow-[0_14px_34px_rgba(34,39,46,0.08)]">
            <Nav userId={userId} userEmail={userEmail} />
          </Card>

          <Card className="border-black/8 bg-white/78 px-4 py-3 shadow-[0_10px_28px_rgba(34,39,46,0.05)]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--muted-ink)]">
                <Badge className="bg-[var(--accent-paper)] text-[var(--ink)]">Persistent breadcrumb</Badge>
                {breadcrumbs.map((crumb, index) => (
                  <div key={`${crumb.href}:${crumb.label}`} className="flex items-center gap-2">
                    {index > 0 ? <ChevronRight className="size-4 text-[var(--muted-ink)]" /> : null}
                    {index === breadcrumbs.length - 1 ? (
                      <span className="font-medium text-[var(--ink)]">{crumb.label}</span>
                    ) : (
                      <Link href={crumb.href} className="transition hover:text-[var(--ink)]">
                        {crumb.label}
                      </Link>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-sm text-[var(--muted-ink)]">
                One shell: navigate on the left, work in the center, inspect on the right.
              </p>
            </div>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[240px_minmax(0,1fr)_300px]">
          <aside className="order-2 xl:order-1">
            <div className="xl:sticky xl:top-[11.5rem] space-y-4">
              <Card className="border-black/8 bg-white/80 p-5 shadow-[0_12px_28px_rgba(34,39,46,0.05)]">
                <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--muted-ink)]">Left rail</p>
                <h2 className="mt-2 text-lg font-semibold text-[var(--ink)]">One shared workspace</h2>
                <div className="mt-4 space-y-2">
                  {shellNavItems.map((item) => {
                    const Icon = item.icon;
                    const active = item.match(pathname);

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={[
                          "flex items-center justify-between rounded-[18px] border px-4 py-3 text-sm transition",
                          active
                            ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]"
                            : "border-black/8 bg-[var(--panel)] text-[var(--ink)] hover:border-black/16 hover:bg-white",
                        ].join(" ")}
                      >
                        <span className="flex items-center gap-3">
                          <Icon className="size-4" />
                          {item.label}
                        </span>
                        <ChevronRight className="size-4 opacity-70" />
                      </Link>
                    );
                  })}
                </div>
              </Card>

              <Card className="border-black/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.86),rgba(245,236,221,0.92))] p-5 shadow-[0_12px_28px_rgba(34,39,46,0.05)]">
                <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--muted-ink)]">Modes inside the shell</p>
                <div className="mt-4 space-y-3 text-sm leading-6 text-[var(--muted-ink)]">
                  <p>
                    Brain, Challenge, and Learn stay inside one frame so the user never loses navigation, context, or inspection state.
                  </p>
                  <p>
                    The shell carries the route memory. The center panel changes, but the scaffolding stays put.
                  </p>
                </div>
              </Card>
            </div>
          </aside>

          <main className="order-1 min-w-0 xl:order-2">{children}</main>

          <aside className="order-3">
            <div className="xl:sticky xl:top-[11.5rem] space-y-4">
              <Card className="border-black/8 bg-white/84 p-5 shadow-[0_12px_28px_rgba(34,39,46,0.05)]">
                <div className="flex items-center gap-2">
                  <Badge className="bg-[#e7defa] text-[#5c4c88]">{surface.badge}</Badge>
                  <Badge className="bg-[var(--panel)] text-[var(--ink)]">Right inspector</Badge>
                </div>
                <h2 className="mt-3 text-xl font-semibold text-[var(--ink)]">{surface.title}</h2>
                <p className="mt-2 text-sm leading-7 text-[var(--muted-ink)]">{surface.description}</p>
              </Card>

              <Card className="border-black/8 bg-white/80 p-5 shadow-[0_12px_28px_rgba(34,39,46,0.05)]">
                <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--muted-ink)]">Inspector notes</p>
                <div className="mt-4 space-y-3">
                  {surface.inspectorNotes.map((note) => (
                    <div key={note} className="rounded-[18px] bg-[var(--panel)] px-4 py-3 text-sm leading-6 text-[var(--ink)]">
                      {note}
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="border-black/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(240,244,247,0.92))] p-5 shadow-[0_12px_28px_rgba(34,39,46,0.05)]">
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-[var(--accent-paper)] p-2 text-[var(--ink)]">
                    <Compass className="size-4" />
                  </span>
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--muted-ink)]">Why this shell</p>
                    <p className="mt-1 text-sm font-medium text-[var(--ink)]">Persistent structure beats page sprawl.</p>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">
                  The app can add richer route-specific inspectors later without changing the frame or retraining the user.
                </p>
              </Card>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function buildBreadcrumbs(pathname: string): Breadcrumb[] {
  if (pathname.startsWith("/maps/")) {
    return [
      { href: "/app", label: "Brain" },
      { href: "/app", label: "Maps" },
      { href: pathname, label: "Map workspace" },
    ];
  }

  if (pathname === "/dashboard") {
    return [{ href: "/dashboard", label: "Brain" }];
  }

  if (!pathname.startsWith("/app")) {
    return [{ href: pathname, label: "Penny" }];
  }

  const segments = pathname.split("/").filter(Boolean).slice(1);
  const breadcrumbs: Breadcrumb[] = [{ href: "/app", label: "Brain" }];
  let currentPath = "/app";

  for (const segment of segments) {
    currentPath += `/${segment}`;
    breadcrumbs.push({
      href: currentPath,
      label: segmentLabel(segment),
    });
  }

  return breadcrumbs;
}

function describeSurface(pathname: string): SurfaceSummary {
  if (pathname.startsWith("/maps/")) {
    return {
      badge: "Map",
      title: "Map workspace",
      description: "The center panel can stay focused on one map while navigation and inspection remain stable around it.",
      inspectorNotes: [
        "Keep Brain, Challenge, and Learn inside this frame instead of splintering them into route-level silos.",
        "Use the map page to work one claim deeply without losing the persistent breadcrumb or rails.",
        "Route-specific inspectors can get richer later; the shell should not need a second redesign.",
      ],
    };
  }

  if (pathname.startsWith("/app/search")) {
    return {
      badge: "Search",
      title: "Archive recovery",
      description: "Search lives in the same shell so the user can recover prior reasoning without feeling pushed into a different product.",
      inspectorNotes: [
        "Use deterministic archive search before inventing another navigation surface.",
        "Keep recovered claims and sessions visually tied to the same workspace frame.",
        "The breadcrumb should make it obvious how to get back to Brain without disorientation.",
      ],
    };
  }

  if (pathname.startsWith("/app/settings")) {
    return {
      badge: "Settings",
      title: "Preference controls",
      description: "Settings inherit the same rails so profile and workflow configuration still feel like part of the product, not a detached admin page.",
      inspectorNotes: [
        "Persisting the shell keeps account and workflow preferences inside the same mental model.",
        "The right inspector can later surface route-specific explanation or warnings without changing page structure.",
        "The left rail remains the stable way back into active work.",
      ],
    };
  }

  if (pathname.startsWith("/app/lessons")) {
    return {
      badge: "Lessons",
      title: "Lesson library",
      description: "Resolved insight belongs in the same shell as live thinking so the archive compounds instead of fragmenting.",
      inspectorNotes: [
        "Lessons should feel retrieved from the same system that produced them.",
        "A shared shell makes archive review feel adjacent to active work instead of archival exile.",
        "Later inspectors can show lesson provenance or reuse prompts without moving the route.",
      ],
    };
  }

  if (pathname.startsWith("/app/velocity")) {
    return {
      badge: "Velocity",
      title: "Thinking rate",
      description: "The velocity view stays inside the same shell so performance feedback remains part of the workspace rather than a separate dashboard product.",
      inspectorNotes: [
        "Use the shell to keep reflective metrics adjacent to live claim work.",
        "The breadcrumb should make velocity feel like a lens on Brain, not a competing destination.",
        "Future inspector panels can explain trends or anomalies without page-level layout churn.",
      ],
    };
  }

  if (pathname.startsWith("/app/session")) {
    return {
      badge: "Session",
      title: "Session workspace",
      description: "Sessions can reuse the same frame so deep work inherits the same navigation and inspection habits.",
      inspectorNotes: [
        "A session route should still feel like the same product surface.",
        "The right inspector can later hold timer, intention, and close-out context without reworking the page grid.",
        "Breadcrumb persistence helps the user understand whether they are in Brain or a single session slice.",
      ],
    };
  }

  return {
    badge: "Brain",
    title: "Shared home shell",
    description: "This is the reusable frame: top bar, left rail, center panel, right inspector, and a breadcrumb that persists while the middle content changes.",
    inspectorNotes: [
      "Start with one shared shell before splitting Brain, Challenge, and Learn into route-level destinations.",
      "The center panel can host launchers, maps, or focused lanes while the shell keeps the product recognizable.",
      "Once the frame is stable, individual surfaces can become more intentional without reopening the overall architecture.",
    ],
  };
}

function segmentLabel(segment: string) {
  if (segment === "search") return "Search";
  if (segment === "settings") return "Settings";
  if (segment === "lessons") return "Lessons";
  if (segment === "velocity") return "Velocity";
  if (segment === "session") return "Session";
  if (segment === "identity") return "Identity";
  if (segment === "counterfactuals") return "Counterfactuals";
  if (segment === "base-rates") return "Base rates";
  if (segment === "unlocks") return "Unlocks";
  if (segment === "new") return "New map";
  return "Map";
}
