import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { GlobalSearch } from "@/components/penny/global-search";
import { QuickCapture } from "@/components/penny/quick-capture";
import { CaptureInbox } from "@/components/penny/capture-inbox";
import { renderDashboardPanel } from "@/components/penny/dashboard-panels";
import { buildHomeDashboard } from "@/lib/home-dashboard";
import type { SessionCardModel } from "@/types/penny";
import type { QuickCapture as QuickCaptureModel } from "@/types/quick-capture";
import type { ThoughtMapModel } from "@/types/thought-map";

export function HomeDashboard({
  userId,
  maps,
  sessions,
  fragments,
}: {
  userId: string;
  maps: ThoughtMapModel[];
  sessions: SessionCardModel[];
  fragments: QuickCaptureModel[];
}) {
  const dashboard = buildHomeDashboard({ userId, maps, sessions, fragments });
  const primaryLink =
    dashboard.primaryAction.actionType === "create_first_claim"
      ? "/app/new"
      : dashboard.primaryAction.actionType === "start_session" && dashboard.primaryAction.targetId
        ? `/app/session/${dashboard.primaryAction.targetId}`
        : dashboard.primaryAction.targetId
          ? `/app/maps/${dashboard.primaryAction.targetId}`
          : "/app";
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
              <Link href={primaryLink}>
                <Button className="gap-2" data-onboarding-target="start-map">
                  {dashboard.primaryAction.label}
                  <ArrowRight className="size-4" />
                </Button>
              </Link>
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
