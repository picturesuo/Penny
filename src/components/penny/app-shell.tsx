"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  BrainCircuit,
  ChevronRight,
  Compass,
  Filter,
  GraduationCap,
  Search,
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
  const modeRailItems = buildModeRail(pathname, searchParams);
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
              </Card>

              <Card className="penny-card px-4 py-4 shadow-[var(--shadow-card)]">
                <p className="penny-label">Recent sessions</p>
                <div className="mt-3 space-y-2">
                  {[
                    ["Backend Architecture Choices", "Today • 42 min"],
                    ["Penny Core Loop Design", "Yesterday • 38 min"],
                    ["Monetization Strategy", "2 days ago • 1h 02m"],
                  ].map(([title, meta]) => (
                    <div key={title} className="rounded-[14px] border border-[var(--line)] bg-white/78 px-3 py-2.5">
                      <p className="text-sm font-medium leading-6 text-[var(--ink)]">{title}</p>
                      <p className="mt-1 text-xs text-[var(--muted-ink)]">{meta}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-[var(--line)] pt-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex size-9 items-center justify-center rounded-full bg-[var(--ink)] text-xs font-semibold text-[var(--paper)]"
                      title={userId || "Penny user"}
                    >
                      {userInitials}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[var(--ink)]">Penny</p>
                      <p className="text-xs text-[var(--muted-ink)]">Focused workspace</p>
                    </div>
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
                    <label className="hidden h-9 items-center gap-2 rounded-[12px] border border-[var(--line)] bg-white px-3 text-sm text-[var(--muted-ink)] md:flex">
                      <Search className="size-4 text-[var(--muted-ink)]" />
                      <input
                        aria-label="Search your brain"
                        placeholder="Search your brain..."
                        className="w-40 bg-transparent text-[var(--ink)] outline-none placeholder:text-[var(--muted-ink)]"
                      />
                      <span className="rounded-[8px] border border-[var(--line)] bg-[var(--panel)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--muted-ink)]">
                        ⌘K
                      </span>
                    </label>
                    <button
                      type="button"
                      className="inline-flex h-9 items-center gap-2 rounded-[12px] border border-[var(--line)] bg-white px-3 text-sm font-medium text-[var(--ink)] transition hover:bg-[var(--panel)]"
                    >
                      <Filter className="size-4 text-[var(--muted-ink)]" />
                      Filter
                    </button>
                    <NewMapButton
                      label="New Thought"
                      showIcon={false}
                      className="h-9 rounded-[12px] bg-[var(--brain)] px-4 text-sm font-medium text-[var(--paper)] hover:bg-[var(--accent-strong)]"
                    />
                  </div>
                </div>
              </Card>
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_292px]">
              <main className={`min-w-0 penny-mode-panel ${modeSwitching ? "is-switching" : ""}`}>{children}</main>

              <aside className="min-w-0">
                <div className={`space-y-4 xl:sticky xl:top-[5.75rem] penny-mode-panel ${modeSwitching ? "is-switching" : ""}`}>
                  {activeMode === "brain" ? <BrainClaimInspector /> : activeMode === "challenge" ? <ChallengeClaimInspector /> : <LearnClaimInspector />}
                </div>
              </aside>
            </div>
          </div>
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

function ChallengeClaimInspector() {
  return (
    <>
      <Card className="penny-card p-5 shadow-[var(--shadow-card)]">
        <p className="penny-label">Critique transparency</p>
        <div className="mt-4 space-y-3">
          {[
            ["Overall strength", "Strong"],
            ["Failure type", "Shaky assumption"],
            ["Evidence quality", "Moderate (43%)"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-[16px] border border-[var(--line)] bg-white px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted-ink)]">{label}</p>
              <p className="mt-2 text-sm font-medium text-[var(--ink)]">{value}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="penny-card p-5 shadow-[var(--shadow-card)]">
        <p className="penny-label">Dependency cascade</p>
        <div className="mt-4 rounded-[18px] border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
          <OrnamentalGraph variant="cascade" accent="var(--challenge)" className="mx-auto h-20 max-w-[12rem]" />
        </div>
        <div className="mt-4 space-y-2.5 text-sm leading-6 text-[var(--ink)]">
          {[
            "Go-to-market strategy",
            "User acquisition channels",
            "Moat durability",
            "Pricing power",
          ].map((item) => (
            <div key={item} className="rounded-[16px] border border-[var(--line)] bg-white px-3 py-2.5">
              {item}
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function LearnClaimInspector() {
  return (
    <>
      <Card className="penny-card p-5 shadow-[var(--shadow-card)]">
        <p className="penny-label">Where This Lives In Your Brain</p>
        <div className="mt-4 rounded-[18px] border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
          <OrnamentalGraph variant="concept-map" accent="var(--learn)" className="mx-auto h-24 max-w-[12rem]" />
        </div>
      </Card>

      <Card className="penny-card p-5 shadow-[var(--shadow-card)]">
        <p className="penny-label">Related to your claim</p>
        <p className="mt-3 text-sm leading-6 text-[var(--ink)]">
          Network effects strengthen your argument that distribution creates lasting advantage.
        </p>

        <div className="mt-5 border-t border-[var(--line)] pt-4">
          <p className="penny-label">Connected ideas</p>
          <div className="mt-3 space-y-2.5 text-sm leading-6 text-[var(--ink)]">
            {["Defensibility", "Switching Costs", "Platform Strategy"].map((item) => (
              <div key={item} className="rounded-[16px] border border-[var(--line)] bg-white px-3 py-2.5">
                {item}
              </div>
            ))}
          </div>
        </div>
      </Card>
    </>
  );
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
