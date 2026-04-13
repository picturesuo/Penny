import { cleanSentence } from "@/lib/penny";
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

function topAssumptions(map: ThoughtMapModel) {
  const assumptions = activeNodes(map).filter((node) => node.kind === "assumption");
  return byPriority(
    assumptions,
    (node) => (node.scores?.dependencyRisk ?? 0) * 0.65 + (node.scores?.centrality ?? 0) * 0.35,
  )
    .slice(0, 3)
    .map((node) => node.content);
}

function topCounterarguments(map: ThoughtMapModel) {
  const counterarguments = activeNodes(map).filter((node) => node.kind === "counter_argument");
  return byPriority(
    counterarguments,
    (node) =>
      (node.scores?.centrality ?? 0) * 0.4 +
      (node.scores?.specificity ?? 0) * 0.35 +
      (node.scores?.tension ?? 0) * 0.25,
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

function nextValidationSteps(map: ThoughtMapModel, assumptions: string[], counterarguments: string[]) {
  const researchNodes = byPriority(
    activeNodes(map).filter((node) => node.kind === "research"),
    (node) =>
      (node.scores?.testability ?? 0) * 0.4 +
      (node.scores?.specificity ?? 0) * 0.35 +
      (node.scores?.evidence ?? 0) * 0.25,
  ).map((node) => normalizeValidationStep(node.content));

  const steps = [...researchNodes];

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

export function buildFounderBrief(map: ThoughtMapModel): FounderBriefModel {
  const keyAssumptions = topAssumptions(map);
  const strongestCounterarguments = topCounterarguments(map);

  return {
    ideaSummary: cleanSentence(map.rawThought),
    targetUser: inferTargetUser(map),
    coreClaim: chooseCoreClaim(map),
    keyAssumptions,
    strongestCounterarguments,
    nextValidationSteps: nextValidationSteps(map, keyAssumptions, strongestCounterarguments),
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
  ].join("\n");
}
