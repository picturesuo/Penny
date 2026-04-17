import { cleanSentence } from "@/lib/penny";
import { buildPennyLens, type PennyLensSnapshot } from "@/lib/penny-insights";
import type {
  FounderBriefModel,
  FounderBriefReadiness,
  FounderBriefRequirement,
  ThoughtMapModel,
  ThoughtNodeModel,
} from "@/types/thought-map";

const REQUIRED_FOUNDER_BRIEF_KINDS: FounderBriefRequirement[] = [
  "assumption",
  "counter_argument",
  "research",
];

function activeNodes(map: ThoughtMapModel) {
  return map.nodes.filter((node) => node.nodeStatus === "active");
}

function byPriority(
  nodes: ThoughtNodeModel[],
  rank: (node: ThoughtNodeModel) => number,
) {
  return [...nodes].sort(
    (a, b) =>
      rank(b) - rank(a) ||
      a.branchOrder - b.branchOrder ||
      a.createdAt.getTime() - b.createdAt.getTime(),
  );
}

function fallbackTargetUser(text: string) {
  const lower = text.toLowerCase();
  const patterns = [
    { match: /(founder|startup|entrepreneur)/, value: "early-stage founders" },
    { match: /(developer|engineer|programmer)/, value: "software engineers" },
    { match: /(creator|influencer|youtube|tiktok)/, value: "independent creators" },
    { match: /(sales|revenue|prospect)/, value: "sales teams" },
    { match: /(compliance|audit|regulatory)/, value: "compliance teams" },
    { match: /(contractor|trades|plumber|electrician)/, value: "local contractors" },
    { match: /(student|education|school)/, value: "students" },
  ];

  return patterns.find((pattern) => pattern.match.test(lower))?.value ?? "a narrow founder-defined user";
}

function inferTargetUser(map: ThoughtMapModel) {
  const claimText = activeNodes(map)
    .filter((node) => node.kind === "core_claim" || node.kind === "why_it_matters")
    .map((node) => node.content)
    .join(" ");

  return fallbackTargetUser(`${map.rawThought} ${claimText}`);
}

function chooseCoreClaim(map: ThoughtMapModel) {
  const claims = activeNodes(map).filter((node) => node.kind === "core_claim");

  if (claims.length === 0) {
    return cleanSentence(map.rawThought);
  }

  return byPriority(claims, (node) => (node.scores?.centrality ?? 0) + (node.scores?.strength ?? 0))[0]?.content
    ?? cleanSentence(map.rawThought);
}

function lensSignals(lens: PennyLensSnapshot | null) {
  return new Set(
    lens
      ? [
          ...lens.activeShapes.flatMap((shape) => shape.signals),
          ...lens.provisionalShapes.flatMap((shape) => shape.signals),
          ...lens.overrideShapes.flatMap((shape) => shape.signals),
        ]
      : [],
  );
}

function topAssumptions(map: ThoughtMapModel, lens: PennyLensSnapshot | null) {
  const assumptions = activeNodes(map).filter((node) => node.kind === "assumption");
  const signals = lensSignals(lens);
  return byPriority(
    assumptions,
    (node) =>
      (node.scores?.dependencyRisk ?? 0) * 0.65 +
      (node.scores?.centrality ?? 0) * 0.35 +
      (Array.from(signals).some((signal) => node.content.toLowerCase().includes(signal)) ? 0.08 : 0),
  )
    .slice(0, 3)
    .map((node) => node.content);
}

function topCounterarguments(map: ThoughtMapModel, lens: PennyLensSnapshot | null) {
  const counterarguments = activeNodes(map).filter((node) => node.kind === "counter_argument");
  const signals = lensSignals(lens);
  return byPriority(
    counterarguments,
    (node) =>
      (node.scores?.centrality ?? 0) * 0.4 +
      (node.scores?.specificity ?? 0) * 0.35 +
      (node.scores?.tension ?? 0) * 0.25 +
      (Array.from(signals).some((signal) => node.content.toLowerCase().includes(signal)) ? 0.08 : 0),
  )
    .slice(0, 3)
    .map((node) => node.content);
}

function normalizeValidationStep(content: string) {
  return cleanSentence(content).replace(/\.$/, "");
}

function fallbackValidationSteps(map: ThoughtMapModel, assumptions: string[], counterarguments: string[]) {
  const targetUser = inferTargetUser(map);
  const coreClaim = chooseCoreClaim(map);
  const fallbacks = [
    assumptions[0]
      ? `Interview 5 ${targetUser} and test whether this assumption is true: ${assumptions[0]}`
      : `Interview 5 ${targetUser} and ask what would make this problem urgent enough to solve now`,
    counterarguments[0]
      ? `Run one falsification check against this pushback: ${counterarguments[0]}`
      : `Name the strongest reason the current workaround still wins over this idea`,
    `Define one stop-or-go threshold for this claim: ${coreClaim}`,
  ];

  return fallbacks.map(normalizeValidationStep);
}

function nextValidationSteps(
  map: ThoughtMapModel,
  assumptions: string[],
  counterarguments: string[],
  lens: PennyLensSnapshot | null,
) {
  const researchNodes = byPriority(
    activeNodes(map).filter((node) => node.kind === "research"),
    (node) =>
      (node.scores?.testability ?? 0) * 0.4 +
      (node.scores?.specificity ?? 0) * 0.35 +
      (node.scores?.evidence ?? 0) * 0.25,
  ).map((node) => normalizeValidationStep(node.content));

  const steps = [...researchNodes];

  if (lens?.freshness.stale) {
    const freshnessStep = `Refresh the lens before freezing the brief; the latest override is ${lens.freshness.lagMinutes ?? 0} minutes behind the latest move.`;

    if (!steps.includes(freshnessStep)) {
      steps.unshift(freshnessStep);
    }
  }

  for (const fallback of fallbackValidationSteps(map, assumptions, counterarguments)) {
    if (steps.length >= 3) {
      break;
    }

    if (!steps.includes(fallback)) {
      steps.push(fallback);
    }
  }

  return steps.slice(0, 3);
}

function loadBearingClaims(map: ThoughtMapModel) {
  return map.nodes
    .filter((node) => node.nodeStatus === "active" && node.kind !== "root")
    .filter((node) => {
      const centrality = node.scores?.centrality ?? 0;
      const dependencyRisk = node.scores?.dependencyRisk ?? 0;

      return (
        node.kind === "assumption" ||
        node.kind === "core_claim" ||
        node.kind === "why_it_matters" ||
        centrality >= 0.55 ||
        dependencyRisk >= 0.55
      );
    })
    .sort((a, b) => {
      const aScore = (a.scores?.centrality ?? 0) * 0.55 + (a.scores?.dependencyRisk ?? 0) * 0.45;
      const bScore = (b.scores?.centrality ?? 0) * 0.55 + (b.scores?.dependencyRisk ?? 0) * 0.45;

      return bScore - aScore || a.branchOrder - b.branchOrder || a.createdAt.getTime() - b.createdAt.getTime();
    });
}

function stakesLevel(map: ThoughtMapModel, loadBearingCount: number) {
  const missingRequirements = getFounderBriefReadiness(map).missingRequirements.length;
  const load = loadBearingCount + missingRequirements;

  if (load >= 6) {
    return "heavy" as const;
  }

  if (load >= 3) {
    return "moderate" as const;
  }

  return "light" as const;
}

function preMortem(map: ThoughtMapModel, assumptions: string[], counterarguments: string[]) {
  const coreClaim = chooseCoreClaim(map);
  const failureCase = assumptions[0] ?? "the hidden assumption that the map looked stronger than it really was";
  const counterCase = counterarguments[0] ?? "the strongest critique was never turned into a real test";
  const loadBearing = loadBearingClaims(map)[0]?.content ?? coreClaim;

  return cleanSentence(
    `Six months later, this went badly because the strongest-sounding claim '${coreClaim}' outpaced the evidence. The load-bearing branch '${loadBearing}' never got a serious stress test, so the structure felt coherent while hiding the real risk. The team kept treating '${failureCase}' as if it were already validated, and '${counterCase}' was acknowledged but not operationalized. By the time reality arrived, the synthesis artifact looked polished but rested on a brittle dependency chain. The mistake was not a lack of ideas. It was moving to synthesis before the map had earned trust.`,
  );
}

function ifYouWereRight(map: ThoughtMapModel) {
  const coreClaim = chooseCoreClaim(map);
  const targetUser = inferTargetUser(map);

  return cleanSentence(
    `Assume '${coreClaim}' is true. What becomes possible for ${targetUser}, what becomes necessary in the next 30 days, and what would you do differently today if this were already load-bearing?`,
  );
}

function twinCheck(map: ThoughtMapModel, assumptions: string[], counterarguments: string[]) {
  const coreClaim = chooseCoreClaim(map);
  const assumption = assumptions[0] ?? "the most important assumption stays intact";
  const counterargument = counterarguments[0] ?? "the strongest objection still does not break the structure";
  const loadBearing = loadBearingClaims(map).slice(0, 3).map((node) => node.content);
  const loadBearingLine = loadBearing.length
    ? `The load-bearing claims are ${loadBearing.join("; ")}.`
    : "The map does not yet expose a clearly load-bearing skeleton.";

  return cleanSentence(
    `The strongest version of this thinking is that '${coreClaim}' can hold because '${assumption}' remains true and because Penny has already pressure-tested the main objection that '${counterargument}'. ${loadBearingLine} This is the version Penny should use if the user says, "yes, that is what I actually believe."`,
  );
}

function dependencyCompleteness(map: ThoughtMapModel, loadBearingCount: number) {
  const readiness = getFounderBriefReadiness(map);

  if (readiness.eligible) {
    return cleanSentence(
      `${loadBearingCount} load-bearing claims are visible and the core founder-brief requirements are present. Penny can proceed, but it should still ask whether the user wants the heavier synthesis gates for a higher-stakes decision.`,
    );
  }

  return cleanSentence(
    `Still at risk: ${readiness.missingRequirements.map((requirement) => requirement.replaceAll("_", " ")).join(", ")}. Penny should warn the user and ask whether to proceed anyway instead of pretending the structure is complete.`,
  );
}

export function getFounderBriefReadiness(map: ThoughtMapModel): FounderBriefReadiness {
  const counts = activeNodes(map).reduce<Record<FounderBriefRequirement, number>>(
    (acc, node) => {
      if (node.kind === "assumption" || node.kind === "counter_argument" || node.kind === "research") {
        acc[node.kind] += 1;
      }

      return acc;
    },
    {
      assumption: 0,
      counter_argument: 0,
      research: 0,
    },
  );
  const missingRequirements = REQUIRED_FOUNDER_BRIEF_KINDS.filter((kind) => counts[kind] < 1);

  return {
    eligible: missingRequirements.length === 0,
    missingRequirements,
  };
}

export function buildFounderBrief(map: ThoughtMapModel, lens: PennyLensSnapshot | null = buildPennyLens(map)): FounderBriefModel {
  const keyAssumptions = topAssumptions(map, lens);
  const strongestCounterarguments = topCounterarguments(map, lens);
  const loadBearingCount = loadBearingClaims(map).length;

  return {
    ideaSummary: cleanSentence(map.rawThought),
    targetUser: inferTargetUser(map),
    coreClaim: chooseCoreClaim(map),
    keyAssumptions,
    strongestCounterarguments,
    nextValidationSteps: nextValidationSteps(map, keyAssumptions, strongestCounterarguments, lens),
    stakesLevel: stakesLevel(map, loadBearingCount),
    preMortem: preMortem(map, keyAssumptions, strongestCounterarguments),
    ifYouWereRight: ifYouWereRight(map),
    twinCheck: twinCheck(map, keyAssumptions, strongestCounterarguments),
    dependencyCompleteness: dependencyCompleteness(map, loadBearingCount),
    generatedAt: new Date(),
  };
}

export function formatFounderBrief(brief: FounderBriefModel) {
  return [
    "## Idea Summary",
    brief.ideaSummary,
    "",
    "## Target User",
    brief.targetUser,
    "",
    "## Core Claim",
    brief.coreClaim,
    "",
    "## Key Assumptions",
    ...brief.keyAssumptions.map((item) => `- ${item}`),
    "",
    "## Strongest Counterarguments",
    ...brief.strongestCounterarguments.map((item) => `- ${item}`),
    "",
    "## Next 3 Validation Steps",
    ...brief.nextValidationSteps.map((item, index) => `${index + 1}. ${item}`),
    "",
    "## Synthesis Gate",
    `- Stakes level: ${brief.stakesLevel}`,
    `- Pre-mortem: ${brief.preMortem}`,
    `- If you were right: ${brief.ifYouWereRight}`,
    `- Twin-check: ${brief.twinCheck}`,
    `- Dependency completeness: ${brief.dependencyCompleteness}`,
  ].join("\n");
}
