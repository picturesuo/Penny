import { artifactDraftToFounderBrief, buildArtifactDraft } from "@/lib/artifact-types";
import { buildEvidenceQualityGate } from "@/lib/evidence-quality";
import { buildPennyLens, type PennyLensSnapshot } from "@/lib/penny-insights";
import type {
  FounderBriefModel,
  FounderBriefReadiness,
  FounderBriefRequirement,
  ThoughtMapModel,
} from "@/types/thought-map";

const REQUIRED_FOUNDER_BRIEF_KINDS: FounderBriefRequirement[] = [
  "assumption",
  "counter_argument",
  "research",
];

export function getFounderBriefReadiness(map: ThoughtMapModel): FounderBriefReadiness {
  const counts = map.nodes.filter((node) => node.nodeStatus === "active").reduce<Record<FounderBriefRequirement, number>>(
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
  const evidenceGate = buildEvidenceQualityGate(map);

  return {
    eligible: missingRequirements.length === 0 && !evidenceGate.blocked,
    missingRequirements,
    evidenceGateMessage: evidenceGate.message,
  };
}

export function buildFounderBrief(map: ThoughtMapModel, lens: PennyLensSnapshot | null = buildPennyLens(map)): FounderBriefModel {
  const evidenceGate = buildEvidenceQualityGate(map);
  if (evidenceGate.blocked) {
    throw new Error(
      evidenceGate.message ?? "Founder brief not ready: this founder brief depends on poorly evidenced claims.",
    );
  }

  const generatedAt = new Date();
  const draft = buildArtifactDraft(map, "founder_brief", {
    artifactId: `founder_brief:${map.id}:${generatedAt.getTime()}`,
    version: 1,
    generatedAt,
    lens,
  });

  return artifactDraftToFounderBrief(draft);
}

export function formatFounderBrief(brief: FounderBriefModel) {
  const uncertainty = brief.uncertainty;

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
    "",
    "## Dependency Health",
    brief.dependencyHealth
      ? [
          `- Score: ${brief.dependencyHealth.healthScore}/100`,
          `- Weakest link: ${brief.dependencyHealth.weakestLink.claimText}`,
          `- Risk note: ${brief.dependencyHealth.weakestLink.riskReason}`,
          `- Chain depth: ${brief.dependencyHealth.chainDepth}`,
          `- Total dependencies: ${brief.dependencyHealth.totalDependencies}`,
        ].join("\n")
      : "- No dependency health was computed yet.",
    "",
    "## Penny Confidence",
    uncertainty
      ? [
          `- Level: ${uncertainty.uncertaintyLevel.replaceAll("_", " ")}`,
          `- Grounding: ${uncertainty.groundingType.replaceAll("_", " ")}`,
          `- Basis: ${uncertainty.evidenceBasis}`,
        ].join("\n")
      : "- No explicit uncertainty was attached.",
  ].join("\n");
}
