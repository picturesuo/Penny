"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { BrainCircuit, ChevronRight, Compass, GraduationCap, ShieldAlert } from "lucide-react";
import { PennyLogo } from "@/components/penny/penny-logo";
import { OrnamentalGraph } from "@/components/penny/ornamental-graph";
import { useQuickCaptureModal } from "@/components/penny/quick-capture-modal";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type AppShellProps = {
  children: React.ReactNode;
  userEmail: string;
  userId: string;
};

export type AppShellMode = "brain" | "challenge" | "learn";

export type AppShellBreadcrumb = {
  label: string;
};

export type AppShellSphere = {
  label: string;
  href?: string;
  active?: boolean;
  meta?: string | null;
};

export type AppShellAction = {
  href?: string;
  label: string;
  onClick?: () => void;
  tone?: "primary" | "secondary";
};

export type AppShellOverrides = {
  actions?: AppShellAction[];
  breadcrumbs?: AppShellBreadcrumb[];
  currentClaimId?: string | null;
  currentMapId?: string | null;
  currentRoundId?: string | null;
  inspector?: React.ReactNode;
  inspectorLabel?: string | null;
  spheres?: AppShellSphere[];
  topBarLabel?: string | null;
};

type AppShellContextValue = {
  activeMode: AppShellMode;
  resetShell: () => void;
  setShell: (overrides: AppShellOverrides) => void;
};

type ModeRailItem = {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  accent: string;
  mode: AppShellMode;
};

const DEFAULT_SPHERES: AppShellSphere[] = [
  { label: "Work", active: true },
  { label: "Writing" },
  { label: "Life" },
  { label: "Learning" },
];

const DEFAULT_BRAIN_BREADCRUMBS: AppShellBreadcrumb[] = [
  { label: "Work" },
  { label: "Market Thesis" },
  { label: "Distribution Claim" },
];

const DEFAULT_LEARN_BREADCRUMBS: AppShellBreadcrumb[] = [
  ...DEFAULT_BRAIN_BREADCRUMBS,
  { label: "Network Effects" },
];

const AppShellContext = createContext<AppShellContextValue | null>(null);

export function useAppShell() {
  const context = useContext(AppShellContext);

  if (!context) {
    throw new Error("useAppShell must be used inside AppShell.");
  }

  return context;
}

export function AppShell({ children, userEmail, userId }: AppShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const routeKey = `${pathname}?${search}`;
  const activeMode = deriveActiveMode(pathname, searchParams);
  const [overrideEntry, setOverrideEntry] = useState<{
    overrides: AppShellOverrides;
    routeKey: string;
  }>({
    overrides: {},
    routeKey,
  });
  const previousModeRef = useRef<AppShellMode | null>(null);
  const [modeSwitching, setModeSwitching] = useState(false);
  const { open } = useQuickCaptureModal();
  const defaultMapId = deriveMapIdFromPathname(pathname);
  const effectiveOverrides = useMemo(
    () => (overrideEntry.routeKey === routeKey ? overrideEntry.overrides : {}),
    [overrideEntry.overrides, overrideEntry.routeKey, routeKey],
  );
  const shellState = useMemo(() => buildShellState(activeMode, effectiveOverrides), [activeMode, effectiveOverrides]);
  const modeRailItems = useMemo(
    () =>
      buildModeRail(pathname, searchParams, {
        currentClaimId: shellState.currentClaimId ?? searchParams.get("claimId"),
        currentMapId: shellState.currentMapId ?? defaultMapId ?? null,
        currentRoundId: shellState.currentRoundId ?? searchParams.get("roundId"),
      }),
    [defaultMapId, pathname, searchParams, shellState.currentClaimId, shellState.currentMapId, shellState.currentRoundId],
  );
  const userInitials =
    userEmail
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
    }, 170);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [activeMode]);

  const contextValue = useMemo<AppShellContextValue>(
    () => ({
      activeMode,
      resetShell: () =>
        setOverrideEntry({
          overrides: {},
          routeKey,
        }),
      setShell: (nextOverrides) =>
        setOverrideEntry({
          overrides: nextOverrides,
          routeKey,
        }),
    }),
    [activeMode, routeKey],
  );

  const actions =
    shellState.actions ??
    [
      {
        label: "New Thought",
        onClick: () =>
          open({
            defaultMapId: shellState.currentMapId ?? defaultMapId ?? undefined,
          }),
        tone: "primary",
      },
    ];

  return (
    <AppShellContext.Provider value={contextValue}>
      <div className="min-h-screen bg-[linear-gradient(180deg,#faf7f3_0%,#f7f3ee_44%,#f5f0ea_100%)] text-[var(--ink)]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[20rem] bg-[radial-gradient(circle_at_top_left,rgba(185,106,69,0.08),transparent_40%),radial-gradient(circle_at_top_right,rgba(95,143,120,0.06),transparent_36%)]" />
        <div className="relative mx-auto max-w-[1540px] px-4 py-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 xl:grid-cols-[224px_minmax(0,1fr)_316px]">
            <aside className="order-2 xl:order-1">
              <div className="space-y-5 xl:sticky xl:top-4">
                <div className="rounded-[28px] border border-[var(--line)] bg-[rgba(251,248,244,0.88)] px-4 py-5 shadow-[0_8px_22px_rgba(45,36,31,0.035)]">
                  <PennyLogo
                    showLabel
                    className="items-center justify-start"
                    markClassName="size-10 rounded-[12px]"
                    labelClassName="text-lg font-medium tracking-[-0.01em]"
                  />

                  <div className="mt-6 space-y-2">
                    {modeRailItems.map((item) => {
                      const Icon = item.icon;
                      const active = item.mode === activeMode;

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className="flex items-center gap-3 rounded-[18px] border px-3 py-3 transition duration-150"
                          style={
                            active
                              ? {
                                  color: "#fffaf4",
                                  borderColor: item.accent,
                                  backgroundColor: item.accent,
                                }
                              : {
                                  borderColor: "var(--line)",
                                  backgroundColor: "rgba(255,255,255,0.82)",
                                }
                          }
                        >
                          <span
                            className="flex size-8 shrink-0 items-center justify-center rounded-full border"
                            style={
                              active
                                ? {
                                    borderColor: "rgba(255,255,255,0.22)",
                                    backgroundColor: "rgba(255,255,255,0.14)",
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
                          <span className={cn("text-sm font-medium", active ? "text-white" : "text-[var(--ink)]")}>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>

                  <div className="mt-7 border-t border-[var(--line)] pt-5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="penny-label">Spheres</p>
                      <Compass className="size-4 text-[var(--muted-ink)]" />
                    </div>
                    <div className="mt-3 space-y-1.5">
                      {shellState.spheres.map((sphere) => {
                        const content = (
                          <div
                            className="flex items-center justify-between rounded-[16px] px-3 py-2.5 transition"
                            style={sphere.active ? { backgroundColor: "rgba(185,106,69,0.08)" } : undefined}
                          >
                            <div className="flex items-center gap-2.5">
                              <span
                                className="size-2 rounded-full"
                                style={{
                                  backgroundColor: sphere.active ? "var(--brain)" : "rgba(45,36,31,0.18)",
                                }}
                              />
                              <div>
                                <p className={cn("text-sm", sphere.active ? "font-medium text-[var(--ink)]" : "text-[var(--muted-ink)]")}>
                                  {sphere.label}
                                </p>
                                {sphere.meta ? <p className="text-[11px] text-[var(--muted-ink)]">{sphere.meta}</p> : null}
                              </div>
                            </div>
                            {sphere.active ? <span className="size-1.5 rounded-full bg-[var(--brain)]" /> : null}
                          </div>
                        );

                        return sphere.href ? (
                          <Link key={`${sphere.label}-${sphere.href}`} href={sphere.href} className="block">
                            {content}
                          </Link>
                        ) : (
                          <div key={sphere.label}>{content}</div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="rounded-[24px] border border-[var(--line)] bg-[rgba(251,248,244,0.88)] px-4 py-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex size-9 items-center justify-center rounded-full bg-[var(--ink)] text-xs font-semibold text-[var(--paper)]"
                      title={userId || "Penny user"}
                    >
                      {userInitials}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[var(--ink)]">Focused workspace</p>
                      <p className="text-xs text-[var(--muted-ink)]">{userEmail}</p>
                    </div>
                  </div>
                </div>
              </div>
            </aside>

            <div className="order-1 min-w-0 xl:order-2">
              <div className="rounded-[30px] border border-[var(--line)] bg-[rgba(251,248,244,0.78)] px-5 py-4 shadow-[0_12px_36px_rgba(45,36,31,0.035)] sm:px-6">
                <div className="border-b border-[var(--line)] pb-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="min-w-0">
                      {shellState.topBarLabel ? <p className="penny-label mb-2">{shellState.topBarLabel}</p> : null}
                      <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-[var(--muted-ink)]">
                        {shellState.breadcrumbs.map((crumb, index) => (
                          <div key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-2">
                            {index > 0 ? <ChevronRight className="size-4 shrink-0 text-[var(--muted-ink)]" /> : null}
                            <span className={cn("truncate", index === shellState.breadcrumbs.length - 1 ? "font-medium text-[var(--ink)]" : "")}>
                              {crumb.label}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {actions.map((action) =>
                        action.href ? (
                          <Link
                            key={`${action.label}-${action.href}`}
                            href={action.href}
                            className={actionClassName(action.tone)}
                            style={actionStyle(action.tone)}
                          >
                            {action.label}
                          </Link>
                        ) : (
                          <button
                            key={action.label}
                            type="button"
                            onClick={action.onClick}
                            className={actionClassName(action.tone)}
                            style={actionStyle(action.tone)}
                          >
                            {action.label}
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                </div>

                <main className={cn("mt-6 min-w-0 penny-mode-panel", modeSwitching && "is-switching")}>{children}</main>
              </div>
            </div>

            <aside className="order-3 min-w-0">
              <div className={cn("space-y-4 xl:sticky xl:top-4 penny-mode-panel", modeSwitching && "is-switching")}>
                {shellState.inspector ?? renderDefaultInspector(activeMode)}
              </div>
            </aside>
          </div>
        </div>
      </div>
    </AppShellContext.Provider>
  );
}

function buildShellState(activeMode: AppShellMode, overrides: AppShellOverrides) {
  const defaults = buildDefaultShellState(activeMode);

  return {
    actions: overrides.actions ?? defaults.actions,
    breadcrumbs: overrides.breadcrumbs ?? defaults.breadcrumbs,
    currentClaimId: overrides.currentClaimId ?? defaults.currentClaimId,
    currentMapId: overrides.currentMapId ?? defaults.currentMapId,
    currentRoundId: overrides.currentRoundId ?? defaults.currentRoundId,
    inspector: overrides.inspector ?? defaults.inspector,
    inspectorLabel: overrides.inspectorLabel ?? defaults.inspectorLabel,
    spheres: overrides.spheres ?? defaults.spheres,
    topBarLabel: overrides.topBarLabel ?? defaults.topBarLabel,
  };
}

function buildDefaultShellState(
  activeMode: AppShellMode,
): Required<Omit<AppShellOverrides, "actions" | "currentClaimId" | "currentMapId" | "currentRoundId">> & {
  actions: AppShellAction[] | undefined;
  currentClaimId: string | null;
  currentMapId: string | null;
  currentRoundId: string | null;
} {
  return {
    actions: undefined,
    breadcrumbs: activeMode === "learn" ? DEFAULT_LEARN_BREADCRUMBS : DEFAULT_BRAIN_BREADCRUMBS,
    currentClaimId: null,
    currentMapId: null,
    currentRoundId: null,
    inspector: renderDefaultInspector(activeMode),
    inspectorLabel: null,
    spheres: DEFAULT_SPHERES,
    topBarLabel: activeMode === "challenge" ? "Challenge" : activeMode === "learn" ? "Learn" : "Brain",
  };
}

function renderDefaultInspector(activeMode: AppShellMode) {
  if (activeMode === "challenge") {
    return (
      <>
        <Card className="penny-card px-5 py-5 shadow-[var(--shadow-card)]">
          <p className="penny-label">Critique transparency</p>
          <div className="mt-4 space-y-3">
            {[
              ["Overall strength", "Strong"],
              ["Failure type", "Shaky assumption"],
              ["Evidence quality", "Moderate scrutiny"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-[16px] border border-[var(--line)] bg-white/86 px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--muted-ink)]">{label}</p>
                <p className="mt-2 text-sm font-medium text-[var(--ink)]">{value}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="penny-card px-5 py-5 shadow-[var(--shadow-card)]">
          <p className="penny-label">Dependency cascade</p>
          <div className="mt-4 rounded-[18px] border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
            <OrnamentalGraph variant="cascade" accent="var(--challenge)" className="mx-auto h-20 max-w-[12rem]" />
          </div>
        </Card>
      </>
    );
  }

  if (activeMode === "learn") {
    return (
      <>
        <Card className="penny-card px-5 py-5 shadow-[var(--shadow-card)]">
          <p className="penny-label">Where This Lives In Your Brain</p>
          <div className="mt-4 rounded-[18px] border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
            <OrnamentalGraph variant="concept-map" accent="var(--learn)" className="mx-auto h-24 max-w-[12rem]" />
          </div>
        </Card>

        <Card className="penny-card px-5 py-5 shadow-[var(--shadow-card)]">
          <p className="penny-label">Related ideas</p>
          <div className="mt-3 space-y-2.5">
            {["Defensibility", "Switching Costs", "Platform Strategy"].map((item) => (
              <div key={item} className="rounded-[16px] border border-[var(--line)] bg-white/86 px-3 py-2.5 text-sm text-[var(--ink)]">
                {item}
              </div>
            ))}
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <Card className="penny-card px-5 py-5 shadow-[var(--shadow-card)]">
        <h2 className="text-lg font-semibold leading-7 text-[var(--ink)]">Selected claim</h2>
        <div className="mt-5">
          <p className="penny-label">Confidence</p>
          <p className="mt-2 text-[2.3rem] font-semibold leading-none text-[var(--ink)]">72%</p>
        </div>
        <div className="mt-6 rounded-[18px] border border-[var(--line)] bg-[var(--panel)] px-4 py-3">
          <OrnamentalGraph variant="brain-map" accent="var(--brain)" className="mx-auto h-24 max-w-[15rem]" />
        </div>
      </Card>
    </>
  );
}

function buildModeRail(
  pathname: string,
  searchParams: URLSearchParams,
  workspaceSelection: {
    currentClaimId: string | null;
    currentMapId: string | null;
    currentRoundId: string | null;
  },
): ModeRailItem[] {
  return [
    {
      href: buildModeHref(pathname, searchParams, "brain", workspaceSelection),
      icon: BrainCircuit,
      label: "Brain",
      accent: "var(--brain)",
      mode: "brain",
    },
    {
      href: buildModeHref(pathname, searchParams, "challenge", workspaceSelection),
      icon: ShieldAlert,
      label: "Challenge",
      accent: "var(--challenge)",
      mode: "challenge",
    },
    {
      href: buildModeHref(pathname, searchParams, "learn", workspaceSelection),
      icon: GraduationCap,
      label: "Learn",
      accent: "var(--learn)",
      mode: "learn",
    },
  ];
}

function deriveActiveMode(pathname: string, searchParams: URLSearchParams): AppShellMode {
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

function buildModeHref(
  pathname: string,
  searchParams: URLSearchParams,
  mode: AppShellMode,
  workspaceSelection: {
    currentClaimId: string | null;
    currentMapId: string | null;
    currentRoundId: string | null;
  },
) {
  const params = new URLSearchParams(searchParams.toString());
  const targetPath = workspaceSelection.currentMapId
    ? `/maps/${workspaceSelection.currentMapId}`
    : pathname;

  if (workspaceSelection.currentClaimId) {
    params.set("claimId", workspaceSelection.currentClaimId);
  } else {
    params.delete("claimId");
  }

  if (workspaceSelection.currentRoundId) {
    params.set("roundId", workspaceSelection.currentRoundId);
  } else {
    params.delete("roundId");
  }

  if (
    pathname.startsWith("/maps/") ||
    pathname.startsWith("/app/maps/") ||
    (workspaceSelection.currentMapId && pathname.startsWith("/app"))
  ) {
    if (mode === "brain") {
      params.delete("launcher");
    } else {
      params.set("launcher", mode);
    }
    params.delete("intent");
    const query = params.toString();
    return query ? `${targetPath}?${query}` : targetPath;
  }

  if (mode === "brain") {
    params.delete("intent");
  } else {
    params.set("intent", mode);
  }
  const query = params.toString();
  return query ? `/app?${query}` : "/app";
}

function deriveMapIdFromPathname(pathname: string) {
  const match = pathname.match(/^\/(?:app\/)?maps\/([^/?#]+)/);
  return match?.[1] ?? null;
}

function actionClassName(tone: AppShellAction["tone"]) {
  return cn(
    "inline-flex h-9 items-center rounded-[12px] border px-3.5 text-sm font-medium transition",
    tone === "primary" ? "text-[var(--paper)]" : "bg-white text-[var(--ink)]",
  );
}

function actionStyle(tone: AppShellAction["tone"]) {
  return tone === "primary"
    ? {
        borderColor: "var(--brain)",
        backgroundColor: "var(--brain)",
      }
    : {
        borderColor: "var(--line)",
      };
}
