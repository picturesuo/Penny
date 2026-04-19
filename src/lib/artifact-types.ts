import { cleanSentence } from "@/lib/penny";
import { buildArtifactDependencyHealth } from "@/lib/dependency-health";
import type { PennyLensSnapshot } from "@/lib/penny-insights";
import { buildPennyUncertainty } from "@/lib/uncertainty";
import type {
  ArtifactDiff,
  ArtifactRecord,
  ArtifactSectionDiff,
  ArtifactTemplate,
  ArtifactType,
  ArtifactTypeId,
  ClaimOutcomePair,
  FounderBriefModel,
  SynthesisGate,
  ThoughtMapModel,
  ThoughtNodeModel,
} from "@/types/thought-map";

type ArtifactSectionSpec = ArtifactTemplate["sections"][number];

function activeNodes(map: ThoughtMapModel) {
  return map.nodes.filter((node) => node.nodeStatus === "active");
}

function byPriority(nodes: ThoughtNodeModel[], rank: (node: ThoughtNodeModel) => number) {
  return [...nodes].sort(
    (a, b) =>
      rank(b) - rank(a) ||
      a.branchOrder - b.branchOrder ||
      a.createdAt.getTime() - b.createdAt.getTime(),
  );
}

function claimOutcomePair(node: ThoughtNodeModel): ClaimOutcomePair {
  return {
    claimId: node.id,
    claimText: node.content,
    wasClaimCorrect: null,
    confidenceAtArtifactTime: node.scores?.confidence ?? 0,
    actualOutcome: null,
  };
}

function loadBearingClaimPairs(map: ThoughtMapModel, limit = 5) {
  return byPriority(
    activeNodes(map).filter((node) => node.kind !== "root"),
    (node) =>
      (node.scores?.centrality ?? 0) * 0.3 +
      (node.scores?.dependencyRisk ?? 0) * 0.3 +
      (node.scores?.strength ?? 0) * 0.2 +
      (node.scores?.confidence ?? 0) * 0.2,
  )
    .filter((node) => (node.scores?.confidence ?? 0) >= 0.4 || node.kind === "assumption" || node.kind === "core_claim")
    .slice(0, limit)
    .map(claimOutcomePair);
}

function claimTexts(pairs: ClaimOutcomePair[]) {
  return pairs.map((pair) => pair.claimText);
}

function bulletList(items: string[]) {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "- No claims were strong enough to surface yet.";
}

function numberedList(items: string[]) {
  return items.length ? items.map((item, index) => `${index + 1}. ${item}`).join("\n") : "1. No claims were strong enough to surface yet.";
}

function selectCoreClaim(map: ThoughtMapModel) {
  const claims = activeNodes(map).filter((node) => node.kind === "core_claim");

  if (claims.length === 0) {
    return cleanSentence(map.rawThought);
  }

  return byPriority(
    claims,
    (node) => (node.scores?.centrality ?? 0) + (node.scores?.strength ?? 0) + (node.scores?.confidence ?? 0) * 0.2,
  )[0]?.content ?? cleanSentence(map.rawThought);
}

function selectAssumptions(map: ThoughtMapModel) {
  return byPriority(
    activeNodes(map).filter((node) => node.kind === "assumption"),
    (node) => (node.scores?.dependencyRisk ?? 0) + (node.scores?.centrality ?? 0) * 0.4,
  )
    .slice(0, 3)
    .map((node) => node.content);
}

function selectCounterarguments(map: ThoughtMapModel) {
  return byPriority(
    activeNodes(map).filter((node) => node.kind === "counter_argument"),
    (node) => (node.scores?.tension ?? 0) + (node.scores?.specificity ?? 0) * 0.4,
  )
    .slice(0, 3)
    .map((node) => node.content);
}

function selectResearchNodes(map: ThoughtMapModel) {
  return byPriority(
    activeNodes(map).filter((node) => node.kind === "research"),
    (node) => (node.scores?.testability ?? 0) + (node.scores?.evidence ?? 0) + (node.scores?.specificity ?? 0) * 0.25,
  );
}

function selectWhyNow(map: ThoughtMapModel) {
  const claim = selectCoreClaim(map);
  const assumption = selectAssumptions(map)[0] ?? "the main assumption is still untested";

  return cleanSentence(`This matters now because ${claim.toLowerCase()} and the assumption that ${assumption} still needs a decision.`)
    .replace(/\s+/g, " ")
    .trim();
}

function selectValueStakes(map: ThoughtMapModel) {
  return byPriority(
    activeNodes(map).filter((node) => node.content.toLowerCase().includes("should") || node.content.toLowerCase().includes("ought")),
    (node) => (node.scores?.centrality ?? 0) + (node.scores?.confidence ?? 0) * 0.2,
  )
    .slice(0, 2)
    .map((node) => node.content);
}

function selectEmotionalSignals(map: ThoughtMapModel) {
  const matches = activeNodes(map).filter((node) =>
    /afraid|excited|nervous|confident|worried|uncertain|reluctant|relief/i.test(node.content),
  );

  if (matches.length > 0) {
    return matches.slice(0, 2).map((node) => node.content);
  }

  return [cleanSentence(map.rawThought)];
}

function selectAlternatives(map: ThoughtMapModel) {
  const candidates = activeNodes(map).filter((node) => node.kind === "counter_argument" || node.kind === "research");
  return byPriority(candidates, (node) => (node.scores?.specificity ?? 0) + (node.scores?.evidence ?? 0))
    .slice(0, 3)
    .map((node) => node.content);
}

function selectTestDesign(map: ThoughtMapModel) {
  const tests = selectResearchNodes(map).slice(0, 3).map((node) => node.content);
  return tests.length > 0 ? tests : [cleanSentence(map.rawThought)];
}

function selectDecisionCriteria(map: ThoughtMapModel) {
  const assumptions = selectAssumptions(map);
  if (assumptions.length > 0) {
    return assumptions.slice(0, 2).map((item) => `Does the decision still hold if ${item}?`);
  }

  return ["Does this still feel like the right move under pressure?"];
}

function selectEvidenceAgainst(map: ThoughtMapModel) {
  return selectCounterarguments(map).slice(0, 3);
}

function selectEvidenceFor(map: ThoughtMapModel) {
  return byPriority(
    activeNodes(map).filter((node) => node.kind === "research" || node.kind === "core_claim"),
    (node) => (node.scores?.evidence ?? 0) + (node.scores?.confidence ?? 0),
  )
    .slice(0, 3)
    .map((node) => node.content);
}

function defaultArtifactType(
  id: ArtifactTypeId,
  name: string,
  description: string,
  requiredClaimTypes: string[],
  minimumClaimCount: number,
  requiredLoadBearingConfidence: number,
  synthesisGates: SynthesisGate[],
  template: ArtifactTemplate,
  audienceOptions: string[],
  estimatedCompletionTime: number,
): ArtifactType {
  return {
    id,
    name,
    description,
    requiredClaimTypes,
    minimumClaimCount,
    requiredLoadBearingConfidence,
    synthesisGates,
    template,
    audienceOptions,
    estimatedCompletionTime,
  };
}

export const ARTIFACT_TYPES: ArtifactType[] = [
  defaultArtifactType(
    "founder_brief",
    "Founder Brief",
    "A load-bearing decision artifact that turns the map into a concise founder-facing brief.",
    ["core_claim", "assumption", "counter_argument", "research"],
    5,
    0.6,
    [
      { id: "pre_mortem", label: "Pre-mortem", description: "Imagine the artifact failing six months later.", required: true },
      { id: "if_you_were_right", label: "If you were right", description: "Check what would become necessary if the artifact held.", required: true },
      { id: "twin_check", label: "Twin-check", description: "Surface the strongest version of the argument.", required: true },
      { id: "dependency_completeness", label: "Dependency completeness", description: "Confirm the skeleton is sufficiently load-bearing.", required: true },
    ],
    {
      id: "founder_brief",
      title: "Founder brief",
      description: "Turn the map into a founder-ready decision artifact.",
      defaultAudience: "founder",
      sections: [
        { id: "ideaSummary", title: "Idea summary", description: "The short framing of the map.", sourceKinds: ["core_claim"], minimumClaims: 1, renderMode: "paragraph" },
        { id: "targetUser", title: "Target user", description: "Who this brief is actually for.", sourceKinds: ["why_it_matters", "core_claim"], minimumClaims: 1, renderMode: "paragraph" },
        { id: "coreClaim", title: "Core claim", description: "The central claim to stress test.", sourceKinds: ["core_claim"], minimumClaims: 1, renderMode: "paragraph" },
        { id: "keyAssumptions", title: "Key assumptions", description: "The load-bearing assumptions beneath the claim.", sourceKinds: ["assumption"], minimumClaims: 2, renderMode: "bullets" },
        { id: "strongestCounterarguments", title: "Strongest counterarguments", description: "The sharpest pressure tests.", sourceKinds: ["counter_argument"], minimumClaims: 2, renderMode: "bullets" },
        { id: "nextValidationSteps", title: "Next validation steps", description: "The next tests that would actually change the answer.", sourceKinds: ["research"], minimumClaims: 2, renderMode: "list" },
        { id: "stakesLevel", title: "Stakes level", description: "How much is at risk if the artifact is wrong.", sourceKinds: ["core_claim", "why_it_matters"], minimumClaims: 1, renderMode: "paragraph" },
        { id: "preMortem", title: "Pre-mortem", description: "The failure path to keep in view.", sourceKinds: ["assumption", "counter_argument"], minimumClaims: 1, renderMode: "paragraph" },
        { id: "ifYouWereRight", title: "If you were right", description: "What becomes necessary if the brief holds.", sourceKinds: ["core_claim"], minimumClaims: 1, renderMode: "paragraph" },
        { id: "twinCheck", title: "Twin-check", description: "The strongest version of the case.", sourceKinds: ["core_claim", "counter_argument"], minimumClaims: 1, renderMode: "paragraph" },
        { id: "dependencyCompleteness", title: "Dependency completeness", description: "Whether the skeleton is complete enough to trust.", sourceKinds: ["assumption", "research"], minimumClaims: 1, renderMode: "paragraph" },
      ],
    },
    ["founder", "startup", "product"],
    10,
  ),
  defaultArtifactType(
    "decision_memo",
    "Decision Memo",
    "A concise decision artifact with recommendation, assumptions, risks, and alternatives.",
    ["core_claim", "assumption", "counter_argument", "research"],
    5,
    0.6,
    [
      { id: "pre_mortem", label: "Pre-mortem", description: "Required before the recommendation is trusted.", required: true },
      { id: "adversarial_pass", label: "Adversarial pass", description: "The strongest counter-case must be visible.", required: true },
      { id: "dependency_completeness", label: "Dependency completeness", description: "Confirm the supporting structure is complete.", required: true },
    ],
    {
      id: "decision_memo",
      title: "Decision memo",
      description: "Recommendation, assumptions, risks, alternatives, and criteria.",
      defaultAudience: "co-founder",
      sections: [
        { id: "situation", title: "Situation", description: "The decision context.", sourceKinds: ["core_claim", "why_it_matters"], minimumClaims: 1, renderMode: "paragraph" },
        { id: "recommendation", title: "Recommendation", description: "The best answer the map currently supports.", sourceKinds: ["core_claim"], minimumClaims: 1, renderMode: "paragraph" },
        { id: "keyAssumptions", title: "Key assumptions", description: "The assumptions that must hold.", sourceKinds: ["assumption"], minimumClaims: 2, renderMode: "bullets" },
        { id: "risks", title: "Risks", description: "Failure modes and caveats.", sourceKinds: ["counter_argument", "assumption"], minimumClaims: 2, renderMode: "bullets" },
        { id: "alternatives", title: "Alternatives considered", description: "The strongest options left behind.", sourceKinds: ["counter_argument", "research"], minimumClaims: 2, renderMode: "list" },
        { id: "decisionCriteria", title: "Decision criteria", description: "What should decide the choice.", sourceKinds: ["research", "why_it_matters"], minimumClaims: 1, renderMode: "bullets" },
      ],
    },
    ["co-founder", "board", "team"],
    12,
  ),
  defaultArtifactType(
    "investment_thesis",
    "Investment Thesis",
    "A structured thesis for market, timing, team, moat, and model.",
    ["core_claim", "assumption", "research", "counter_argument"],
    6,
    0.65,
    [
      { id: "all_components", label: "All six components", description: "Every thesis component must be present on the map.", required: true },
      { id: "market_reference_class", label: "Reference class", description: "The market claim must have reference-class evidence.", required: true },
      { id: "completed_rounds", label: "Completed rounds", description: "Each core component should have a dialectic round.", required: true },
    ],
    {
      id: "investment_thesis",
      title: "Investment thesis",
      description: "A thesis structured for investors and high-stakes internal review.",
      defaultAudience: "seed investor",
      sections: [
        { id: "marketClaim", title: "Market claim", description: "The market shape and why it matters now.", sourceKinds: ["research", "why_it_matters"], minimumClaims: 1, renderMode: "paragraph" },
        { id: "timingClaim", title: "Timing claim", description: "Why this is the right moment.", sourceKinds: ["research", "core_claim"], minimumClaims: 1, renderMode: "paragraph" },
        { id: "teamInsightClaim", title: "Team / insight claim", description: "Why this team or insight can win.", sourceKinds: ["core_claim", "why_it_matters"], minimumClaims: 1, renderMode: "paragraph" },
        { id: "whyNowClaim", title: "Why now", description: "The urgent reason to move.", sourceKinds: ["why_it_matters", "research"], minimumClaims: 1, renderMode: "paragraph" },
        { id: "moatClaim", title: "Competitive moat", description: "What compounds or defends the edge.", sourceKinds: ["counter_argument", "research"], minimumClaims: 1, renderMode: "bullets" },
        { id: "financialModel", title: "Financial model", description: "The economic shape of the thesis.", sourceKinds: ["research", "core_claim"], minimumClaims: 1, renderMode: "paragraph" },
      ],
    },
    ["seed investor", "Series A investor", "angel"],
    14,
  ),
  defaultArtifactType(
    "research_proposal",
    "Research Proposal",
    "A proposal framed around question, hypothesis, methodology, and decision relevance.",
    ["research", "assumption", "core_claim"],
    5,
    0.55,
    [
      { id: "assumption_completeness", label: "Assumption completeness", description: "The assumptions need to be explicit and testable.", required: true },
      { id: "methodology_critique", label: "Methodology critique", description: "The method should withstand challenge.", required: true },
      { id: "contradiction_check", label: "Contradiction check", description: "Known contradictions should be visible.", required: true },
    ],
    {
      id: "research_proposal",
      title: "Research proposal",
      description: "Question, hypothesis, method, assumptions, and relevance.",
      defaultAudience: "academic committee",
      sections: [
        { id: "question", title: "Question", description: "The question the map is trying to answer.", sourceKinds: ["research", "core_claim"], minimumClaims: 1, renderMode: "paragraph" },
        { id: "hypothesis", title: "Hypothesis", description: "The testable conditional claim.", sourceKinds: ["core_claim", "research"], minimumClaims: 1, renderMode: "paragraph" },
        { id: "methodology", title: "Methodology", description: "How the idea should be tested.", sourceKinds: ["research"], minimumClaims: 2, renderMode: "bullets" },
        { id: "assumptions", title: "Assumptions", description: "The assumptions the method depends on.", sourceKinds: ["assumption"], minimumClaims: 2, renderMode: "bullets" },
        { id: "expectedFindings", title: "Expected findings", description: "What the map expects to learn.", sourceKinds: ["research"], minimumClaims: 1, renderMode: "paragraph" },
        { id: "decisionRelevance", title: "Decision relevance", description: "How the answer changes the next move.", sourceKinds: ["core_claim", "why_it_matters"], minimumClaims: 1, renderMode: "paragraph" },
      ],
    },
    ["academic committee", "internal research team", "external partner"],
    11,
  ),
  defaultArtifactType(
    "risk_register",
    "Risk Register",
    "A ranked list of risks, mitigations, early warnings, and ownership.",
    ["assumption", "counter_argument", "research"],
    4,
    0.6,
    [
      { id: "adversarial_pass", label: "Adversarial pass", description: "High-probability, high-impact risks need challenge.", required: true },
      { id: "owner_assignment", label: "Owner assignment", description: "Every high risk needs an owner.", required: true },
    ],
    {
      id: "risk_register",
      title: "Risk register",
      description: "The map as an operational risk ledger.",
      defaultAudience: "executive team",
      sections: [
        { id: "riskList", title: "Risk list", description: "Ranked by probability times impact.", sourceKinds: ["assumption", "counter_argument"], minimumClaims: 2, renderMode: "list" },
        { id: "mitigations", title: "Mitigation plans", description: "What reduces the risk or contains the blast radius.", sourceKinds: ["research", "assumption"], minimumClaims: 2, renderMode: "bullets" },
        { id: "earlyWarnings", title: "Early warning signals", description: "Signals to watch before the risk lands.", sourceKinds: ["research"], minimumClaims: 1, renderMode: "bullets" },
        { id: "ownership", title: "Ownership", description: "Who is responsible for each risk.", sourceKinds: ["core_claim", "why_it_matters"], minimumClaims: 1, renderMode: "paragraph" },
      ],
    },
    ["executive team", "board", "operations team"],
    10,
  ),
  defaultArtifactType(
    "personal_decision_audit",
    "Personal Decision Audit",
    "A self-only audit that surfaces values, emotions, tradeoffs, and the commitment test.",
    ["core_claim", "assumption", "why_it_matters"],
    4,
    0.55,
    [
      { id: "if_wrong", label: "If you were wrong", description: "The wrong-case scenario should be explicit.", required: true },
      { id: "trusted_critic", label: "Trusted critic", description: "A critic should be able to poke the choice.", required: true },
      { id: "stakes_confirmation", label: "Stakes confirmation", description: "The stakes have to be named clearly.", required: true },
    ],
    {
      id: "personal_decision_audit",
      title: "Personal decision audit",
      description: "Decision, values, emotions, tradeoffs, and commitment test.",
      defaultAudience: "self",
      sections: [
        { id: "decision", title: "Decision being considered", description: "The choice in front of the user.", sourceKinds: ["core_claim", "why_it_matters"], minimumClaims: 1, renderMode: "paragraph" },
        { id: "values", title: "Values at stake", description: "What matters if the decision shifts.", sourceKinds: ["why_it_matters"], minimumClaims: 1, renderMode: "bullets" },
        { id: "assumptions", title: "Assumptions", description: "The assumptions being made.", sourceKinds: ["assumption"], minimumClaims: 2, renderMode: "bullets" },
        { id: "emotions", title: "Emotions present", description: "How the decision feels in the body.", sourceKinds: ["why_it_matters"], minimumClaims: 1, renderMode: "bullets" },
        { id: "tradeoffs", title: "Options with tradeoffs", description: "The real options and their tradeoffs.", sourceKinds: ["counter_argument", "research"], minimumClaims: 2, renderMode: "list" },
        { id: "commitmentTest", title: "Commitment test", description: "What it would take to commit.", sourceKinds: ["core_claim", "why_it_matters"], minimumClaims: 1, renderMode: "paragraph" },
      ],
    },
    ["self"],
    9,
  ),
  defaultArtifactType(
    "hypothesis_brief",
    "Hypothesis Brief",
    "A compact brief centered on a testable hypothesis and the evidence around it.",
    ["core_claim", "research", "counter_argument"],
    4,
    0.6,
    [
      { id: "steel_man", label: "Steel man", description: "The best counter-case should be present.", required: true },
      { id: "evidence_quality", label: "Evidence quality", description: "The evidence should be explicit and comparable.", required: true },
    ],
    {
      id: "hypothesis_brief",
      title: "Hypothesis brief",
      description: "Hypothesis, evidence for and against, test design, and decision impact.",
      defaultAudience: "product team",
      sections: [
        { id: "hypothesis", title: "Hypothesis", description: "The testable claim.", sourceKinds: ["core_claim"], minimumClaims: 1, renderMode: "paragraph" },
        { id: "evidenceFor", title: "Evidence for", description: "What supports the hypothesis.", sourceKinds: ["research"], minimumClaims: 1, renderMode: "bullets" },
        { id: "evidenceAgainst", title: "Evidence against", description: "What pushes back on it.", sourceKinds: ["counter_argument"], minimumClaims: 1, renderMode: "bullets" },
        { id: "testDesign", title: "Test design", description: "How to decide using the map.", sourceKinds: ["research"], minimumClaims: 1, renderMode: "bullets" },
        { id: "decision", title: "Decision it will inform", description: "What changes if the hypothesis survives.", sourceKinds: ["core_claim", "why_it_matters"], minimumClaims: 1, renderMode: "paragraph" },
      ],
    },
    ["product team", "investors", "advisory board"],
    8,
  ),
];

export function getArtifactType(artifactTypeId: ArtifactTypeId) {
  return ARTIFACT_TYPES.find((type) => type.id === artifactTypeId) ?? null;
}

export function getArtifactTypeByName(name: string) {
  return ARTIFACT_TYPES.find((type) => type.name.toLowerCase() === name.toLowerCase()) ?? null;
}

function artifactTitle(type: ArtifactType, map: ThoughtMapModel) {
  const mapTitle = cleanSentence(map.title || map.rawThought).replace(/\.$/, "");
  return type.id === "founder_brief" ? `${type.name}: ${mapTitle}` : `${type.name}: ${mapTitle}`;
}

function sectionBody(
  type: ArtifactType,
  map: ThoughtMapModel,
  section: ArtifactSectionSpec,
  lens: PennyLensSnapshot | null,
) {
  const coreClaim = selectCoreClaim(map);
  const assumptions = selectAssumptions(map);
  const counterarguments = selectCounterarguments(map);
  const loadBearing = loadBearingClaimPairs(map);
  const loadBearingTexts = claimTexts(loadBearing);
  const research = selectResearchNodes(map).slice(0, 4).map((node) => node.content);
  void lens;

  switch (type.id) {
    case "founder_brief":
      switch (section.id) {
        case "ideaSummary":
          return cleanSentence(map.rawThought);
        case "targetUser":
          return cleanSentence(
            activeNodes(map)
              .filter((node) => node.kind === "why_it_matters" || node.kind === "core_claim")
              .map((node) => node.content)
              .join(" ") || map.rawThought,
          );
        case "coreClaim":
          return coreClaim;
        case "keyAssumptions":
          return bulletList(assumptions);
        case "strongestCounterarguments":
          return bulletList(counterarguments);
        case "nextValidationSteps":
          return numberedList(research.length > 0 ? research : [cleanSentence(map.rawThought)]);
        case "stakesLevel":
          return loadBearing.length >= 6 ? "heavy" : loadBearing.length >= 3 ? "moderate" : "light";
        case "preMortem":
          return `If this fails, it will likely be because ${assumptions[0] ?? "the strongest assumption never got tested"} and because ${counterarguments[0] ?? "the strongest objection stayed abstract"}.`;
        case "ifYouWereRight":
          return `If ${coreClaim} is right, the next move should make that consequence concrete.`;
        case "twinCheck":
          return `The strongest version of the case is that ${coreClaim} survives the current assumptions and counterarguments.`;
        case "dependencyCompleteness":
          return loadBearing.length > 0
            ? `The load-bearing claims are ${loadBearingTexts.join("; ")}.`
            : "The map does not yet expose a clearly load-bearing skeleton.";
        default:
          return cleanSentence(map.rawThought);
      }
    case "decision_memo":
      switch (section.id) {
        case "situation":
          return cleanSentence(map.rawThought);
        case "recommendation":
          return `Recommend: ${coreClaim}`;
        case "keyAssumptions":
          return bulletList(assumptions);
        case "risks":
          return bulletList(counterarguments);
        case "alternatives":
          return numberedList(
            activeNodes(map)
              .filter((node) => node.kind === "counter_argument" || node.kind === "research")
              .slice(0, 3)
              .map((node) => node.content),
          );
        case "decisionCriteria":
          return bulletList(selectDecisionCriteria(map));
        default:
          return cleanSentence(map.rawThought);
      }
    case "investment_thesis":
      switch (section.id) {
        case "marketClaim":
          return research[0] ?? cleanSentence(map.rawThought);
        case "timingClaim":
          return selectWhyNow(map);
        case "teamInsightClaim":
          return coreClaim;
        case "whyNowClaim":
          return selectWhyNow(map);
        case "moatClaim":
          return bulletList(counterarguments.length > 0 ? counterarguments : assumptions);
        case "financialModel":
          return research[1] ?? `The thesis still needs explicit financial model support.`;
        default:
          return cleanSentence(map.rawThought);
      }
    case "research_proposal":
      switch (section.id) {
        case "question":
          return `The question is whether ${coreClaim.toLowerCase()}.`;
        case "hypothesis":
          return `If ${coreClaim.toLowerCase()}, then the hypothesis should hold.`;
        case "methodology":
          return bulletList(research.length > 0 ? research : [cleanSentence(map.rawThought)]);
        case "assumptions":
          return bulletList(assumptions);
        case "expectedFindings":
          return `The most likely findings will confirm or revise ${coreClaim.toLowerCase()}.`;
        case "decisionRelevance":
          return selectWhyNow(map);
        default:
          return cleanSentence(map.rawThought);
      }
    case "risk_register":
      switch (section.id) {
        case "riskList":
          return numberedList(counterarguments.length > 0 ? counterarguments : assumptions);
        case "mitigations":
          return bulletList(research.length > 0 ? research : assumptions);
        case "earlyWarnings":
          return bulletList(research.slice(0, 2));
        case "ownership":
          return `The implied owner is whoever is accountable for ${coreClaim.toLowerCase()}.`;
        default:
          return cleanSentence(map.rawThought);
      }
    case "personal_decision_audit":
      switch (section.id) {
        case "decision":
          return coreClaim;
        case "values":
          return bulletList(selectValueStakes(map));
        case "assumptions":
          return bulletList(assumptions);
        case "emotions":
          return bulletList(selectEmotionalSignals(map));
        case "tradeoffs":
          return numberedList(selectAlternatives(map));
        case "commitmentTest":
          return `Commit only if the decision still feels right after the trusted-critic test and the if-you-were-wrong scenario.`;
        default:
          return cleanSentence(map.rawThought);
      }
    case "hypothesis_brief":
      switch (section.id) {
        case "hypothesis":
          return `If ${coreClaim.toLowerCase()}, then the hypothesis survives.`;
        case "evidenceFor":
          return bulletList(selectEvidenceFor(map));
        case "evidenceAgainst":
          return bulletList(selectEvidenceAgainst(map));
        case "testDesign":
          return bulletList(selectTestDesign(map));
        case "decision":
          return selectWhyNow(map);
        default:
          return cleanSentence(map.rawThought);
      }
    default:
      return cleanSentence(map.rawThought);
  }
}

export function buildArtifactDraft(
  map: ThoughtMapModel,
  artifactTypeId: ArtifactTypeId,
  options: {
    artifactId: string;
    version: number;
    generatedAt?: Date;
    audience?: string | null;
    sectionOrder?: string[];
    narrativeGlue?: string | null;
    lens?: PennyLensSnapshot | null;
  },
): ArtifactRecord {
  const type = getArtifactType(artifactTypeId);
  if (!type) {
    throw new Error(`Unknown artifact type: ${artifactTypeId}`);
  }

  const generatedAt = options.generatedAt ?? new Date();
  const orderedSections = [...type.template.sections].sort((a, b) => {
    const left = options.sectionOrder?.indexOf(a.id) ?? -1;
    const right = options.sectionOrder?.indexOf(b.id) ?? -1;

    if (left === -1 && right === -1) {
      return 0;
    }

    if (left === -1) {
      return 1;
    }

    if (right === -1) {
      return -1;
    }

    return left - right;
  });

  const sections = orderedSections.map((section) => ({
    id: section.id,
    title: section.title,
    body: sectionBody(type, map, section, options.lens ?? null),
    sourceClaimIds: activeNodes(map)
      .filter((node) => section.sourceKinds.includes(node.kind))
      .slice(0, Math.max(1, section.minimumClaims))
      .map((node) => node.id),
  }));

  const loadBearingClaims = loadBearingClaimPairs(map, 5);
  const dependencyHealth = buildArtifactDependencyHealth(
    map,
    loadBearingClaims.map((pair) => pair.claimId),
    options.artifactId,
  ).health;

  return {
    id: options.artifactId,
    artifactTypeId,
    artifactTypeName: type.name,
    title: artifactTitle(type, map),
    audience: options.audience ?? type.template.defaultAudience,
    sourceMapId: map.id,
    generatedAt,
    version: options.version,
    sectionOrder: orderedSections.map((section) => section.id),
    narrativeGlue: options.narrativeGlue ?? null,
    sections,
    loadBearingClaims,
    dependencyHealth,
    outcomes: [],
    latestOutcome: null,
  };
}

export function artifactDraftToFounderBrief(artifact: ArtifactRecord): FounderBriefModel {
  const sectionText = (id: string) => artifact.sections.find((section) => section.id === id)?.body ?? "";

  const loadBearingClaims = artifact.loadBearingClaims;
  const keyAssumptions = sectionText("keyAssumptions")
    .split("\n")
    .map((line) => line.replace(/^[\-\d\.\s]+/, "").trim())
    .filter(Boolean);
  const strongestCounterarguments = sectionText("strongestCounterarguments")
    .split("\n")
    .map((line) => line.replace(/^[\-\d\.\s]+/, "").trim())
    .filter(Boolean);
  const nextValidationSteps = sectionText("nextValidationSteps")
    .split("\n")
    .map((line) => line.replace(/^[\-\d\.\s]+/, "").trim())
    .filter(Boolean);

  return {
    artifactId: artifact.id,
    artifactTypeId: "founder_brief",
    ideaSummary: sectionText("ideaSummary"),
    targetUser: sectionText("targetUser"),
    coreClaim: sectionText("coreClaim"),
    keyAssumptions,
    strongestCounterarguments,
    nextValidationSteps,
    stakesLevel: (sectionText("stakesLevel") as "light" | "moderate" | "heavy") || "light",
    preMortem: sectionText("preMortem"),
    ifYouWereRight: sectionText("ifYouWereRight"),
    twinCheck: sectionText("twinCheck"),
    dependencyCompleteness: sectionText("dependencyCompleteness"),
    dependencyHealth: artifact.dependencyHealth,
    loadBearingClaims,
    uncertainty: buildPennyUncertainty({
      outputType: "synthesis_prompt",
      groundingType: "user_pattern_data",
      groundingCount: loadBearingClaims.length + keyAssumptions.length + strongestCounterarguments.length,
      evidenceBasis: `Based on ${loadBearingClaims.length} load-bearing claim${loadBearingClaims.length === 1 ? "" : "s"}, ${keyAssumptions.length} assumption${keyAssumptions.length === 1 ? "" : "s"}, and ${strongestCounterarguments.length} counterargument${strongestCounterarguments.length === 1 ? "" : "s"} in the artifact draft.`,
      caveats:
        loadBearingClaims.length < 3
          ? ["The synthesis is still thin because the artifact only has a few load-bearing claims."]
          : [],
    }),
    generatedAt: artifact.generatedAt,
  };
}

export function artifactRecordFromFounderBrief(map: ThoughtMapModel, brief: FounderBriefModel, version: number): ArtifactRecord {
  const type = getArtifactType("founder_brief");

  if (!type) {
    throw new Error("Founder brief artifact type is unavailable");
  }

  return {
    id: brief.artifactId,
    artifactTypeId: "founder_brief",
    artifactTypeName: type.name,
    title: artifactTitle(type, map),
    audience: type.template.defaultAudience,
    sourceMapId: map.id,
    generatedAt: brief.generatedAt,
    version,
    sectionOrder: type.template.sections.map((section) => section.id),
    narrativeGlue: null,
    sections: type.template.sections.map((section) => ({
      id: section.id,
      title: section.title,
      body:
        section.id === "ideaSummary"
          ? brief.ideaSummary
          : section.id === "targetUser"
            ? brief.targetUser
            : section.id === "coreClaim"
              ? brief.coreClaim
              : section.id === "keyAssumptions"
                ? bulletList(brief.keyAssumptions)
                : section.id === "strongestCounterarguments"
                  ? bulletList(brief.strongestCounterarguments)
                  : section.id === "nextValidationSteps"
                    ? numberedList(brief.nextValidationSteps)
                    : section.id === "stakesLevel"
                      ? brief.stakesLevel
                      : section.id === "preMortem"
                        ? brief.preMortem
                        : section.id === "ifYouWereRight"
                          ? brief.ifYouWereRight
                          : section.id === "twinCheck"
                            ? brief.twinCheck
                            : section.id === "dependencyCompleteness"
                              ? brief.dependencyCompleteness
                              : cleanSentence(map.rawThought),
      sourceClaimIds: brief.loadBearingClaims.map((pair) => pair.claimId),
    })),
    loadBearingClaims: brief.loadBearingClaims,
    dependencyHealth: brief.dependencyHealth,
    outcomes: [],
    latestOutcome: null,
  };
}

function normalizeDiffText(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

export function diffArtifactRecords(previous: ArtifactRecord, current: ArtifactRecord): ArtifactDiff {
  const previousSections = new Map(previous.sections.map((section) => [section.id, section]));
  const sectionDiffs: ArtifactSectionDiff[] = current.sections.map((section) => {
    const before = previousSections.get(section.id)?.body ?? "";
    const after = section.body;
    return {
      id: section.id,
      title: section.title,
      before,
      after,
      changed: normalizeDiffText(before) !== normalizeDiffText(after),
    };
  });

  return {
    artifactId: current.id,
    artifactTypeId: current.artifactTypeId,
    fromVersion: previous.version,
    toVersion: current.version,
    changedSectionCount: sectionDiffs.filter((section) => section.changed).length,
    sectionDiffs,
  };
}
