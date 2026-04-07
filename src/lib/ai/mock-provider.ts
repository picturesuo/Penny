import { cleanSentence, dedupeStrings, mergeText } from "@/lib/penny";
import type { LlmProvider } from "@/lib/ai/provider";
import type {
  ConfidenceMap,
  EvidenceScanResult,
  ExtractedStructure,
  NextQuestionResult,
  PressureTestResult,
  SessionState,
  SessionStage,
} from "@/types/penny";

function inferTargetUser(text: string) {
  const lower = text.toLowerCase();
  const patterns = [
    { match: /(founder|startup|entrepreneur)/, value: "early-stage founders" },
    { match: /(developer|engineer|programmer)/, value: "software engineers" },
    { match: /(creator|influencer|youtube|tiktok)/, value: "independent creators" },
    { match: /(sales|revenue|prospect)/, value: "sales teams" },
    { match: /(compliance|audit|regulatory)/, value: "compliance teams" },
    { match: /(fitness|gym|workout)/, value: "people already trying to stay consistent with fitness" },
  ];

  return patterns.find((pattern) => pattern.match.test(lower))?.value ?? "";
}

function inferProblem(text: string) {
  const lower = text.toLowerCase();
  if (lower.includes("accountability")) return "Users struggle to stay consistent once motivation drops.";
  if (lower.includes("compliance")) return "Teams waste time translating requirements into repeatable workflows.";
  if (lower.includes("marketplace")) return "Buyers and suppliers struggle to find each other in a reliable way.";
  if (lower.includes("automation")) return "Teams repeat manual work that should be automated.";
  if (lower.includes("ai")) return "Users want faster output, but generic AI tools rarely fit a specific workflow.";
  return "The problem is still vague and sounds more like a category than a painful job.";
}

function inferSolution(text: string) {
  const lower = text.toLowerCase();
  if (lower.includes("app")) return "A software product that tries to create a repeatable workflow around the problem.";
  if (lower.includes("marketplace")) return "A matching layer that connects supply and demand more efficiently.";
  if (lower.includes("assistant") || lower.includes("copilot")) {
    return "An opinionated assistant that helps users complete a narrow workflow faster.";
  }

  return "The proposed solution still needs a more concrete product shape.";
}

function detectAssumptions(text: string, targetUser: string, problem: string, solution: string) {
  const assumptions = [
    targetUser ? `${targetUser} will admit this problem is urgent enough to change behavior.` : "",
    problem.includes("vague")
      ? "A broad category can still produce a sharp enough wedge to validate quickly."
      : "The problem is painful enough that users will actively seek a better option.",
    solution.includes("concrete")
      ? "A more concrete product direction will emerge before resources are wasted."
      : "The proposed solution is meaningfully better than existing workarounds.",
  ];

  if (text.toLowerCase().includes("ai")) {
    assumptions.push("AI adds enough value here to justify trust, cost, and workflow change.");
  }

  if (text.toLowerCase().includes("marketplace")) {
    assumptions.push("You can solve the cold-start problem without burning too much effort.");
  }

  return dedupeStrings(assumptions).slice(0, 5);
}

function detectRisks(text: string, targetUser: string, problem: string) {
  const risks = [
    !targetUser ? "The buyer is still undefined, so distribution is speculative." : "",
    problem.includes("vague") ? "The problem statement is too abstract to test cleanly." : "",
    "There may be existing alternatives that are good enough for the first customer.",
  ];

  if (text.toLowerCase().includes("app")) {
    risks.push("Retention may fail if the product depends on habit change without a strong daily trigger.");
  }

  if (text.toLowerCase().includes("marketplace")) {
    risks.push("Marketplace liquidity can collapse before either side sees enough value.");
  }

  return dedupeStrings(risks).slice(0, 5);
}

function detectUnknowns(session: SessionState, targetUser: string, solution: string) {
  const unknowns = [
    !targetUser ? "Who feels this pain enough to act now?" : "",
    !solution || solution.includes("needs a more concrete product shape")
      ? "What is the first narrow wedge worth building?"
      : "",
    "What proof would make a skeptical user try this instead of their current workaround?",
  ];

  if (session.answers.length < 2) {
    unknowns.push("What evidence suggests this is a real pain rather than a nice-to-have?");
  }

  return dedupeStrings(unknowns).slice(0, 4);
}

function scoreConfidence(targetUser: string, problem: string, solution: string): ConfidenceMap {
  return {
    targetUser: targetUser ? 74 : 24,
    problem: problem.includes("vague") ? 36 : 70,
    solution: solution.includes("needs a more concrete") ? 32 : 66,
  };
}

function stageQuestion(session: SessionState, stage: SessionStage): string {
  const targetUser = mergeText(session.targetUser, session.ideaSummary);
  const problem = mergeText(session.problem, session.rawIdea);
  const solution = mergeText(session.solution, session.rawIdea);

  const stageQuestions: Record<SessionStage, string> = {
    intake: `Who is this actually for? "Everyone who might want this" is not an answer.`,
    clarify: `What painful moment makes ${targetUser || "the target user"} actively look for a solution, instead of tolerating the current mess?`,
    assumptions: `What are you assuming about why existing options fail ${targetUser || "for this user"} today?`,
    "pressure-test": `Why would ${targetUser || "that user"} change behavior for ${solution || "this"} instead of sticking with the current workaround?`,
    evidence: `What evidence do you have beyond intuition that ${problem || "this problem"} is urgent enough to pay for?`,
    prioritize: `If you had to narrow this to one wedge customer and one promise, what would you keep and what would you cut?`,
    brief: `What is the single test that would most quickly prove or kill this idea this week?`,
  };

  return stageQuestions[stage];
}

export class MockLlmProvider implements LlmProvider {
  async extractStructure(session: SessionState): Promise<ExtractedStructure> {
    const source = cleanSentence([session.rawIdea, ...session.answers].join(" "));
    const targetUser = mergeText(session.targetUser, inferTargetUser(source));
    const problem = mergeText(session.problem, inferProblem(source));
    const solution = mergeText(session.solution, inferSolution(source));

    return {
      ideaSummary: session.ideaSummary || cleanSentence(session.rawIdea),
      targetUser,
      problem,
      solution,
      assumptions: dedupeStrings([...session.assumptions, ...detectAssumptions(source, targetUser, problem, solution)]),
      risks: dedupeStrings([...session.risks, ...detectRisks(source, targetUser, problem)]),
      unknowns: dedupeStrings([...session.unknowns, ...detectUnknowns(session, targetUser, solution)]),
      confidence: scoreConfidence(targetUser, problem, solution),
    };
  }

  async generateNextQuestion(session: SessionState): Promise<NextQuestionResult> {
    const stage = session.currentStage;
    return {
      question: stageQuestion(session, stage),
      reason: "This question either narrows the buyer, exposes a weak assumption, or forces a testable claim.",
      stage,
    };
  }

  async generatePressureTest(
    session: SessionState,
    evidence: EvidenceScanResult,
  ): Promise<PressureTestResult> {
    const weakestAssumption =
      session.assumptions.find((assumption) => !session.resolvedAssumptions.includes(assumption)) ??
      "Demand exists before pain has been proven.";

    const contradiction = evidence.contradictions[0]?.point;

    return {
      weakestAssumption,
      challenge: contradiction
        ? `${weakestAssumption} ${contradiction}`
        : `${weakestAssumption} Right now that reads as hope, not proof.`,
      followUpType: session.answers.length >= 2 ? "test" : "defend",
      followUp:
        session.answers.length >= 2
          ? "What is the fastest real-world test you can run this week to prove or kill that assumption?"
          : "Defend that assumption with something stronger than intuition.",
    };
  }

  async generateConceptBrief(
    session: SessionState,
    evidence: EvidenceScanResult,
  ): Promise<string> {
    const supports = evidence.supports.map((item) => `- ${item.point}`).join("\n");
    const contradictions = evidence.contradictions.map((item) => `- ${item.point}`).join("\n");
    const steps = [
      `1. Interview 5 ${session.targetUser || "target users"} this week and test whether ${session.problem || "the problem"} is urgent enough to fix now.`,
      `2. Build a no-code or manual test for ${session.solution || "the narrowest version of the solution"} before writing production software.`,
      `3. Define one falsifiable success metric tied to the weakest assumption and decide what result would make you stop.`,
    ].join("\n");

    return `## Idea Summary
${session.ideaSummary || session.rawIdea}

## Target User
${session.targetUser || "Still too broad. Narrow the buyer before building."}

## Core Problem
${session.problem || "The problem is not yet specific enough to test."}

## Proposed Solution
${session.solution || "The solution still reads as a category, not a wedge."}

## Why This Might Work
${supports || "- There is at least a plausible pattern here, but it needs direct customer proof."}

## Why This Might Fail
${contradictions || "- The concept still depends on unproven behavior change or weak differentiation."}

## Key Assumptions
${session.assumptions.map((item) => `- ${item}`).join("\n")}

## Biggest Unknown
${session.unknowns[0] || "Whether the target user will change behavior enough to adopt this."}

## Next 3 Validation Steps
${steps}`;
  }
}
