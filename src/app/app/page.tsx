import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ShapeDashboard } from "@/components/penny/shape-dashboard";
import {
  buildAdvancedThinkingDashboard,
  buildCalibrationDashboard,
  buildCommunityCommonsDashboard,
  derivePennyShapes,
} from "@/lib/penny-insights";
import { listThoughtMaps } from "@/server/thought-map";

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
  const allNodes = maps.flatMap((map) => map.nodes);
  const shapes = derivePennyShapes(allNodes).sort((a, b) => b.confidence - a.confidence).slice(0, 4);
  const calibration = buildCalibrationDashboard(maps);
  const communitySnapshot = buildCommunityCommonsDashboard(maps, allNodes);
  const advancedSnapshot = buildAdvancedThinkingDashboard(maps, allNodes);
  const mapCards = maps.map((map) => ({
    map,
    counts: summarizeNodeStatus(map.nodes),
  }));

  return (
    <div className="space-y-8">
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

          <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5 xl:col-span-2">
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted-ink)]">Thought-partner matching</p>
            <p className="mt-3 text-sm leading-7 text-[var(--ink)]">
              Matching stays one-to-one and bounded to structurally similar questions.
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

      <ShapeDashboard shapes={shapes} calibration={calibration} initialFeedback={{}} />

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
