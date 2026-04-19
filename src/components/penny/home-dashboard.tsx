import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { GlobalSearch } from "@/components/penny/global-search";
import { OnboardingChecklist } from "@/components/penny/onboarding-checklist";
import { OnboardingSpotlight } from "@/components/penny/onboarding-spotlight";
import { QuickCapture } from "@/components/penny/quick-capture";
import { CaptureInbox } from "@/components/penny/capture-inbox";
import { NoMapsEmptyState } from "@/components/penny/states";
import { buildHomeDashboard } from "@/lib/home-dashboard";
import { buildOnboardingChecklist, buildOnboardingState, getOnboardingPrompt } from "@/lib/onboarding";
import type { MarginFragmentModel, SessionCardModel } from "@/types/penny";
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
  fragments: MarginFragmentModel[];
}) {
  const dashboard = buildHomeDashboard({ userId, maps, sessions, fragments });
  const onboardingState = buildOnboardingState({ userId, maps, sessions, fragments });
  const onboardingChecklist = buildOnboardingChecklist({ maps, sessions, fragments });
  const onboardingPrompt = getOnboardingPrompt(onboardingState.currentStep);
  const primaryLink =
    dashboard.primaryAction.actionType === "create_first_claim"
      ? "/app/new"
      : dashboard.primaryAction.actionType === "start_session" && dashboard.primaryAction.targetId
        ? `/app/session/${dashboard.primaryAction.targetId}`
      : dashboard.primaryAction.targetId
        ? `/app/maps/${dashboard.primaryAction.targetId}`
        : dashboard.primaryAction.actionType === "search"
          ? "/app/search"
          : "/app";

  return (
    <section className="space-y-6">
      <Card className="overflow-hidden border-black/8 bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(243,241,232,0.96))] p-6 sm:p-8">
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
              Penny opens on the thing you most need right now: onboarding, search, quick capture, recent work, or the next critique-worthy claim.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href={primaryLink} data-onboarding-target="start-map">
                <Button className="gap-2">
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
              <QuickCapture />
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

      {maps.length === 0 ? <NoMapsEmptyState /> : null}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <OnboardingSpotlight prompt={onboardingPrompt} />
          <OnboardingChecklist checklist={onboardingChecklist} />
          <Card className="p-6" data-onboarding-target="map-preview">
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Quick search</p>
            <h3 className="mt-2 text-2xl font-semibold text-[var(--ink)]">Find a claim, map, artifact, or shape</h3>
            <p className="mt-2 text-sm leading-7 text-[var(--muted-ink)]">
              The search surface is deterministic first, with enough structure to keep the daily workflow moving.
            </p>
            <div className="mt-4">
              <GlobalSearch userId={userId} />
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <CaptureInbox
            captures={fragments}
          />

          <Card className="p-6" data-onboarding-target="identity-archive">
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Identity archive</p>
            <h3 className="mt-2 text-2xl font-semibold text-[var(--ink)]">Biography and fingerprint</h3>
            <p className="mt-2 text-sm leading-7 text-[var(--muted-ink)]">
              Review the chapterized story of how your mind changed and the named patterns Penny has learned from your history.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/app/identity">
                <Button className="gap-2">
                  Open identity
                  <ArrowRight className="size-4" />
                </Button>
              </Link>
              <Badge className="bg-[var(--panel)] text-[var(--ink)]">{maps.length} maps observed</Badge>
            </div>
          </Card>

          <Card className="p-6" data-onboarding-target="recent-maps">
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Recent maps</p>
            <div className="mt-4 space-y-3">
              {maps.slice(0, 4).map((map) => (
                <Link key={map.id} href={`/app/maps/${map.id}`} className="block rounded-[22px] border border-black/8 bg-[var(--panel)] p-4 transition hover:border-black/15">
                  <p className="text-sm font-medium text-[var(--ink)]">{map.title}</p>
                  <p className="mt-1 text-sm leading-6 text-[var(--muted-ink)]">{map.nodes.length} nodes · {map.artifacts.length} artifacts</p>
                </Link>
              ))}
              {maps.length === 0 ? (
                <p className="text-sm leading-7 text-[var(--muted-ink)]">Your first map will show up here.</p>
              ) : null}
            </div>
          </Card>

          <Card className="p-6" data-onboarding-target="recent-sessions">
            <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Recent sessions</p>
            <div className="mt-4 space-y-3">
              {sessions.slice(0, 4).map((session) => (
                <div key={session.id} className="rounded-[22px] border border-black/8 bg-[var(--panel)] p-4">
                  <p className="text-sm font-medium text-[var(--ink)]">{session.title}</p>
                  <p className="mt-1 text-sm leading-6 text-[var(--muted-ink)]">
                    Stage {session.currentStage} · Clarity {session.clarityScore}
                  </p>
                </div>
              ))}
              {sessions.length === 0 ? (
                <p className="text-sm leading-7 text-[var(--muted-ink)]">Sessions will appear here once you start thinking through a map.</p>
              ) : null}
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
}
