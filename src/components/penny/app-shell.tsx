"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  BrainCircuit,
  ChevronRight,
  Compass,
  GraduationCap,
  ShieldAlert,
} from "lucide-react";
import { PennyLogo } from "@/components/penny/penny-logo";
import { OrnamentalGraph } from "@/components/penny/ornamental-graph";
import { Nav } from "@/components/penny/nav";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

type AppShellProps = {
  children: React.ReactNode;
  userEmail: string;
  userId: string;
};

type ModeKey = "brain" | "challenge" | "learn";

type ModeRailItem = {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  accent: string;
  mode: ModeKey;
};

type Breadcrumb = {
  label: string;
};

type SurfaceSummary = {
  badge: string;
  title: string;
  description: string;
  inspectorNotes: string[];
};

export function AppShell({ children, userEmail, userId }: AppShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeMode = deriveActiveMode(pathname, searchParams);
  const breadcrumbs = buildBreadcrumbs(activeMode);
  const surface = describeSurface(pathname);
  const modeRailItems = buildModeRail(pathname, searchParams);
  const showBrainInspector = activeMode === "brain" && (pathname === "/app" || pathname === "/dashboard");

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8f2e8_0%,#f5efe4_28%,#f8f6f1_100%)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[26rem] bg-[radial-gradient(circle_at_top_left,rgba(214,162,82,0.12),transparent_50%),radial-gradient(circle_at_top_right,rgba(63,92,138,0.08),transparent_40%)]" />
      <div className="relative mx-auto max-w-[1600px] px-4 py-4 sm:px-6 lg:px-8">
        <div className="sticky top-0 z-40 space-y-3 pb-3 backdrop-blur supports-[backdrop-filter]:bg-[rgba(248,242,232,0.72)]">
          <Card className="penny-card px-4 py-3 shadow-[var(--shadow-card)]">
            <Nav userId={userId} userEmail={userEmail} />
          </Card>

          <Card className="penny-card px-4 py-3 shadow-[var(--shadow-card)]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--muted-ink)]">
                <Badge className="bg-[var(--accent-paper)] text-[var(--ink)]">Persistent breadcrumb</Badge>
                {breadcrumbs.map((crumb, index) => (
                  <div key={crumb.label} className="flex items-center gap-2">
                    {index > 0 ? <ChevronRight className="size-4 text-[var(--muted-ink)]" /> : null}
                    <span className={index === breadcrumbs.length - 1 ? "font-medium text-[var(--ink)]" : "text-[var(--muted-ink)]"}>
                      {crumb.label}
                    </span>
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
              <Card className="penny-card p-5 shadow-[var(--shadow-card)]">
                <PennyLogo
                  showLabel
                  className="items-center"
                  markClassName="size-11 rounded-[14px]"
                  labelClassName="text-xl font-medium tracking-[-0.01em]"
                />
                <p className="penny-label mt-5">Mode rail</p>
                <h2 className="mt-2 text-lg font-semibold text-[var(--ink)]">Three rooms, one product</h2>
                <div className="mt-4 space-y-2.5">
                  {modeRailItems.map((item) => {
                    const Icon = item.icon;
                    const active = item.mode === activeMode;

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={[
                          "block rounded-[var(--radius-lg)] border px-4 py-3.5 transition",
                          active ? "text-[var(--paper)]" : "bg-[var(--panel)] text-[var(--ink)] hover:bg-white/96",
                        ].join(" ")}
                        style={
                          active
                            ? {
                                borderColor: item.accent,
                                background: `color-mix(in srgb, ${item.accent} 88%, white 12%)`,
                                boxShadow: `0 10px 24px color-mix(in srgb, ${item.accent} 16%, transparent)`,
                              }
                            : {
                                borderColor: "var(--line)",
                              }
                        }
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className="flex size-10 shrink-0 items-center justify-center rounded-full border"
                            style={
                              active
                                ? {
                                    borderColor: "rgba(255,255,255,0.22)",
                                    backgroundColor: "rgba(255,255,255,0.18)",
                                  }
                                : {
                                    color: item.accent,
                                    borderColor: "var(--line)",
                                    backgroundColor: "rgba(255,255,255,0.72)",
                                  }
                            }
                          >
                            <Icon className="size-4.5" />
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-sm font-medium">{item.label}</span>
                              {active ? <span className="text-[11px] uppercase tracking-[0.16em] text-white/72">Active</span> : null}
                            </div>
                            <p className={active ? "mt-1 text-sm leading-6 text-white/78" : "mt-1 text-sm leading-6 text-[var(--muted-ink)]"}>
                              {item.description}
                            </p>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </Card>

              <Card className="penny-card-soft p-5">
                <p className="penny-label">Three-room feeling</p>
                <div className="mt-4 space-y-3 text-sm leading-6 text-[var(--muted-ink)]">
                  <p>
                    Brain, Challenge, and Learn stay inside one frame so the product feels like three connected rooms rather than separate apps.
                  </p>
                  <p>
                    The active room gets the accent fill. The inactive rooms stay pale and bordered, so the shell signals mode without changing the underlying structure.
                  </p>
                </div>
              </Card>
            </div>
          </aside>

          <main className="order-1 min-w-0 xl:order-2">{children}</main>

          <aside className="order-3">
            <div className="xl:sticky xl:top-[11.5rem] space-y-4">
              {showBrainInspector ? <BrainClaimInspector /> : <GenericShellInspector surface={surface} />}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function buildBreadcrumbs(activeMode: ModeKey): Breadcrumb[] {
  const breadcrumbs: Breadcrumb[] = [
    { label: "Work" },
    { label: "Market Thesis" },
    { label: "Distribution Claim" },
  ];

  if (activeMode === "learn") {
    breadcrumbs.push({ label: "Network Effects" });
  }

  return breadcrumbs;
}

function BrainClaimInspector() {
  return (
    <>
      <Card className="penny-card p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-2">
          <Badge className="bg-[color:rgba(185,106,69,0.12)] text-[var(--brain)]">Selected claim</Badge>
          <Badge className="bg-[var(--panel)] text-[var(--ink)]">Right inspector</Badge>
        </div>
        <h2 className="mt-3 font-display text-[1.9rem] leading-[1.03] text-[var(--ink)]">
          Distribution only compounds if collaboration itself becomes part of acquisition.
        </h2>

        <div className="penny-card-inset mt-5 p-4">
          <p className="penny-label">Confidence</p>
          <div className="mt-3 flex items-end justify-between gap-4">
            <p className="text-4xl font-semibold leading-none text-[var(--ink)]">74%</p>
            <p className="text-sm leading-6 text-[var(--muted-ink)]">Moderately defended, still sensitive to retention evidence.</p>
          </div>
        </div>

        <div className="mt-5">
          <p className="penny-label">Key connections</p>
          <div className="penny-card-soft mt-3 p-4">
            <div className="penny-card-plain px-4 py-3">
              <OrnamentalGraph variant="brain-map" accent="var(--brain)" className="mx-auto h-28 max-w-[16rem]" />
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {["Claim", "Market thesis", "Network effects", "Retention loop"].map((label, index) => (
                <div
                  key={label}
                  className="rounded-full border border-[var(--line)] bg-white px-3 py-2 text-center text-[11px] uppercase tracking-[0.14em]"
                  style={index === 0 ? { color: "var(--brain)", background: "color-mix(in srgb, var(--brain) 14%, white)" } : undefined}
                >
                  {label}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5">
          <p className="penny-label">Dependents</p>
          <div className="mt-3 space-y-2">
            {[
              "Pricing power depends on collaboration density.",
              "Investor narrative depends on a defensible moat claim.",
              "Distribution plan depends on product-led activation.",
            ].map((entry) => (
              <div key={entry} className="penny-card-plain px-4 py-3 text-sm leading-6 text-[var(--ink)]">
                {entry}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <div className="penny-card-plain p-4">
            <p className="penny-label">Last challenged</p>
            <p className="mt-2 text-sm font-medium text-[var(--ink)]">Today, 9:40 AM</p>
            <p className="mt-1 text-sm leading-6 text-[var(--muted-ink)]">Counterargument targeted whether the loop is retention-led or acquisition-led.</p>
          </div>

          <div className="penny-card-soft p-4">
            <div className="flex items-center gap-2">
              <Compass className="size-4 text-[var(--brain)]" />
              <p className="penny-label">Tiny mini-map</p>
            </div>
            <div className="penny-card-plain mt-3 h-24 p-3">
              <OrnamentalGraph variant="mini-map" accent="var(--brain)" className="mx-auto h-full max-w-[10rem]" />
            </div>
          </div>
        </div>
      </Card>
    </>
  );
}

function GenericShellInspector({ surface }: { surface: SurfaceSummary }) {
  return (
    <>
      <Card className="penny-card p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-2">
          <Badge className="bg-[#e7defa] text-[#5c4c88]">{surface.badge}</Badge>
          <Badge className="bg-[var(--panel)] text-[var(--ink)]">Right inspector</Badge>
        </div>
        <h2 className="mt-3 text-xl font-semibold text-[var(--ink)]">{surface.title}</h2>
        <p className="mt-2 text-sm leading-7 text-[var(--muted-ink)]">{surface.description}</p>
      </Card>

      <Card className="penny-card p-5 shadow-[var(--shadow-card)]">
        <p className="penny-label">Inspector notes</p>
        <div className="mt-4 space-y-3">
          {surface.inspectorNotes.map((note) => (
            <div key={note} className="penny-card-inset px-4 py-3 text-sm leading-6 text-[var(--ink)]">
              {note}
            </div>
          ))}
        </div>
      </Card>

      <Card className="penny-card-soft p-5">
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-[var(--accent-paper)] p-2 text-[var(--ink)]">
            <Compass className="size-4" />
          </span>
          <div>
            <p className="penny-label">Why this shell</p>
            <p className="mt-1 text-sm font-medium text-[var(--ink)]">Persistent structure beats page sprawl.</p>
          </div>
        </div>
        <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">
          The app can add richer route-specific inspectors later without changing the frame or retraining the user.
        </p>
      </Card>
    </>
  );
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

function deriveActiveMode(pathname: string, searchParams: URLSearchParams): ModeKey {
  if (pathname.startsWith("/app/lessons")) {
    return "learn";
  }

  if (pathname.startsWith("/maps/") || pathname.startsWith("/app/maps/")) {
    const launcher = searchParams.get("launcher");
    if (launcher === "challenge") return "challenge";
    if (launcher === "learn") return "learn";
    return "brain";
  }

  if (pathname === "/app" || pathname === "/dashboard") {
    const intent = searchParams.get("intent");
    if (intent === "challenge") return "challenge";
    if (intent === "learn") return "learn";
  }

  return "brain";
}

function buildModeRail(pathname: string, searchParams: URLSearchParams): ModeRailItem[] {
  return [
    {
      href: buildModeHref(pathname, searchParams, "brain"),
      icon: BrainCircuit,
      label: "Brain",
      description: "Capture and structure the graph.",
      accent: "var(--brain)",
      mode: "brain",
    },
    {
      href: buildModeHref(pathname, searchParams, "challenge"),
      icon: ShieldAlert,
      label: "Challenge",
      description: "Pressure-test one claim deeply.",
      accent: "var(--challenge)",
      mode: "challenge",
    },
    {
      href: buildModeHref(pathname, searchParams, "learn"),
      icon: GraduationCap,
      label: "Learn",
      description: "Close the exact knowledge gap.",
      accent: "var(--learn)",
      mode: "learn",
    },
  ];
}

function buildModeHref(pathname: string, searchParams: URLSearchParams, mode: ModeKey) {
  const params = new URLSearchParams(searchParams.toString());

  if (pathname.startsWith("/maps/") || pathname.startsWith("/app/maps/")) {
    if (mode === "brain") {
      params.delete("launcher");
    } else {
      params.set("launcher", mode);
    }
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  if (mode === "brain") {
    params.delete("intent");
  } else {
    params.set("intent", mode);
  }
  const query = params.toString();
  return query ? `/app?${query}` : "/app";
}
