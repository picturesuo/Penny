import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { HomeDashboard } from "@/components/penny/home-dashboard";
import { CalibrationCoachingView } from "@/components/penny/calibration-coaching";
import { NotificationPreferencesView } from "@/components/penny/notification-preferences";
import { ShapeDashboard } from "@/components/penny/shape-dashboard";
import {
  buildAdvancedThinkingDashboard,
  buildCalibrationDashboard,
  buildCommunityCommonsDashboard,
  buildMemoryTimeDashboard,
  derivePennyShapes,
} from "@/lib/penny-insights";
import { buildCalibrationCoaching } from "@/lib/calibration";
import { buildCalibrationTrackRecord, buildShareableTrackRecord } from "@/lib/calibration-track-record";
import { getLessonLibrary } from "@/server/lesson-library";
import { buildMarginSurfaceSnapshot } from "@/lib/margin";
import { listQuickCaptures } from "@/server/quick-capture";
import { listSessions } from "@/server/penny";
import { listThoughtMaps } from "@/server/thought-map";
import { getCurrentAuthenticatedUserId } from "@/server/auth";

const foundation = [
  {
    title: "Lens",
    copy: "A bounded user model built from high-confidence shapes, current goals, active claims, and only the precedents needed for the next answer.",
  },
  {
    title: "Overrides",
    copy: "Every disagreement becomes a move with an explicit failure mode so Penny can learn from the exact reason the user pushed back.",
  },
  {
    title: "Precedents",
    copy: "Seed cases and failure modes give the system a real retrieval substrate instead of generic web search or vague similarity matching.",
  },
];

const community = [
  {
    title: "Precedent contributions",
    copy: "Users can optionally contribute anonymized, structured post-mortems so the failure corpus grows as a commons instead of a private stash.",
  },
  {
    title: "Cross-user provenance",
    copy: "When two users hold claims from the same source, Penny can flag source-level contradiction only through privacy-safe aggregation.",
  },
  {
    title: "Research mode",
    copy: "Aggregate unresolved patterns can surface as public anonymized research for researchers, journalists, and funders.",
  },
  {
    title: "Thought-partner matching",
    copy: "Optional one-to-one matching connects users with structurally similar questions without turning the product into a feed.",
  },
] as const;

const curriculum = [
  {
    title: "Student mode tunnel",
    copy: "Capture claims, stress-test structure, teach through confusion, synthesize an outline, then hand prose off to downstream AI.",
  },
  {
    title: "Instructor surface",
    copy: "With permission, teachers can inspect the structural progression of thinking across a project and grade process, not just output.",
  },
  {
    title: "Classroom shape views",
    copy: "Aggregate patterns across a class so instructors can see bottlenecks like students abandoning at the counterargument stage.",
  },
  {
    title: "Metacognition rubrics",
    copy: "Evaluate the shapes visible in the traversal, not only the final artifact, so students are rewarded for better thinking.",
  },
  {
    title: "Curriculum packs",
    copy: "Pre-built tunnel variants for investment theses, research proposals, product specs, and argumentative essays with task-specific exit criteria.",
  },
] as const;

function summarizeNodeStatus(nodes: Awaited<ReturnType<typeof listThoughtMaps>>[number]["nodes"]) {
  return nodes.reduce(
    (counts, node) => {
      counts[node.nodeStatus] += 1;
      return counts;
    },
    { active: 0, weak: 0, superseded: 0 },
  );
}

export default async function DashboardPage() {
  const maps = await listThoughtMaps();
  const sessions = await listSessions();
  const userId = await getCurrentAuthenticatedUserId();
  const fragments = await listQuickCaptures(userId);
  const allNodes = maps.flatMap((map) => map.nodes);
  const shapes = derivePennyShapes(allNodes).sort((a, b) => b.confidence - a.confidence).slice(0, 4);
  const calibration = buildCalibrationDashboard(maps);
  const calibrationCoaching = buildCalibrationCoaching(maps);
  const calibrationTrackRecord = buildCalibrationTrackRecord(maps);
  const shareableTrackRecord = buildShareableTrackRecord(calibrationTrackRecord, "You", process.env.CALIBRATION_TRACK_SECRET ?? null);
  const lessonLibrary = await getLessonLibrary(userId);
  const communitySnapshot = buildCommunityCommonsDashboard(maps, allNodes);
  const advancedSnapshot = buildAdvancedThinkingDashboard(maps, allNodes);
  const memoryTime = buildMemoryTimeDashboard(maps);
  const marginSnapshot = buildMarginSurfaceSnapshot(fragments, { sphere: "work" });
  const mapCards = maps.map((map) => ({
    map,
    counts: summarizeNodeStatus(map.nodes),
  }));

  return (
    <div className="space-y-8">
      <HomeDashboard userId={userId} maps={maps} sessions={sessions} fragments={fragments} />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Brain</p>
          <h1 className="mt-2 text-4xl font-semibold text-[var(--ink)]">Brain is the product. Challenge and Learn live on the same graph.</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--muted-ink)]">
            Each map starts as raw thought, then turns into claims, moves, shapes, and next actions the user can sharpen live.
          </p>
        </div>
        <Link href="/app/new">
          <Button className="gap-2">
            <Plus className="size-4" />
            Start thought map
          </Button>
        </Link>
      </div>

      <Card className="p-6 sm:p-8">
        <div className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Foundation stack</p>
          <h2 className="mt-3 text-3xl font-semibold text-[var(--ink)] sm:text-4xl">
            Lens, overrides, and precedents are the substrate under Brain.
          </h2>
          <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">
            The dashboard stays decision-oriented by keeping the user model bounded, disagreement explicit, and retrieval grounded in real failure patterns.
          </p>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {foundation.map((item) => (
            <div key={item.title} className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
              <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">{item.title}</p>
              <p className="mt-3 text-sm leading-7 text-[var(--ink)]">{item.copy}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6 sm:p-8">
        <div className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Advanced features</p>
          <h2 className="mt-3 text-3xl font-semibold text-[var(--ink)] sm:text-4xl">
            Emotional stakes, confusion, assumptions, and counter-shapes become explicit surfaces.
          </h2>
          <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">
            These surfaces are meant to keep the product honest when the user is under pressure, drifting into certainty, or repeating the same blind spot across projects.
          </p>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">Emotional-structure shapes</p>
            <p className="mt-3 text-sm leading-7 text-[var(--ink)]">Patterns derived directly from stakes tags, especially where emotion changes the critique shape.</p>
            <div className="mt-4 space-y-3">
              {advancedSnapshot.emotionalStructureShapes.length ? (
                advancedSnapshot.emotionalStructureShapes.map((item) => (
                  <div key={item.stake} className="rounded-2xl border border-black/8 bg-white/70 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-[#e7defa] text-[#5c4c88]">{item.stake}</Badge>
                      <Badge className="bg-white text-[var(--muted-ink)]">{item.mapCount} maps</Badge>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{item.summary}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">{item.prompt}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-7 text-[var(--muted-ink)]">No stakes-tagged emotional shapes are ready yet.</p>
              )}
            </div>
          </div>

          <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">Confusion log</p>
            <p className="mt-3 text-sm leading-7 text-[var(--ink)]">Dedicated unresolved questions stay visible instead of being prematurely closed.</p>
            <div className="mt-4 space-y-3">
              {advancedSnapshot.confusionLog.length ? (
                advancedSnapshot.confusionLog.map((item) => (
                  <div key={item.nodeId} className="rounded-2xl border border-black/8 bg-white/70 p-4">
                    <p className="text-sm font-medium text-[var(--ink)]">{item.title}</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{item.confusion}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">{item.nextStep}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-7 text-[var(--muted-ink)]">No unresolved-question surface is strong enough to promote yet.</p>
              )}
            </div>
          </div>

          <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">Assumption archaeology</p>
            <p className="mt-3 text-sm leading-7 text-[var(--ink)]">Hidden scaffolding is surfaced before it hardens into invisible structure.</p>
            <div className="mt-4 space-y-3">
              {advancedSnapshot.assumptionArchaeology.length ? (
                advancedSnapshot.assumptionArchaeology.map((item) => (
                  <div key={item.mapId} className="rounded-2xl border border-black/8 bg-white/70 p-4">
                    <p className="text-sm font-medium text-[var(--ink)]">{item.title}</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{item.hiddenScaffold}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.assumptions.slice(0, 3).map((assumption) => (
                        <Badge key={assumption} className="bg-white text-[var(--muted-ink)]">
                          {assumption}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-7 text-[var(--muted-ink)]">No explicit assumptions are ready to excavate yet.</p>
              )}
            </div>
          </div>

          <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">Counter-shape mode</p>
            <p className="mt-3 text-sm leading-7 text-[var(--ink)]">The lens periodically turns against its own favorite pattern so it doesn’t become an echo chamber.</p>
            <div className="mt-4 space-y-3">
              {advancedSnapshot.counterShapes.length ? (
                advancedSnapshot.counterShapes.map((item) => (
                  <div key={item.label} className="rounded-2xl border border-black/8 bg-white/70 p-4">
                    <p className="text-sm font-medium text-[var(--ink)]">{item.label}</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{item.reason}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">{item.counterTest}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-7 text-[var(--muted-ink)]">No dominant shape exists yet to flip against.</p>
              )}
            </div>
          </div>

          <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">Honest confidence reset</p>
            <p className="mt-3 text-sm leading-7 text-[var(--ink)]">Long-lived claims should be forced back into review before confidence drifts into habit.</p>
            <div className="mt-4 space-y-3">
              {advancedSnapshot.confidenceResets.length ? (
                advancedSnapshot.confidenceResets.map((item) => (
                  <div key={item.mapId} className="rounded-2xl border border-black/8 bg-white/70 p-4">
                    <p className="text-sm font-medium text-[var(--ink)]">{item.title}</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{item.resetPrompt}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">
                      {item.ageDays} days old · {item.confidence}% confidence
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-7 text-[var(--muted-ink)]">No claims are stale enough to force a reset yet.</p>
              )}
            </div>
          </div>

          <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5 xl:col-span-2">
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">Cross-project stress-test pattern library</p>
            <p className="mt-3 text-sm leading-7 text-[var(--ink)]">Repeated structural weaknesses should compound into personal precedent, not disappear between projects.</p>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {advancedSnapshot.crossProjectPatterns.length ? (
                advancedSnapshot.crossProjectPatterns.map((item) => (
                  <div key={item.label} className="rounded-2xl border border-black/8 bg-white/70 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-[#d9ead8] text-[#355b32]">{item.mapCount} maps</Badge>
                    </div>
                    <p className="mt-3 text-sm font-medium text-[var(--ink)]">{item.label}</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{item.summary}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">{item.handleItLikeThis}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-7 text-[var(--muted-ink)]">No cross-project pattern is stable enough to promote yet.</p>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6 sm:p-8">
        <div className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Memory & time</p>
          <h2 className="mt-3 text-3xl font-semibold text-[var(--ink)] sm:text-4xl">
            Beliefs, predictions, and decisions should have a visible rhythm.
          </h2>
          <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">
            Penny should make change over time legible: what the user used to believe, what happened on the resolution date, how quickly beliefs move by domain, and where Penny actually changed the user’s direction.
          </p>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">What I used to believe</p>
            <p className="mt-3 text-sm leading-7 text-[var(--ink)]">A digest of recently updated beliefs, pushed on a reflection rhythm instead of waiting for on-demand recall.</p>
            <div className="mt-4 space-y-3">
              {memoryTime.beliefDigests.length ? (
                memoryTime.beliefDigests.map((item) => (
                  <div key={item.mapId} className="rounded-2xl border border-black/8 bg-white/70 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-[#e7defa] text-[#5c4c88]">{item.updatedBeliefCount} updated beliefs</Badge>
                      <Badge className="bg-white text-[var(--muted-ink)]">{item.updatedAt.toLocaleDateString()}</Badge>
                    </div>
                    <p className="mt-3 text-sm font-medium text-[var(--ink)]">{item.title}</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{item.summary}</p>
                    <div className="mt-3 space-y-2">
                      {item.updatedBeliefs.map((belief) => (
                        <p key={belief} className="rounded-2xl bg-[var(--panel)] px-3 py-2 text-sm leading-6 text-[var(--ink)]">
                          {belief}
                        </p>
                      ))}
                    </div>
                    <p className="mt-3 text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">{item.reviewPrompt}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-7 text-[var(--muted-ink)]">No belief digest is ready yet. Penny needs a few updates before the rhythm becomes visible.</p>
              )}
            </div>
          </div>

          <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">Prediction retrospectives</p>
            <p className="mt-3 text-sm leading-7 text-[var(--ink)]">On the resolution date, Penny should ask what happened and what it says about calibration.</p>
            <div className="mt-4 space-y-3">
              {memoryTime.predictionRetrospectives.length ? (
                memoryTime.predictionRetrospectives.map((item) => (
                  <div key={`${item.mapId}-${item.updatedAt.toISOString()}`} className="rounded-2xl border border-black/8 bg-white/70 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-[#d9ead8] text-[#355b32]">{item.domain}</Badge>
                      <Badge className="bg-white text-[var(--muted-ink)]">{item.resolutionDate ?? "no date"}</Badge>
                      <Badge className="bg-[#e7defa] text-[#5c4c88]">Brier {item.brierScore.toFixed(3)}</Badge>
                    </div>
                    <p className="mt-3 text-sm font-medium text-[var(--ink)]">{item.title}</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
                      You predicted this with {item.confidence}% confidence. {item.summary}
                    </p>
                    <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">{item.reviewPrompt}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-7 text-[var(--muted-ink)]">No resolved claims have reached a retrospective prompt yet.</p>
              )}
            </div>
          </div>

          <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">Intellectual velocity</p>
                <p className="mt-3 text-sm leading-7 text-[var(--ink)]">Some domains should change quickly, while others should harden slowly. Penny should show the rate of improvement, not just the archive state.</p>
              </div>
              <Link href="/app/velocity">
                <Button variant="secondary" className="gap-2">
                  Open dashboard
                  <ArrowRight className="size-4" />
                </Button>
              </Link>
            </div>
            <div className="mt-4 space-y-3">
              {memoryTime.beliefVelocity.length ? (
                memoryTime.beliefVelocity.map((item) => (
                  <div key={item.domain} className="rounded-2xl border border-black/8 bg-white/70 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-white text-[var(--ink)]">{item.domain}</Badge>
                      <Badge className={item.velocityLabel === "volatile" ? "bg-[#fff6ed] text-[#8b4d1f]" : item.velocityLabel === "rigid" ? "bg-[#d9ead8] text-[#355b32]" : "bg-[#e7defa] text-[#5c4c88]"}>{item.velocityLabel}</Badge>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">{item.summary}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">
                      {item.updateCount} belief updates · {item.sampleSize} maps · avg lag {item.averageLagDays != null ? `${item.averageLagDays}d` : "n/a"}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-7 text-[var(--muted-ink)]">Intellectual velocity will appear once there is enough update history to compare domains.</p>
              )}
            </div>
          </div>

          <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">Decisions under Penny</p>
            <p className="mt-3 text-sm leading-7 text-[var(--ink)]">A running log of moments when critique changed the user’s direction instead of simply adding commentary.</p>
            <div className="mt-4 space-y-3">
              {memoryTime.decisionInfluence.length ? (
                memoryTime.decisionInfluence.map((item) => (
                  <div key={`${item.mapId}-${item.updatedAt.toISOString()}`} className="rounded-2xl border border-black/8 bg-white/70 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-[#e7defa] text-[#5c4c88]">{item.changedDirection}</Badge>
                      <Badge className="bg-white text-[var(--muted-ink)]">{item.updatedAt.toLocaleDateString()}</Badge>
                    </div>
                    <p className="mt-3 text-sm font-medium text-[var(--ink)]">{item.title}</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{item.summary}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-7 text-[var(--muted-ink)]">No direction-change log is strong enough to promote yet.</p>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6 sm:p-8">
        <div className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Switching-cost layer</p>
          <h2 className="mt-3 text-3xl font-semibold text-[var(--ink)] sm:text-4xl">
            The product should make leaving expensive in the right ways.
          </h2>
          <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">
            These named surfaces reincorporate the richer switching-cost story: autobiography, fingerprint, archive, loss, time locks, forgetting, and counterfactuals stay visible as first-class concepts instead of dissolving into generic dashboards.
          </p>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">Intellectual autobiography system</p>
            <p className="mt-3 text-sm leading-7 text-[var(--ink)]">
              A structured history of what you used to believe, what changed, and which maps moved your mind.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge className="bg-white text-[var(--ink)]">{memoryTime.beliefDigests.length} belief digests</Badge>
              <Badge className="bg-[#e7defa] text-[#5c4c88]">{maps.length} maps</Badge>
            </div>
          </div>

          <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">Living cognitive fingerprint</p>
            <p className="mt-3 text-sm leading-7 text-[var(--ink)]">
              The current shape set and calibration profile should read like a fingerprint of how this user thinks right now.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge className="bg-white text-[var(--ink)]">{shapes.length} active shapes</Badge>
              <Badge className="bg-[#d9ead8] text-[#355b32]">{calibration.domains.length} calibrated domains</Badge>
            </div>
          </div>

          <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">Irreplaceable decision archive</p>
            <p className="mt-3 text-sm leading-7 text-[var(--ink)]">
              Decisions should survive later regret. Maps, fragments, and resolved claims together form the archive of why a choice was made.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge className="bg-white text-[var(--ink)]">{mapCards.length} map records</Badge>
              <Badge className="bg-[#e7defa] text-[#5c4c88]">{fragments.length} fragments</Badge>
            </div>
          </div>

          <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">What you would lose</p>
            <p className="mt-3 text-sm leading-7 text-[var(--ink)]">
              This makes the opportunity cost legible: what disappears if the archive, shapes, and historical context are not carried forward.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge className="bg-[#fff6ed] text-[#8b4d1f]">{marginSnapshot.floatingCount} floating fragments</Badge>
              <Badge className="bg-white text-[var(--ink)]">{marginSnapshot.archivedCount} archived fragments</Badge>
            </div>
          </div>

          <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">Time-locked features</p>
            <p className="mt-3 text-sm leading-7 text-[var(--ink)]">
              Some surfaces only matter once time has passed: resolution prompts, retrospectives, revisit queues, and delayed calibration checks.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge className="bg-white text-[var(--ink)]">{memoryTime.predictionRetrospectives.length} retrospectives</Badge>
              <Badge className="bg-[#d9ead8] text-[#355b32]">{calibration.resolvedClaims.length} resolved claims</Badge>
            </div>
          </div>

          <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">Cascading forget with audit</p>
            <p className="mt-3 text-sm leading-7 text-[var(--ink)]">
              Forgetting should not be silent. Archive, hide, or vault operations should leave a durable trail so users can review what was removed and why.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge className="bg-white text-[var(--ink)]">{communitySnapshot.contributions.length} review-gated contributions</Badge>
              <Badge className="bg-[#e7defa] text-[#5c4c88]">{marginSnapshot.promotedCount} promoted fragments</Badge>
            </div>
          </div>

          <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">Counterfactual engine</p>
            <p className="mt-3 text-sm leading-7 text-[var(--ink)]">
              Resolved claims become branching decision histories: Penny reconstructs what would have happened at capture, day 30, day 60, and day 90 from the recorded timeline.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge className="bg-white text-[var(--ink)]">{calibration.resolvedClaims.length} resolved claims</Badge>
              <Badge className="bg-[#fff6ed] text-[#8b4d1f]">{memoryTime.predictionRetrospectives.length} post-mortems</Badge>
              <Badge className="bg-[#d9ead8] text-[#355b32]">Day 0 / 30 / 60 / 90 branches</Badge>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/app/counterfactuals">
                <Button variant="secondary" className="gap-2">
                  Open archive
                  <ArrowRight className="size-4" />
                </Button>
              </Link>
            </div>
          </div>

          <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">Lesson library</p>
            <p className="mt-3 text-sm leading-7 text-[var(--ink)]">
              Post-mortems, strong concessions, resolutions, and counterfactuals are distilled into reusable lessons that resurface when a new claim matches a prior pattern.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge className="bg-white text-[var(--ink)]">{lessonLibrary.totalLessons} lessons</Badge>
              <Badge className="bg-[#e7defa] text-[#5c4c88]">{lessonLibrary.appliedLessons} applied</Badge>
              <Badge className="bg-[#d9ead8] text-[#355b32]">{lessonLibrary.lessonsByType.size} lesson types</Badge>
            </div>
            {lessonLibrary.mostRecentLesson ? (
              <p className="mt-4 text-sm leading-7 text-[var(--muted-ink)]">
                Latest lesson: {lessonLibrary.mostRecentLesson.lessonText.slice(0, 120)}
                {lessonLibrary.mostRecentLesson.lessonText.length > 120 ? "..." : ""}
              </p>
            ) : (
              <p className="mt-4 text-sm leading-7 text-[var(--muted-ink)]">
                No lessons have been distilled yet. The archive starts the first time a claim resolves or a strong concession lands.
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/app/lessons">
                <Button variant="secondary" className="gap-2">
                  Open library
                  <ArrowRight className="size-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6 sm:p-8">
        <div className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Margin</p>
          <h2 className="mt-3 text-3xl font-semibold text-[var(--ink)] sm:text-4xl">
            Fleeting thoughts can stay alive without interrupting the main thread.
          </h2>
          <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">
            Penny keeps a low-friction margin lane open for fragments that are not ready to become claims yet. The best ones cluster, resurface, and eventually graduate.
          </p>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">Surface</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-white/70 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">Floating</p>
                <p className="mt-2 text-lg font-semibold text-[var(--ink)]">{marginSnapshot.floatingCount}</p>
              </div>
              <div className="rounded-2xl bg-white/70 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">Clusters</p>
                <p className="mt-2 text-lg font-semibold text-[var(--ink)]">{marginSnapshot.clusters.length}</p>
              </div>
              <div className="rounded-2xl bg-white/70 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">Surfaced</p>
                <p className="mt-2 text-lg font-semibold text-[var(--ink)]">{marginSnapshot.surfacedCount}</p>
              </div>
              <div className="rounded-2xl bg-white/70 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">Promoted</p>
                <p className="mt-2 text-lg font-semibold text-[var(--ink)]">{marginSnapshot.promotedCount}</p>
              </div>
            </div>
          </div>
          <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">Weekly review</p>
            <div className="mt-3 space-y-3">
              {marginSnapshot.weeklyReview.length ? (
                marginSnapshot.weeklyReview.map((fragment) => (
                  <div key={fragment.id} className="rounded-2xl border border-black/8 bg-white/70 p-4">
                    <p className="text-sm leading-6 text-[var(--ink)]">{fragment.content}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">
                      {fragment.status} · {fragment.sphere}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-7 text-[var(--muted-ink)]">No fragment is old or clustered enough to surface yet.</p>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6 sm:p-8">
        <div className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Curriculum & education</p>
          <h2 className="mt-3 text-3xl font-semibold text-[var(--ink)] sm:text-4xl">
            The tunnel can be tuned for students, instructors, and classrooms.
          </h2>
          <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">
            Penny should work as a learning instrument, not only a personal thinking tool. These variants keep the same core workflow but change the exit criteria for the task at hand.
          </p>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {curriculum.map((item) => (
            <div key={item.title} className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
              <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">{item.title}</p>
              <p className="mt-3 text-sm leading-7 text-[var(--ink)]">{item.copy}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6 sm:p-8">
        <div className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Community commons</p>
          <h2 className="mt-3 text-3xl font-semibold text-[var(--ink)] sm:text-4xl">
            Social features are opt-in, targeted, and privacy-first.
          </h2>
          <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">
            Penny can grow a shared failure commons without becoming a public feed. The design stays high-trust by default: anonymize before contribution, aggregate before publication, and keep matching one-to-one.
          </p>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {community.map((item) => (
            <div key={item.title} className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
              <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">{item.title}</p>
              <p className="mt-3 text-sm leading-7 text-[var(--ink)]">{item.copy}</p>
            </div>
          ))}
        </div>
        <p className="mt-5 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
          Privacy guardrails: no raw cross-user claim graphs, no feed, no default publication, and no matching without explicit user intent.
        </p>
        <div className="mt-8 grid gap-4 xl:grid-cols-2">
          <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">Precedent corpus</p>
            <p className="mt-3 text-sm leading-7 text-[var(--ink)]">
              Anonymized post-mortems are review-gated before they join the commons.
            </p>
            <div className="mt-4 space-y-3">
              {communitySnapshot.contributions.length ? (
                communitySnapshot.contributions.map((item) => (
                  <div key={`${item.displayLabel}-${item.updatedAt.toISOString()}`} className="rounded-2xl border border-black/8 bg-white/70 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-[#e7defa] text-[#5c4c88]">{item.displayLabel}</Badge>
                      <Badge className="bg-white text-[var(--muted-ink)]">Review-gated</Badge>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{item.summary}</p>
                    <p className="mt-2 text-xs leading-5 text-[var(--muted-ink)]">{item.sourceHint}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">{item.reviewGate}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-7 text-[var(--muted-ink)]">No review-gated post-mortems are ready for the commons yet.</p>
              )}
            </div>
          </div>

          <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">Cross-user contradiction signals</p>
            <p className="mt-3 text-sm leading-7 text-[var(--ink)]">
              Penny surfaces source-level disagreement only when it can stay privacy-aware.
            </p>
            <div className="mt-4 space-y-3">
              {communitySnapshot.contradictionSignals.length ? (
                communitySnapshot.contradictionSignals.map((item) => (
                  <div key={`${item.sourceLabel}-${item.updatedAt.toISOString()}`} className="rounded-2xl border border-black/8 bg-white/70 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-[#d9ead8] text-[#355b32]">{item.sourceLabel}</Badge>
                      <Badge className="bg-white text-[var(--muted-ink)]">{item.mapCount} captures</Badge>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{item.summary}</p>
                    <p className="mt-2 text-xs leading-5 text-[var(--muted-ink)]">{item.privacyNote}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-7 text-[var(--muted-ink)]">No source-level contradiction signals are strong enough to surface yet.</p>
              )}
            </div>
          </div>

          <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">Aggregate open questions</p>
            <p className="mt-3 text-sm leading-7 text-[var(--ink)]">
              Repeated unresolved patterns can be exported as a public-good research surface.
            </p>
            <div className="mt-4 space-y-3">
              {communitySnapshot.openQuestions.length ? (
                communitySnapshot.openQuestions.map((item) => (
                  <div key={`${item.topic}-${item.updatedAt.toISOString()}`} className="rounded-2xl border border-black/8 bg-white/70 p-4">
                    <p className="text-sm font-medium text-[var(--ink)]">{item.topic}</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{item.summary}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">{item.researchPrompt}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-7 text-[var(--muted-ink)]">No aggregate open-question surface is ready yet.</p>
              )}
            </div>
          </div>

          <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">Anonymized shape library</p>
            <p className="mt-3 text-sm leading-7 text-[var(--ink)]">
              Opt-in shared shapes help users calibrate against common thinking patterns without exposing the underlying graph.
            </p>
            <div className="mt-4 space-y-3">
              {communitySnapshot.shapeLibrary.length ? (
                communitySnapshot.shapeLibrary.map((item) => (
                  <div key={`${item.label}-${item.kind}`} className="rounded-2xl border border-black/8 bg-white/70 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-white text-[var(--ink)]">{item.kind}</Badge>
                      <Badge className="bg-[#f5d6b3] text-[#8b4d1f]">{item.mapCount} maps</Badge>
                    </div>
                    <p className="mt-3 text-sm font-medium text-[var(--ink)]">{item.label}</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{item.summary}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-7 text-[var(--muted-ink)]">No anonymized shapes are strong enough to share yet.</p>
              )}
            </div>
          </div>

          <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">Shared sphere with a co-thinker</p>
            <p className="mt-3 text-sm leading-7 text-[var(--ink)]">
              A shared sphere keeps authorship visible and disagreement first-class without turning the product into a public feed.
            </p>
            <div className="mt-4 space-y-3">
              {communitySnapshot.sharedSpherePreviews.length ? (
                communitySnapshot.sharedSpherePreviews.map((item) => (
                  <div key={`${item.mapIds.join("-")}-${item.titles.join("-")}`} className="rounded-2xl border border-black/8 bg-white/70 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      {item.authorshipMarkers.map((marker) => (
                        <Badge key={marker} className={marker === "You" ? "bg-[#d9ead8] text-[#355b32]" : "bg-[#e7defa] text-[#5c4c88]"}>
                          {marker}
                        </Badge>
                      ))}
                      <Badge className="bg-white text-[var(--muted-ink)]">{item.mapIds.length} maps</Badge>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{item.summary}</p>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{item.guardrail}</p>
                    <p className="mt-2 text-xs leading-5 text-[var(--muted-ink)]">{item.privacyNote}</p>
                    <p className="mt-3 text-sm font-medium text-[var(--ink)]">{item.titles.join(" + ")}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-7 text-[var(--muted-ink)]">No bounded shared sphere is strong enough to suggest yet.</p>
              )}
            </div>
          </div>

          <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">Advisor review mode</p>
            <p className="mt-3 text-sm leading-7 text-[var(--ink)]">
              Advisors can critique the map without editing it, which keeps ownership clean while still making review useful.
            </p>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {communitySnapshot.advisorReviewModes.length ? (
                communitySnapshot.advisorReviewModes.map((item) => (
                  <div key={`${item.title}-${item.updatedAt.toISOString()}`} className="rounded-2xl border border-black/8 bg-white/70 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-[#e7defa] text-[#5c4c88]">{item.reviewerLabel}</Badge>
                      <Badge className="bg-white text-[var(--muted-ink)]">critique-only</Badge>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{item.critiqueOnly}</p>
                    <p className="mt-2 text-xs leading-5 text-[var(--muted-ink)]">{item.permissionsNote}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">{item.reviewPrompt}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-7 text-[var(--muted-ink)]">No advisor-review mode is strong enough to suggest yet.</p>
              )}
            </div>
          </div>

          <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5 xl:col-span-2">
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">Thought-partner matching</p>
            <p className="mt-3 text-sm leading-7 text-[var(--ink)]">
              Matching stays one-to-one, bounded, and time-limited to structurally similar questions rather than broad social discovery.
            </p>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {communitySnapshot.thoughtPartnerMatches.length ? (
                communitySnapshot.thoughtPartnerMatches.map((item) => (
                  <div key={`${item.mapIds.join("-")}-${item.sharedShapes.join("-")}`} className="rounded-2xl border border-black/8 bg-white/70 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-[#e7defa] text-[#5c4c88]">Potential match</Badge>
                      <Badge className="bg-white text-[var(--muted-ink)]">{item.sharedShapes.length} shared shapes</Badge>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[var(--ink)]">
                      {item.titles.join(" + ")}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{item.reason}</p>
                    <p className="mt-2 text-xs leading-5 text-[var(--muted-ink)]">{item.privacyNote}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-7 text-[var(--muted-ink)]">No bounded partner matches are strong enough to suggest yet.</p>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6 sm:p-8">
        <div className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted-ink)]">Cross-project transfer</p>
          <h2 className="mt-3 text-3xl font-semibold text-[var(--ink)] sm:text-4xl">
            Shapes learned in one map carry into the next one.
          </h2>
          <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">
            Penny derives shapes across all maps, so the next project starts with a sharper stress-test lens instead of a blank slate. The user gets better across contexts, not just within one workspace.
          </p>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {shapes.length ? (
            shapes.map((shape) => (
              <div key={shape.id} className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-white text-[var(--ink)]">{shape.kind}</Badge>
                  <Badge className="bg-[#e7defa] text-[#5c4c88]">{shape.sourceMapIds.length} maps</Badge>
                </div>
                <p className="mt-3 text-sm leading-7 text-[var(--ink)]">{shape.label}</p>
                <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{shape.summary}</p>
              </div>
            ))
          ) : (
            <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5 lg:col-span-3">
              <p className="text-sm leading-7 text-[var(--muted-ink)]">
                No reusable shapes yet. Once a few maps exist, Penny will start carrying the strongest patterns into new projects.
              </p>
            </div>
          )}
        </div>
      </Card>

      <ShapeDashboard shapes={shapes} calibration={calibration} initialFeedback={{}} trackRecord={shareableTrackRecord} />

      <CalibrationCoachingView coaching={calibrationCoaching} />

      <NotificationPreferencesView userId={userId} />

      {mapCards.length ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {mapCards.map(({ map, counts }) => {
            return (
              <Card key={map.id} className="p-6">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted-ink)]">Map</p>
                <h2 className="mt-3 text-2xl font-semibold text-[var(--ink)]">{map.title}</h2>
                <p className="mt-3 text-sm leading-7 text-[var(--muted-ink)]">{map.rawThought}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Badge className="bg-[#d9ead8] text-[#355b32]">Active {counts.active}</Badge>
                  <Badge className="bg-[#f5d6b3] text-[#8b4d1f]">Weak {counts.weak}</Badge>
                  <Badge className="bg-black/8 text-[var(--muted-ink)]">Superseded {counts.superseded}</Badge>
                </div>
                <Link href={`/app/maps/${map.id}`} className="mt-6 inline-flex">
                  <Button className="gap-2">
                    Open map
                    <ArrowRight className="size-4" />
                  </Button>
                </Link>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="p-10">
          <h2 className="text-2xl font-semibold text-[var(--ink)]">No thought maps yet</h2>
          <p className="mt-3 max-w-xl text-base leading-7 text-[var(--muted-ink)]">
            Start with one rough wiki entry. Penny will branch it into claims, stakes, assumptions, counterarguments, research paths, and the next node worth improving.
          </p>
        </Card>
      )}
    </div>
  );
}
