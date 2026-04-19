import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { GlobalSearch } from "@/components/penny/global-search";
import { QuickCapture } from "@/components/penny/quick-capture";
import { CaptureInbox } from "@/components/penny/capture-inbox";
import { NewMapButton, NewMapModal } from "@/components/penny/new-map-modal";
import { renderDashboardPanel } from "@/components/penny/dashboard-panels";
import { buildHomeDashboard } from "@/lib/home-dashboard";
import type { SessionCardModel } from "@/types/penny";
import type { QuickCapture as QuickCaptureModel } from "@/types/quick-capture";
import type { Map as CoreMap } from "@/types/mvp-core";
import type { ThoughtMapModel } from "@/types/thought-map";

type SharedProps = {
  userId: string;
  maps: Array<CoreMap | ThoughtMapModel>;
};

type RichDashboardProps = SharedProps & {
  sessions: SessionCardModel[];
  fragments: QuickCaptureModel[];
};

type StandaloneDashboardProps = SharedProps & {
  sessions?: never;
  fragments?: never;
};

type HomeDashboardProps = RichDashboardProps | StandaloneDashboardProps;

export function HomeDashboard(props: HomeDashboardProps) {
  if (isRichDashboard(props)) {
    return <RichHomeDashboard {...props} />;
  }

  return <StandaloneHomeDashboard {...props} />;
}

function isRichDashboard(props: HomeDashboardProps): props is RichDashboardProps {
  return Array.isArray((props as RichDashboardProps).sessions) && Array.isArray((props as RichDashboardProps).fragments);
}

function RichHomeDashboard({ userId, maps, sessions, fragments }: RichDashboardProps) {
  const dashboard = buildHomeDashboard({ userId, maps: maps as ThoughtMapModel[], sessions, fragments });
  const visiblePanels = dashboard.panels.filter((panel) => panel.isVisible);

  return (
    <section className="space-y-6">
      <Card className="overflow-hidden border-black/8 bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(243,241,232,0.96))] p-6 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Home</p>
            <h1 className="mt-2 text-4xl font-semibold text-[var(--ink)] sm:text-5xl">
              {dashboard.userMaturity === "new"
                ? "Start your first map"
                : dashboard.userMaturity === "early"
                  ? "Keep the habit alive"
                  : dashboard.userMaturity === "established"
                    ? "Find the next load-bearing claim"
                    : "Surface the most valuable thing first"}
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--muted-ink)]">
              Penny opens on the thing you most need right now: onboarding, the next critique, a due resolution, or the most useful memory surface.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              {dashboard.primaryAction.actionType === "create_first_claim" ? (
                <NewMapButton label={dashboard.primaryAction.label} className="gap-2" />
              ) : dashboard.primaryAction.actionType === "start_session" && dashboard.primaryAction.targetId ? (
                <Link href={`/app/session/${dashboard.primaryAction.targetId}`}>
                  <Button className="gap-2">
                    {dashboard.primaryAction.label}
                    <ArrowRight className="size-4" />
                  </Button>
                </Link>
              ) : dashboard.primaryAction.targetId ? (
                <Link href={`/app/maps/${dashboard.primaryAction.targetId}`}>
                  <Button className="gap-2">
                    {dashboard.primaryAction.label}
                    <ArrowRight className="size-4" />
                  </Button>
                </Link>
              ) : (
                <NewMapButton label={dashboard.primaryAction.label} className="gap-2" />
              )}
              <Link href="/app/search">
                <Button variant="secondary" className="gap-2">
                  <Search className="size-4" />
                  Search everything
                </Button>
              </Link>
              <QuickCapture userId={userId} />
            </div>
          </div>

          <div className="rounded-[28px] border border-black/8 bg-white/80 p-5 lg:min-w-[320px]">
            <div className="flex items-center gap-2">
              <Badge className="bg-[var(--panel)] text-[var(--ink)]">{dashboard.userMaturity}</Badge>
              <Badge className="bg-white text-[var(--muted-ink)]">{maps.length} maps</Badge>
              <Badge className="bg-white text-[var(--muted-ink)]">{fragments.length} captures</Badge>
            </div>
            <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">{dashboard.primaryAction.description}</p>
            {dashboard.sessionSuggestion ? (
              <div className="mt-4 rounded-[22px] bg-[var(--panel)] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Suggested session</p>
                <p className="mt-2 text-sm font-medium text-[var(--ink)]">{dashboard.sessionSuggestion.suggestedIntentionType}</p>
                <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{dashboard.sessionSuggestion.reason}</p>
              </div>
            ) : null}
          </div>
        </div>
      </Card>

      {dashboard.alerts.length ? (
        <div className="grid gap-3">
          {dashboard.alerts.slice(0, 3).map((alert) => (
            <Card key={alert.id} className="border-black/8 bg-white/80 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">Alert</p>
                  <p className="mt-1 text-sm font-medium text-[var(--ink)]">{alert.message}</p>
                </div>
                <Link href={alert.targetId.startsWith("/app") ? alert.targetId : `/app/maps/${alert.targetId}`}>
                  <Button variant="secondary" className="gap-2">
                    {alert.actionLabel}
                    <ArrowRight className="size-4" />
                  </Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      ) : null}

      {visiblePanels.length ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {visiblePanels.map((panel) => (
            <div key={panel.id}>{renderDashboardPanel(panel)}</div>
          ))}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="p-6">
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Quick search</p>
          <h3 className="mt-2 text-2xl font-semibold text-[var(--ink)]">Find a claim, map, artifact, or shape</h3>
          <p className="mt-2 text-sm leading-7 text-[var(--muted-ink)]">
            Search is the daily retrieval layer. It keeps the product usable once the user’s history gets large enough that browsing stops working.
          </p>
          <div className="mt-4">
            <GlobalSearch userId={userId} />
          </div>
        </Card>

        <CaptureInbox captures={fragments} />
      </div>
    </section>
  );
}

function StandaloneHomeDashboard({ maps }: StandaloneDashboardProps) {
  const [showNewMap, setShowNewMap] = useState(false);
  const activeMaps = maps.filter((map) => map.status === "active");
  const isNew = maps.length === 0;

  return (
    <section className="space-y-6">
      <Card className="overflow-hidden border-black/8 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(244,240,230,0.98))] p-6 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Home</p>
            <h1 className="mt-2 text-4xl font-semibold text-[var(--ink)] sm:text-5xl">Your thinking maps</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--muted-ink)]">
              Each map is a set of related claims you are pressure-testing together.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button className="gap-2" onClick={() => setShowNewMap(true)}>
                + New map
              </Button>
              <Link href="/app/search">
                <Button variant="secondary" className="gap-2">
                  <Search className="size-4" />
                  Search everything
                </Button>
              </Link>
            </div>
          </div>

          <div className="rounded-[28px] border border-black/8 bg-white/80 p-5 lg:min-w-[320px]">
            <div className="flex items-center gap-2">
              <Badge className="bg-[var(--panel)] text-[var(--ink)]">{maps.length} maps</Badge>
              <Badge className="bg-white text-[var(--muted-ink)]">{activeMaps.length} active</Badge>
              <Badge className="bg-white text-[var(--muted-ink)]">Signed in</Badge>
            </div>
            <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">
              Start with one real thought, then keep only the maps that are still active enough to deserve your attention.
            </p>
          </div>
        </div>
      </Card>

      {isNew ? (
        <Card className="border-black/8 bg-white/80 p-8">
          <div className="max-w-2xl">
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Empty dashboard</p>
            <h2 className="mt-3 text-3xl font-semibold text-[var(--ink)]">Your thinking space is empty</h2>
            <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">
              Start with one thing you believe that has real stakes. A strategic decision. A prediction. A bet. Something that could be wrong.
            </p>
            <div className="mt-5">
              <Button className="gap-2" onClick={() => setShowNewMap(true)}>
                Create your first map
              </Button>
            </div>
            <div className="mt-6 rounded-[24px] bg-[var(--panel)] p-5">
              <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">Examples of good first maps</p>
              <ul className="mt-3 space-y-2 text-sm leading-7 text-[var(--ink)]">
                <li>"Series A readiness in Q3"</li>
                <li>"Is now the right time to hire a Head of Sales?"</li>
                <li>"Our product-market fit hypothesis"</li>
                <li>"Why we should pivot to enterprise"</li>
              </ul>
            </div>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {activeMaps.map((map) => (
            <MapCard key={map.id} map={map} />
          ))}
          {activeMaps.length === 0 ? (
            <Card className="border-dashed border-black/10 bg-white/70 p-6">
              <p className="text-sm leading-7 text-[var(--muted-ink)]">You have maps, but none are marked active right now.</p>
              <Button className="mt-4 gap-2" onClick={() => setShowNewMap(true)}>
                Start a new map
              </Button>
            </Card>
          ) : null}
        </div>
      )}

      <NewMapModal open={showNewMap} onClose={() => setShowNewMap(false)} />
    </section>
  );
}

function MapCard({ map }: { map: CoreMap | ThoughtMapModel }) {
  const claimCount = "claimCount" in map ? map.claimCount : Math.max(0, map.nodes.length - 1);
  const description = "rawThought" in map ? map.rawThought : "Open this map to keep pressure-testing the active claims.";

  return (
    <Link href={`/app/maps/${map.id}`} className="block">
      <Card className="h-full border-black/8 bg-[linear-gradient(180deg,#ffffff_0%,#f7f3ea_100%)] p-5 transition hover:-translate-y-0.5 hover:shadow-[0_20px_50px_rgba(35,31,23,0.08)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold text-[var(--ink)]">{map.title}</h3>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--muted-ink)]">
              <span>
                {claimCount} claim{claimCount === 1 ? "" : "s"}
              </span>
              <span>·</span>
              <span>{formatRelativeDate(new Date(map.updatedAt))}</span>
            </div>
          </div>
          <Badge className="bg-[#d9ead8] text-[#355b32]">Active</Badge>
        </div>

        <p className="mt-4 text-sm leading-7 text-[var(--muted-ink)]">{truncateText(description, 120)}</p>

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-black/8 pt-4">
          <span className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Open map</span>
          <span className="text-sm font-medium text-[var(--ink)]">Open →</span>
        </div>
      </Card>
    </Link>
  );
}

function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString();
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength).trimEnd()}…`;
}
