"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Bell,
  BrainCircuit,
  ChevronRight,
  Compass,
  GraduationCap,
  Search,
  Settings2,
  ShieldAlert,
} from "lucide-react";
import { PennyLogo } from "@/components/penny/penny-logo";
import { OrnamentalGraph } from "@/components/penny/ornamental-graph";
import { NewMapButton } from "@/components/penny/new-map-modal";
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
  accent: string;
  mode: ModeKey;
};

type SphereRailItem = {
  label: string;
  active?: boolean;
};

type Breadcrumb = {
  label: string;
};

type SurfaceSummary = {
  title: string;
  description: string;
  notes: string[];
  accent: string;
};

const SPHERES: SphereRailItem[] = [
  { label: "Work", active: true },
  { label: "Writing" },
  { label: "Life" },
  { label: "Learning" },
  { label: "+ New Sphere" },
];

export function AppShell({ children, userEmail, userId }: AppShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeMode = deriveActiveMode(pathname, searchParams);
  const previousModeRef = useRef<ModeKey | null>(null);
  const [modeSwitching, setModeSwitching] = useState(false);
  const breadcrumbs = buildBreadcrumbs(activeMode);
  const surface = describeSurface(pathname, activeMode);
  const modeRailItems = buildModeRail(pathname, searchParams);
  const showBrainInspector = activeMode === "brain" && (pathname === "/app" || pathname === "/dashboard");
  const userInitials = userEmail
    .split("@")[0]
    .split(/[.\-_]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "P";

  useEffect(() => {
    if (previousModeRef.current == null) {
      previousModeRef.current = activeMode;
      return;
    }

    if (previousModeRef.current === activeMode) {
      return;
    }

    previousModeRef.current = activeMode;

    const frame = window.requestAnimationFrame(() => {
      setModeSwitching(true);
    });
    const timeout = window.setTimeout(() => {
      setModeSwitching(false);
    }, 190);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [activeMode]);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#faf6f1_0%,#f7f3ee_38%,#f5f0ea_100%)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[24rem] bg-[radial-gradient(circle_at_top_left,rgba(185,106,69,0.12),transparent_46%),radial-gradient(circle_at_top_right,rgba(95,143,120,0.08),transparent_38%)]" />
      <div className="relative mx-auto max-w-[1560px] px-4 py-4 sm:px-6 lg:px-8">
        <div className="grid gap-5 xl:grid-cols-[214px_minmax(0,1fr)]">
          <aside className="order-2 xl:order-1">
            <div className="space-y-4 xl:sticky xl:top-4">
              <Card className="penny-card px-4 py-5 shadow-[var(--shadow-card)]">
                <PennyLogo
                  showLabel
                  className="items-center justify-start"
                  markClassName="size-10 rounded-[12px]"
                  labelClassName="text-lg font-medium tracking-[-0.01em]"
                />

                <div className="mt-5 space-y-2">
                  {modeRailItems.map((item) => {
                    const Icon = item.icon;
                    const active = item.mode === activeMode;

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center gap-3 rounded-[16px] border px-3 py-3 transition"
                        style={
                          active
                            ? {
                                color: "#fffaf4",
                                borderColor: item.accent,
                                backgroundColor: item.accent,
                                boxShadow: `0 10px 24px color-mix(in srgb, ${item.accent} 18%, transparent)`,
                              }
                            : {
                                borderColor: "var(--line)",
                                backgroundColor: "rgba(255,255,255,0.72)",
                                color: "var(--ink)",
                              }
                        }
                      >
                        <span
                          className="flex size-8 shrink-0 items-center justify-center rounded-full border"
                          style={
                            active
                              ? {
                                  borderColor: "rgba(255,255,255,0.26)",
                                  backgroundColor: "rgba(255,255,255,0.16)",
                                }
                              : {
                                  borderColor: "var(--line)",
                                  backgroundColor: "var(--panel)",
                                  color: item.accent,
                                }
                          }
                        >
                          <Icon className="size-4" />
                        </span>
                        <span className={active ? "text-sm font-medium text-white" : "text-sm font-medium"}>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>

                <div className="mt-6 border-t border-[var(--line)] pt-5">
                  <p className="penny-label">Spheres</p>
                  <div className="mt-3 space-y-1.5">
                    {SPHERES.map((sphere) => (
                      <div
                        key={sphere.label}
                        className="flex items-center justify-between rounded-[14px] px-3 py-2.5"
                        style={sphere.active ? { backgroundColor: "rgba(185,106,69,0.08)" } : undefined}
                      >
                        <div className="flex items-center gap-2.5">
                          <span
                            className="size-2 rounded-full"
                            style={{
                              backgroundColor: sphere.active ? "var(--brain)" : "rgba(45,36,31,0.18)",
                            }}
                          />
                          <span className={sphere.active ? "text-sm font-medium text-[var(--ink)]" : "text-sm text-[var(--muted-ink)]"}>
                            {sphere.label}
                          </span>
                        </div>
                        {sphere.active ? <span className="size-1.5 rounded-full bg-[var(--brain)]" /> : null}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-6 flex items-center gap-2 border-t border-[var(--line)] pt-4">
                  <ShellIconLink href="/app/search" label="Search">
                    <Search className="size-4" />
                  </ShellIconLink>
                  <ShellIconLink href="/app/settings" label="Settings">
                    <Settings2 className="size-4" />
                  </ShellIconLink>
                  <div className="ml-auto flex size-8 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--panel)] text-[11px] font-semibold text-[var(--ink)]" title={userId}>
                    {userInitials}
                  </div>
                </div>
              </Card>
            </div>
          </aside>

          <div className="order-1 min-w-0 xl:order-2">
            <div className="sticky top-4 z-40 mb-5">
              <Card className="penny-card px-4 py-3 shadow-[var(--shadow-card)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-[var(--muted-ink)]">
                    {breadcrumbs.map((crumb, index) => (
                      <div key={crumb.label} className="flex items-center gap-2">
                        {index > 0 ? <ChevronRight className="size-4 text-[var(--muted-ink)]" /> : null}
                        <span className={index === breadcrumbs.length - 1 ? "font-medium text-[var(--ink)]" : "text-[var(--muted-ink)]"}>
                          {crumb.label}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <NewMapButton
                      label="New Thought"
                      showIcon={false}
                      className="h-9 rounded-[12px] bg-[var(--brain)] px-4 text-sm font-medium text-[var(--paper)] hover:bg-[var(--accent-strong)]"
                    />
                    <ShellIconLink href="/app/search" label="Search">
                      <Search className="size-4" />
                    </ShellIconLink>
                    <ShellIconLink href="/app/settings" label="Alerts">
                      <Bell className="size-4" />
                    </ShellIconLink>
                    <Link
                      href="/app/settings"
                      className="flex size-9 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--panel)] text-[11px] font-semibold text-[var(--ink)] transition hover:bg-white"
                    >
                      {userInitials}
                    </Link>
                  </div>
                </div>
              </Card>
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_292px]">
              <main className={`min-w-0 penny-mode-panel ${modeSwitching ? "is-switching" : ""}`}>{children}</main>

              <aside className="min-w-0">
                <div className={`space-y-4 xl:sticky xl:top-[5.75rem] penny-mode-panel ${modeSwitching ? "is-switching" : ""}`}>
                  {showBrainInspector ? <BrainClaimInspector /> : <GenericShellInspector surface={surface} />}
                </div>
              </aside>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ShellIconLink({
  children,
  href,
  label,
}: {
  children: React.ReactNode;
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="flex size-9 items-center justify-center rounded-full border border-[var(--line)] bg-white text-[var(--ink)] transition hover:bg-[var(--panel)]"
    >
      {children}
    </Link>
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
        <h2 className="text-lg font-semibold leading-7 text-[var(--ink)]">Distribution advantage matters more than model quality in winning this market.</h2>

        <div className="mt-5">
          <p className="penny-label">Confidence</p>
          <p className="mt-2 text-[2.3rem] font-semibold leading-none text-[var(--ink)]">72%</p>
          <p className="mt-2 text-sm text-[var(--muted-ink)]">Medium high</p>
        </div>

        <div className="mt-6">
          <p className="penny-label">Key connections</p>
          <div className="mt-3 rounded-[18px] border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
            <OrnamentalGraph variant="brain-map" accent="var(--brain)" className="mx-auto h-24 max-w-[15rem]" />
          </div>
        </div>

        <div className="mt-6">
          <p className="penny-label">Dependents (3)</p>
          <div className="mt-3 space-y-2 text-sm leading-6 text-[var(--ink)]">
            {[
              "Go-to-market strategy",
              "User acquisition channels",
              "Moat durability",
            ].map((item) => (
              <div key={item} className="rounded-[16px] border border-[var(--line)] bg-white px-3 py-2.5">
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 border-t border-[var(--line)] pt-5">
          <p className="penny-label">Last challenged</p>
          <p className="mt-2 text-sm text-[var(--ink)]">9 days ago</p>
          <Link href="/app" className="mt-3 inline-flex text-sm text-[var(--muted-ink)] transition hover:text-[var(--ink)]">
            View in Brain Map →
          </Link>
        </div>
      </Card>

      <Card className="penny-card p-4 shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between gap-2">
          <p className="penny-label">Work sphere</p>
          <Compass className="size-4 text-[var(--brain)]" />
        </div>
        <div className="mt-3 rounded-[18px] border border-[var(--line)] bg-[var(--panel)] p-3">
          <OrnamentalGraph variant="mini-map" accent="var(--brain)" className="mx-auto h-20 max-w-[10rem]" />
        </div>
      </Card>
    </>
  );
}

function GenericShellInspector({ surface }: { surface: SurfaceSummary }) {
  return (
    <>
      <Card className="penny-card p-5 shadow-[var(--shadow-card)]">
        <p className="penny-label">Inspector</p>
        <h2 className="mt-3 text-lg font-semibold text-[var(--ink)]">{surface.title}</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{surface.description}</p>
        <div className="mt-5 rounded-[18px] border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
          <OrnamentalGraph variant="concept-map" accent={surface.accent} className="mx-auto h-24 max-w-[12rem]" />
        </div>
      </Card>

      <Card className="penny-card p-5 shadow-[var(--shadow-card)]">
        <p className="penny-label">What stays stable</p>
        <div className="mt-3 space-y-2.5 text-sm leading-6 text-[var(--ink)]">
          {surface.notes.map((note) => (
            <div key={note} className="rounded-[16px] border border-[var(--line)] bg-white px-3 py-2.5">
              {note}
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function describeSurface(pathname: string, activeMode: ModeKey): SurfaceSummary {
  if (activeMode === "challenge") {
    return {
      title: "Critique transparency",
      description: "The right side stays explanatory rather than dramatic so Challenge feels denser than Brain without breaking the shared grammar.",
      notes: [
        "Show why this critique was selected.",
        "Keep the dependency cascade quiet and readable.",
        "Reserve the strong accent for the chosen response path.",
      ],
      accent: "var(--challenge)",
    };
  }

  if (activeMode === "learn") {
    return {
      title: "Where this lives in your brain",
      description: "Learn stays claim-anchored, then uses the right rail to show adjacent concepts rather than a separate study product.",
      notes: [
        "Keep the concept graph ornamental and small.",
        "Show one related claim, not a dashboard.",
        "Keep connected ideas compact and legible.",
      ],
      accent: "var(--learn)",
    };
  }

  if (pathname.startsWith("/app/search")) {
    return {
      title: "Archive recovery",
      description: "Search still lives inside the same shell, so recovered reasoning feels adjacent to current work.",
      notes: [
        "Use the same card language as live work.",
        "Keep results framed by the same breadcrumb and rail.",
        "Avoid making recovery feel like a separate app.",
      ],
      accent: "var(--brain)",
    };
  }

  return {
    title: "Selected claim inspector",
    description: "Brain keeps one claim primary while the stream stays calm in the center.",
    notes: [
      "The right rail should stay quiet and legible.",
      "Connections are decorative until real graph rendering lands.",
      "Dependents matter more than extra dashboard chrome.",
    ],
    accent: "var(--brain)",
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
      accent: "var(--brain)",
      mode: "brain",
    },
    {
      href: buildModeHref(pathname, searchParams, "challenge"),
      icon: ShieldAlert,
      label: "Challenge",
      accent: "var(--challenge)",
      mode: "challenge",
    },
    {
      href: buildModeHref(pathname, searchParams, "learn"),
      icon: GraduationCap,
      label: "Learn",
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
