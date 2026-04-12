import { cleanSentence, dedupeStrings } from "@/lib/penny";
import { analyzeThoughtMap, isNearDuplicate, type GapType } from "@/lib/thought-map-analysis";
import type {
  GeneratedActionBundle,
  GeneratedThoughtNote,
  NodeAction,
  ThoughtMapModel,
  ThoughtNodeKind,
  ThoughtNodeModel,
} from "@/types/thought-map";

type ContextSignals = {
  subject: string;
  subjectPhrase: string;
  userType: string;
  currentAlternative: string;
  keyTerms: string[];
  friction: string;
  outcome: string;
};

function gapTargetKind(gap: GapType): ThoughtNodeKind {
  if (gap === "opposition" || gap === "balance") return "counter_argument";
  if (gap === "evidence") return "research";
  if (gap === "concreteness") return "research";
  return "why_it_matters";
}

const GENERIC_PATTERNS = [
  /real problem/i,
  /meaningful value/i,
  /pain point/i,
  /better experience/i,
  /users want/i,
  /help users/i,
  /good solution/i,
  /important because/i,
  /could be useful/i,
];

function extractKeyTerms(text: string) {
  const terms = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((term) => term.length >= 4)
    .filter(
      (term) =>
        ![
          "that",
          "with",
          "from",
          "this",
          "help",
          "turn",
          "could",
          "local",
          "faster",
          "they",
          "there",
          "their",
          "about",
          "need",
          "before",
          "after",
          "into",
          "have",
          "when",
          "your",
          "would",
          "should",
        ].includes(term),
    );

  return dedupeStrings(terms).slice(0, 6);
}

function inferUserType(text: string) {
  const lower = text.toLowerCase();
  if (lower.includes("founder") || lower.includes("startup")) return "founders";
  if (lower.includes("contractor")) return "local contractors";
  if (lower.includes("developer") || lower.includes("engineer")) return "developers";
  if (lower.includes("creator")) return "creators";
  if (lower.includes("student")) return "students";
  if (lower.includes("sales")) return "sales teams";
  if (lower.includes("compliance")) return "compliance teams";
  return "a narrow user";
}

function inferAlternative(text: string) {
  const lower = text.toLowerCase();
  if (lower.includes("ai")) return "ChatGPT plus manual judgment";
  if (lower.includes("graph") || lower.includes("visual")) return "notes, docs, and whiteboards";
  if (lower.includes("marketplace")) return "directories and direct outreach";
  if (lower.includes("app")) return "ad hoc habits and simple notes";
  return "the current manual workaround";
}

function inferFriction(text: string) {
  const lower = text.toLowerCase();
  if (lower.includes("visual")) return "ideas stay fuzzy when they remain in one paragraph";
  if (lower.includes("pressure")) return "weak assumptions survive too long without challenge";
  if (lower.includes("research")) return "evidence questions get skipped once the idea feels exciting";
  if (lower.includes("ai")) return "generic AI output collapses into broad prose";
  return "the current workflow hides weak logic";
}

function inferOutcome(text: string) {
  const lower = text.toLowerCase();
  if (lower.includes("startup") || lower.includes("founder")) return "faster kill-or-commit decisions";
  if (lower.includes("visual")) return "a map that is easier to inspect than a paragraph";
  if (lower.includes("tool")) return "a repeatable thinking workflow";
  return "clearer next decisions";
}

function buildSignals(text: string): ContextSignals {
  const cleaned = cleanSentence(text);
  const keyTerms = extractKeyTerms(cleaned);
  const lower = cleaned.toLowerCase();
  const subjectPhrase = lower.includes("startup idea")
    ? "startup ideas before building"
    : lower.includes("research question")
      ? "research questions worth answering"
      : lower.includes("pressure test")
        ? "pressure-testing assumptions"
        : lower.includes("visual")
          ? "visual idea structure"
          : keyTerms.slice(0, 3).join(" ");

  return {
    subject: keyTerms.slice(0, 2).join(" ") || "the idea",
    subjectPhrase: subjectPhrase || "the decision workflow",
    userType: inferUserType(cleaned),
    currentAlternative: inferAlternative(cleaned),
    keyTerms,
    friction: inferFriction(cleaned),
    outcome: inferOutcome(cleaned),
  };
}

function clip(value: string) {
  return cleanSentence(value).replace(/\.$/, "");
}

function makeNote(
  kind: ThoughtNodeKind,
  content: string,
  reasoning: GeneratedThoughtNote["reasoning"],
): GeneratedThoughtNote {
  return {
    kind,
    content: clip(content),
    note: reasoning.why,
    reasoning,
  };
}

function usesAnchor(content: string, anchors: string[]) {
  const lower = content.toLowerCase();
  return anchors.some((anchor) => lower.includes(anchor.toLowerCase()));
}

function isGeneric(content: string, anchors: string[]) {
  if (content.length < 18 || content.length > 120) {
    return true;
  }

  if (GENERIC_PATTERNS.some((pattern) => pattern.test(content))) {
    return true;
  }

  if (!usesAnchor(content, anchors) && !/\d/.test(content) && !content.includes(":")) {
    return true;
  }

  return false;
}

function fallbackSpecificNote(
  kind: ThoughtNodeKind,
  action: NodeAction,
  node: ThoughtNodeModel,
  signals: ContextSignals,
): GeneratedThoughtNote {
  const anchor = signals.subjectPhrase || signals.keyTerms[0] || signals.userType;
  const fallbackKind =
    node.kind === "root"
      ? action === "challenge"
        ? "counter_argument"
        : action === "invert"
          ? "core_claim"
          : action === "concretize"
            ? "research"
            : action === "connect"
              ? "research"
              : "core_claim"
      : kind;

  const fallbacks: Record<NodeAction, string> = {
    expand: `Name the exact moment ${signals.userType} hit the need for ${anchor}`,
    challenge: `Why is ${signals.currentAlternative} still strong enough to block progress on ${anchor}?`,
    invert: `What if ${anchor} matters less than execution speed?`,
    concretize: `Define one test for ${anchor}: who uses it, when, and what outcome counts`,
    connect: `Link ${anchor} to one adjacent risk, behavior, or evidence gap`,
  };

  return makeNote(fallbackKind, fallbacks[action], {
    strategy: "fallback_specificity",
    why: `Fallback added because the first draft was too generic for a ${node.kind} node.`,
    anchors: [anchor],
  });
}

function gapDrivenNotes(gap: GapType, signals: ContextSignals): GeneratedThoughtNote[] {
  switch (gap) {
    case "opposition":
      return [
        makeNote("counter_argument", `${signals.currentAlternative} may still win because it is faster than explicit structure`, {
          strategy: "gap_opposition_speed",
          why: "Adds opposition where the graph is too supportive.",
          anchors: [signals.currentAlternative, "faster"],
        }),
        makeNote("counter_argument", `The user may agree with the logic, then still ignore it when momentum matters`, {
          strategy: "gap_opposition_behavior",
          why: "Adds a behavior-based counterweight.",
          anchors: ["logic", "momentum"],
        }),
      ];
    case "evidence":
      return [
        makeNote("research", `Compare one blank-doc session against one node-action session with 5 ${signals.userType}`, {
          strategy: "gap_evidence_comparison",
          why: "Adds a direct validation test because evidence coverage is weak.",
          anchors: ["blank-doc", `5 ${signals.userType}`],
        }),
        makeNote("research", `Ask what decision changed the last time an idea was pressure-tested well`, {
          strategy: "gap_evidence_behavior",
          why: "Adds a behavioral evidence prompt.",
          anchors: ["decision", "pressure-tested"],
        }),
      ];
    case "concreteness":
      return [
        makeNote("research", `Define one 10-minute workflow: paste thought, click challenge, leave with one test`, {
          strategy: "gap_concreteness_workflow",
          why: "Makes the graph more concrete with a specific interaction.",
          anchors: ["10-minute", "challenge"],
        }),
        makeNote("core_claim", `Start with ${signals.userType} evaluating one decision before a build sprint`, {
          strategy: "gap_concreteness_buyer",
          why: "Pins the graph to a real user and moment.",
          anchors: [signals.userType, "build sprint"],
        }),
      ];
    case "stakes":
      return [
        makeNote("why_it_matters", `Without sharper structure, teams can waste a week building around a weak assumption`, {
          strategy: "gap_stakes_time",
          why: "Adds a visible cost because the stakes are underdeveloped.",
          anchors: ["week", "assumption"],
        }),
        makeNote("why_it_matters", `This matters when a fuzzy idea creates false confidence before customer contact`, {
          strategy: "gap_stakes_false_confidence",
          why: "Adds a sharper consequence branch.",
          anchors: ["customer", "confidence"],
        }),
      ];
    case "balance":
      return [
        makeNote("counter_argument", `If the graph mostly supports the idea, it may be rewarding belief instead of testing it`, {
          strategy: "gap_balance_self_confirmation",
          why: "Restores tension when the graph is too one-sided.",
          anchors: ["supports", "testing"],
        }),
        makeNote("counter_argument", `A useful thinking tool should increase disagreement before it increases confidence`, {
          strategy: "gap_balance_disagreement",
          why: "Adds opposition to rebalance the map.",
          anchors: ["disagreement", "confidence"],
        }),
      ];
  }
}

function replacementNotes(
  weakNode: ThoughtNodeModel,
  signals: ContextSignals,
): GeneratedThoughtNote[] {
  switch (weakNode.kind) {
    case "core_claim":
      return [
        makeNote("core_claim", `Sharper claim: ${signals.userType} use this to decide whether an idea deserves a build week`, {
          strategy: "replace_claim_sharper",
          why: "Replaces a soft claim with a sharper buyer and decision moment.",
          anchors: [signals.userType, "build week"],
        }),
        makeNote("core_claim", `Stronger claim: turn one fuzzy idea into one tested next step`, {
          strategy: "replace_claim_outcome",
          why: "Out-competes a weak claim with a clearer output.",
          anchors: ["fuzzy idea", "tested next step"],
        }),
      ];
    case "why_it_matters":
      return [
        makeNote("why_it_matters", `If this branch stays weak, the map never shows what bad decision it prevents`, {
          strategy: "replace_stakes_decision",
          why: "Replaces vague stakes with a concrete consequence.",
          anchors: ["decision", "prevents"],
        }),
        makeNote("why_it_matters", `The real stake is wasting scarce time before anyone talks to a customer`, {
          strategy: "replace_stakes_time",
          why: "Out-competes a weak stakes branch with clearer downside.",
          anchors: ["time", "customer"],
        }),
      ];
    case "assumption":
      return [
        makeNote("assumption", `Real assumption: ${signals.userType} will tolerate challenge because it changes the next decision`, {
          strategy: "replace_assumption_behavior",
          why: "Replaces a mushy assumption with a behavior-change test.",
          anchors: [signals.userType, "next decision"],
        }),
        makeNote("assumption", `Real assumption: ${signals.currentAlternative} fails when the idea needs branching and pushback`, {
          strategy: "replace_assumption_incumbent",
          why: "Out-competes a weak assumption with a clearer incumbent gap.",
          anchors: [signals.currentAlternative, "pushback"],
        }),
      ];
    case "counter_argument":
      return [
        makeNote("counter_argument", `${signals.currentAlternative} wins if users only want speed, not explicit disagreement`, {
          strategy: "replace_counter_speed",
          why: "Replaces a weak objection with a stronger behavioral threat.",
          anchors: [signals.currentAlternative, "speed"],
        }),
        makeNote("counter_argument", `The graph loses if it creates more ceremony than insight in the first 2 minutes`, {
          strategy: "replace_counter_ceremony",
          why: "Out-competes a weak objection with a measurable adoption risk.",
          anchors: ["2 minutes", "insight"],
        }),
      ];
    case "research":
      return [
        makeNote("research", `Ask for the last idea they killed and what evidence changed the decision`, {
          strategy: "replace_research_behavior",
          why: "Replaces vague research with a behavioral prompt.",
          anchors: ["last idea", "decision"],
        }),
        makeNote("research", `Run one side-by-side test: blank doc versus node-action map for the same idea`, {
          strategy: "replace_research_comparison",
          why: "Out-competes weak research with a real comparison.",
          anchors: ["blank doc", "same idea"],
        }),
      ];
    case "root":
      return [];
  }
}

function strengtheningNotes(
  weakNode: ThoughtNodeModel,
  signals: ContextSignals,
): GeneratedThoughtNote[] {
  switch (weakNode.kind) {
    case "core_claim":
      return [
        makeNote("research", `What proof would make this claim credible to ${signals.userType} this week?`, {
          strategy: "strengthen_claim_proof",
          why: "Strengthens the claim by attaching proof requirements.",
          anchors: [signals.userType, "this week"],
        }),
        makeNote("why_it_matters", `This claim matters only if it changes what gets built next`, {
          strategy: "strengthen_claim_stakes",
          why: "Strengthens a weak claim by clarifying stakes.",
          anchors: ["built next", "matters"],
        }),
      ];
    case "why_it_matters":
      return [
        makeNote("why_it_matters", `Name the exact cost: lost week, bad prototype, or false confidence`, {
          strategy: "strengthen_stakes_cost",
          why: "Strengthens a weak stakes branch with explicit downside.",
          anchors: ["lost week", "prototype"],
        }),
        makeNote("research", `Who feels that cost first, and in what moment?`, {
          strategy: "strengthen_stakes_user",
          why: "Strengthens stakes by grounding them in a user moment.",
          anchors: ["cost", "moment"],
        }),
      ];
    case "assumption":
      return [
        makeNote("research", `What result would prove this assumption wrong within 5 interviews?`, {
          strategy: "strengthen_assumption_test",
          why: "Strengthens an assumption by making it falsifiable.",
          anchors: ["5 interviews", "wrong"],
        }),
        makeNote("counter_argument", `If this assumption fails, the current workaround probably remains good enough`, {
          strategy: "strengthen_assumption_counter",
          why: "Strengthens the branch by linking it to a downside.",
          anchors: ["workaround", "good enough"],
        }),
      ];
    case "counter_argument":
      return [
        makeNote("research", `What evidence would actually disprove this objection?`, {
          strategy: "strengthen_counter_disproof",
          why: "Strengthens the objection by making it falsifiable.",
          anchors: ["disprove", "evidence"],
        }),
        makeNote("core_claim", `The product only wins if it beats this objection in the first session`, {
          strategy: "strengthen_counter_threshold",
          why: "Strengthens the branch by setting a threshold.",
          anchors: ["first session", "wins"],
        }),
      ];
    case "research":
      return [
        makeNote("research", `Turn this into a direct comparison or interview question with a real threshold`, {
          strategy: "strengthen_research_threshold",
          why: "Strengthens weak research by making the test clearer.",
          anchors: ["comparison", "threshold"],
        }),
        makeNote("why_it_matters", `This research matters because weak evidence keeps bad ideas alive`, {
          strategy: "strengthen_research_stakes",
          why: "Strengthens weak research by linking it to stakes.",
          anchors: ["evidence", "bad ideas"],
        }),
      ];
    case "root":
      return [];
  }
}

function diversificationNotes(weakNode: ThoughtNodeModel): GeneratedThoughtNote[] {
  if (weakNode.kind === "counter_argument") {
    return [
      makeNote("research", `Diversify the pushback: what evidence could actually overturn the objection?`, {
        strategy: "diversify_counter_to_research",
        why: "Stops repetitive objections by adding an evidence branch.",
        anchors: ["evidence", "objection"],
      }),
      makeNote("why_it_matters", `Diversify the branch: why does beating this objection matter strategically?`, {
        strategy: "diversify_counter_to_stakes",
        why: "Adds a different dimension instead of another objection.",
        anchors: ["strategically", "objection"],
      }),
    ];
  }

  return [
    makeNote("counter_argument", `Add one opposing branch instead of another similar support branch`, {
      strategy: "diversify_default_opposition",
      why: "Diversifies a repetitive cluster with tension.",
      anchors: ["opposing", "support"],
    }),
    makeNote("research", `Add one validation branch instead of another restatement`, {
      strategy: "diversify_default_research",
      why: "Diversifies a repetitive cluster with evidence.",
      anchors: ["validation", "restatement"],
    }),
  ];
}

function finalizeNotes(
  input: GeneratedThoughtNote[],
  params: {
    desiredMin: number;
    desiredMax: number;
    node: ThoughtNodeModel;
    action: NodeAction;
    anchors: string[];
    signals: ContextSignals;
    existingContents: string[];
  },
) {
  const seen = new Set<string>();
  const cleaned: GeneratedThoughtNote[] = [];

  for (const note of input) {
    const content = clip(note.content);
    const key = content.toLowerCase();

    if (!content || seen.has(key)) {
      continue;
    }

    if (isGeneric(content, params.anchors)) {
      continue;
    }

    if (isNearDuplicate(content, [...params.existingContents, ...cleaned.map((item) => item.content)])) {
      continue;
    }

    seen.add(key);
    cleaned.push({
      ...note,
      content,
      note: note.note ?? note.reasoning.why,
    });

    if (cleaned.length >= params.desiredMax) {
      break;
    }
  }

  while (cleaned.length < params.desiredMin) {
    const fallback = fallbackSpecificNote(
      params.node.kind,
      params.action,
      params.node,
      params.signals,
    );
    const key = fallback.content.toLowerCase();
    if (seen.has(key)) {
      break;
    }
    seen.add(key);
    cleaned.push(fallback);
  }

  return cleaned.slice(0, params.desiredMax);
}

function siblingHighlights(map: ThoughtMapModel, node: ThoughtNodeModel) {
  return map.nodes
    .filter((candidate) => candidate.parentId === node.parentId && candidate.id !== node.id)
    .slice(0, 3);
}

function generateInitialNotes(rawThought: string): GeneratedThoughtNote[] {
  const signals = buildSignals(rawThought);
  const rootNode: ThoughtNodeModel = {
    id: "root",
    mapId: "seed",
    parentId: null,
    kind: "root",
    nodeStatus: "active",
    actionOrigin: null,
    supersedesNodeId: null,
    content: rawThought,
    note: null,
    branchOrder: 0,
    scores: null,
    psychology: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return finalizeNotes(
    [
      makeNote("core_claim", `${signals.userType} need a faster way to structure ${signals.subjectPhrase}`, {
        strategy: "seed_core_claim",
        why: "Defines the primary claim in one falsifiable line.",
        anchors: [signals.subjectPhrase, signals.userType],
      }),
      makeNote(
        "why_it_matters",
        `${signals.friction}, so better structure could create ${signals.outcome}`,
        {
          strategy: "seed_why_it_matters",
          why: "Ties the idea to a concrete consequence.",
          anchors: [signals.friction, signals.outcome],
        },
      ),
      makeNote("assumption", `Assume ${signals.userType} will change behavior for sharper feedback, not just prettier output`, {
        strategy: "seed_assumption",
        why: "Surfaces the key behavior-change risk.",
        anchors: [signals.userType, "feedback"],
      }),
      makeNote("counter_argument", `${signals.currentAlternative} may already be fast enough for early thinking`, {
        strategy: "seed_counter_argument",
        why: "Acknowledges the incumbent behavior directly.",
        anchors: [signals.currentAlternative, "thinking"],
      }),
      makeNote("research", `Interview 5 ${signals.userType}: where does ${signals.friction} currently break decisions?`, {
        strategy: "seed_research",
        why: "Turns the idea into a concrete evidence question.",
        anchors: [signals.userType, signals.friction],
      }),
    ],
    {
      desiredMin: 5,
      desiredMax: 5,
      node: rootNode,
      action: "expand",
      anchors: [rawThought, ...signals.keyTerms, signals.userType, signals.currentAlternative],
      signals,
      existingContents: [rawThought],
    },
  );
}

function expandNotes(map: ThoughtMapModel, node: ThoughtNodeModel, signals: ContextSignals) {
  switch (node.kind) {
    case "core_claim":
      return [
        makeNote("core_claim", `Target ${signals.userType} who already feel ${signals.friction}`, {
          strategy: "expand_core_claim_audience",
          why: "Narrows the buyer around visible pain.",
          anchors: [signals.userType, signals.friction],
        }),
        makeNote("core_claim", `Win on ${signals.subject} before trying to solve the whole workflow`, {
          strategy: "expand_core_claim_scope",
          why: "Shrinks the promise to a wedge.",
          anchors: [signals.subject, "workflow"],
        }),
        makeNote("core_claim", `Position this as ${signals.outcome}, not general brainstorming help`, {
          strategy: "expand_core_claim_positioning",
          why: "Sharpens the claim around the result instead of the category.",
          anchors: [signals.outcome, "brainstorming"],
        }),
      ];
    case "why_it_matters":
      return [
        makeNote("why_it_matters", `${signals.friction} slows decisions before code or customer calls even start`, {
          strategy: "expand_why_time_cost",
          why: "Connects the idea to a visible time cost.",
          anchors: [signals.friction, "customer"],
        }),
        makeNote("why_it_matters", `Weak logic compounds: one fuzzy claim creates three bad next steps`, {
          strategy: "expand_why_compounding",
          why: "Shows second-order downside.",
          anchors: ["fuzzy", "next"],
        }),
        makeNote("why_it_matters", `${signals.outcome} matters because founders need to kill weak ideas early`, {
          strategy: "expand_why_decision_quality",
          why: "Links the tool to better portfolio decisions.",
          anchors: [signals.outcome, "founders"],
        }),
      ];
    case "assumption":
      return [
        makeNote("assumption", `Assume the user wants challenge, not reassurance`, {
          strategy: "expand_assumption_behavior",
          why: "Tests whether the product tension is acceptable.",
          anchors: ["challenge", "reassurance"],
        }),
        makeNote("assumption", `Assume short nodes beat long prose for ${signals.userType}`, {
          strategy: "expand_assumption_format",
          why: "Calls out the format bet directly.",
          anchors: [signals.userType, "short nodes"],
        }),
        makeNote("assumption", `Assume ${signals.currentAlternative} fails when ideas need branching, not drafting`, {
          strategy: "expand_assumption_incumbent_gap",
          why: "Specifies where the incumbent should break.",
          anchors: [signals.currentAlternative, "branching"],
        }),
      ];
    case "counter_argument":
      return [
        makeNote("counter_argument", `${signals.currentAlternative} already supports rough thinking with zero onboarding`, {
          strategy: "expand_counter_onboarding",
          why: "Points to the adoption advantage of existing tools.",
          anchors: [signals.currentAlternative, "onboarding"],
        }),
        makeNote("counter_argument", `Most people do not need a graph; they just need one clearer sentence`, {
          strategy: "expand_counter_frequency",
          why: "Challenges whether the format is overbuilt.",
          anchors: ["graph", "sentence"],
        }),
        makeNote("counter_argument", `A structured map can feel heavy if the idea is still too early`, {
          strategy: "expand_counter_timing",
          why: "Questions whether the workflow arrives too soon.",
          anchors: ["structured", "early"],
        }),
      ];
    case "research":
      return [
        makeNote("research", `Collect 3 examples where ${signals.currentAlternative} hid a weak assumption`, {
          strategy: "expand_research_examples",
          why: "Looks for evidence that the incumbent actually fails.",
          anchors: [signals.currentAlternative, "assumption"],
        }),
        makeNote("research", `Ask when ${signals.userType} move from messy notes to a real decision`, {
          strategy: "expand_research_trigger",
          why: "Finds the moment where structure becomes valuable.",
          anchors: [signals.userType, "decision"],
        }),
        makeNote("research", `Measure whether short branches produce faster critiques than a paragraph`, {
          strategy: "expand_research_comparison",
          why: "Turns the format bet into a test.",
          anchors: ["short branches", "paragraph"],
        }),
      ];
    case "root":
      return [
        makeNote("core_claim", `Start with ${signals.userType} deciding whether this idea deserves a week of work`, {
          strategy: "expand_root_buyer",
          why: "Sharpens the initial buyer and decision moment.",
          anchors: [signals.userType, "week of work"],
        }),
        makeNote("why_it_matters", `Paragraph thinking hides weak bets before anyone talks to a customer`, {
          strategy: "expand_root_consequence",
          why: "Explains the concrete downside of the current behavior.",
          anchors: ["paragraph", "customer"],
        }),
        makeNote("research", `Track whether pressure-test clicks produce better research questions than a blank doc`, {
          strategy: "expand_root_metric",
          why: "Turns the core product claim into a measurable comparison.",
          anchors: ["pressure-test", "blank doc"],
        }),
      ];
  }
}

function challengeNotes(node: ThoughtNodeModel, signals: ContextSignals) {
  switch (node.kind) {
    case "core_claim":
      return [
        makeNote("counter_argument", `This may be a formatting upgrade, not a must-have workflow change`, {
          strategy: "challenge_claim_formatting",
          why: "Challenges whether the product changes the outcome or just presentation.",
          anchors: ["workflow", "formatting"],
        }),
        makeNote("counter_argument", `${signals.userType} may not admit they think poorly; they just move faster`, {
          strategy: "challenge_claim_self_awareness",
          why: "Questions whether users recognize the problem.",
          anchors: [signals.userType, "faster"],
        }),
        makeNote("counter_argument", `${signals.currentAlternative} might be enough until the team is much larger`, {
          strategy: "challenge_claim_timing",
          why: "Pushes on whether the pain exists at the earliest stage.",
          anchors: [signals.currentAlternative, "team"],
        }),
      ];
    case "why_it_matters":
      return [
        makeNote("counter_argument", `Bad ideas usually die from distribution or demand, not weak internal structure`, {
          strategy: "challenge_why_externality",
          why: "Questions whether the root problem is elsewhere.",
          anchors: ["distribution", "demand"],
        }),
        makeNote("counter_argument", `Clearer thinking does not matter if nobody uses the output after the session`, {
          strategy: "challenge_why_followthrough",
          why: "Attacks the path from insight to action.",
          anchors: ["output", "session"],
        }),
        makeNote("counter_argument", `The cost of fuzzy thinking may be real but still too small to buy a new tool`, {
          strategy: "challenge_why_budget",
          why: "Separates pain from willingness to pay.",
          anchors: ["tool", "buy"],
        }),
      ];
    case "assumption":
      return [
        makeNote("counter_argument", `${signals.userType} may prefer comforting momentum over explicit challenge`, {
          strategy: "challenge_assumption_emotional",
          why: "Tests the emotional resistance to the workflow.",
          anchors: [signals.userType, "challenge"],
        }),
        makeNote("counter_argument", `Short nodes can oversimplify the logic and hide nuance`, {
          strategy: "challenge_assumption_lossiness",
          why: "Pushes on the compression tradeoff.",
          anchors: ["short nodes", "nuance"],
        }),
        makeNote("counter_argument", `If the user cannot judge note quality, sharper structure will not save them`, {
          strategy: "challenge_assumption_judgment",
          why: "Questions whether structure fixes the core skill gap.",
          anchors: ["quality", "structure"],
        }),
      ];
    case "counter_argument":
      return [
        makeNote("counter_argument", `Maybe the objection is only true for casual ideas, not high-stakes startup bets`, {
          strategy: "challenge_counter_scope",
          why: "Checks whether the counterpoint is too broad.",
          anchors: ["startup", "bets"],
        }),
        makeNote("counter_argument", `This objection weakens if the graph produces one immediate next test`, {
          strategy: "challenge_counter_test",
          why: "Sees whether actionability neutralizes the objection.",
          anchors: ["graph", "test"],
        }),
        makeNote("counter_argument", `The real blocker may be low-quality prompts, not the visual format itself`, {
          strategy: "challenge_counter_root_cause",
          why: "Pushes one level deeper on the true failure mode.",
          anchors: ["prompts", "format"],
        }),
      ];
    case "research":
      return [
        makeNote("counter_argument", `Interview answers may flatter the concept without proving repeated behavior`, {
          strategy: "challenge_research_vanity",
          why: "Avoids false confidence from soft evidence.",
          anchors: ["interview", "behavior"],
        }),
        makeNote("counter_argument", `Evidence from idea discussions may not transfer to real build decisions`, {
          strategy: "challenge_research_transfer",
          why: "Questions external validity.",
          anchors: ["evidence", "decisions"],
        }),
        makeNote("counter_argument", `If you only ask current believers, the research loop will stay biased`, {
          strategy: "challenge_research_sampling",
          why: "Calls out sample bias directly.",
          anchors: ["research", "biased"],
        }),
      ];
    case "root":
      return [
        makeNote("counter_argument", `${signals.currentAlternative} may already solve enough of this problem`, {
          strategy: "challenge_root_incumbent",
          why: "Challenges the whole idea at the incumbent layer.",
          anchors: [signals.currentAlternative, "problem"],
        }),
        makeNote("counter_argument", `The pain may be real, but the product category may still be too narrow`, {
          strategy: "challenge_root_category",
          why: "Separates problem validity from product validity.",
          anchors: ["pain", "product"],
        }),
        makeNote("counter_argument", `${signals.userType} may say they want rigor, then still default to speed and instinct`, {
          strategy: "challenge_root_behavior",
          why: "Challenges whether user behavior will match stated intent.",
          anchors: [signals.userType, "speed"],
        }),
      ];
  }
}

function invertNotes(node: ThoughtNodeModel, signals: ContextSignals) {
  switch (node.kind) {
    case "core_claim":
      return [
        makeNote("counter_argument", `Instead of helping ${signals.userType} think better, help them test ideas faster`, {
          strategy: "invert_claim_speed",
          why: "Flips from cognition to execution.",
          anchors: [signals.userType, "test ideas"],
        }),
        makeNote("counter_argument", `Instead of a visual map, use one ruthless question sequence`, {
          strategy: "invert_claim_interface",
          why: "Flips the interface assumption.",
          anchors: ["visual map", "question"],
        }),
        makeNote("counter_argument", `Instead of structuring the idea, structure the evidence against it`, {
          strategy: "invert_claim_evidence",
          why: "Flips the object of organization.",
          anchors: ["evidence", "idea"],
        }),
      ];
    case "why_it_matters":
      return [
        makeNote("why_it_matters", `Maybe speed matters more than depth: founders want momentum, not cleaner reasoning`, {
          strategy: "invert_why_speed",
          why: "Flips the value hierarchy.",
          anchors: ["founders", "momentum"],
        }),
        makeNote("why_it_matters", `Maybe the real value is social alignment, not individual clarity`, {
          strategy: "invert_why_team",
          why: "Flips the user benefit from solo to team.",
          anchors: ["alignment", "clarity"],
        }),
        makeNote("why_it_matters", `Maybe the tool matters only after a team already has customer evidence`, {
          strategy: "invert_why_timing",
          why: "Flips the ideal entry point.",
          anchors: ["team", "evidence"],
        }),
      ];
    case "assumption":
      return [
        makeNote("counter_argument", `Assume users want reassurance first, then challenge only after commitment`, {
          strategy: "invert_assumption_emotion",
          why: "Flips the emotional workflow.",
          anchors: ["reassurance", "challenge"],
        }),
        makeNote("counter_argument", `Assume long-form thinking is necessary before short branches become useful`, {
          strategy: "invert_assumption_format",
          why: "Flips the format bet.",
          anchors: ["long-form", "short branches"],
        }),
        makeNote("counter_argument", `Assume ${signals.currentAlternative} is good enough if the team has one sharp operator`, {
          strategy: "invert_assumption_operator",
          why: "Flips the dependence from tool to talent.",
          anchors: [signals.currentAlternative, "operator"],
        }),
      ];
    case "counter_argument":
      return [
        makeNote("core_claim", `If the graph exposes one hidden bad bet, the extra structure pays for itself`, {
          strategy: "invert_counter_payoff",
          why: "Flips the objection into a threshold claim.",
          anchors: ["graph", "bad bet"],
        }),
        makeNote("core_claim", `The heavier workflow is acceptable if it replaces one wasted build week`, {
          strategy: "invert_counter_cost",
          why: "Flips the cost objection into ROI.",
          anchors: ["workflow", "build week"],
        }),
        makeNote("core_claim", `What feels like friction may actually force the discipline the idea lacks`, {
          strategy: "invert_counter_discipline",
          why: "Flips the objection into a feature.",
          anchors: ["friction", "discipline"],
        }),
      ];
    case "research":
      return [
        makeNote("research", `Look for cases where messy notes outperformed structured maps`, {
          strategy: "invert_research_baseline",
          why: "Flips the baseline to search for disconfirming evidence.",
          anchors: ["notes", "maps"],
        }),
        makeNote("research", `Ask who should not use this tool and why`, {
          strategy: "invert_research_nonuser",
          why: "Looks for negative fit directly.",
          anchors: ["tool", "why"],
        }),
        makeNote("research", `Test whether one strong operator beats the product entirely`, {
          strategy: "invert_research_operator",
          why: "Searches for the strongest substitute.",
          anchors: ["operator", "product"],
        }),
      ];
    case "root":
      return [
        makeNote("core_claim", `The real product may be a decision workflow, not a visual thinking tool`, {
          strategy: "invert_root_category",
          why: "Flips the product framing.",
          anchors: ["decision", "visual"],
        }),
        makeNote("core_claim", `The strongest wedge may be evidence capture, not idea structuring`, {
          strategy: "invert_root_wedge",
          why: "Flips the initial product wedge.",
          anchors: ["evidence", "structuring"],
        }),
        makeNote("core_claim", `Instead of helping ${signals.userType} think, help them leave with one test worth running`, {
          strategy: "invert_root_output",
          why: "Flips from insight quality to decision output.",
          anchors: [signals.userType, "test"],
        }),
      ];
  }
}

function concretizeNotes(node: ThoughtNodeModel, signals: ContextSignals) {
  switch (node.kind) {
    case "core_claim":
      return [
        makeNote("core_claim", `For solo founders deciding whether to build this week`, {
          strategy: "concretize_claim_user",
          why: "Pins the claim to one buyer and one moment.",
          anchors: ["solo founders", "week"],
        }),
        makeNote("core_claim", `Output: a 6-node map with one claim, one risk, and one next research question`, {
          strategy: "concretize_claim_output",
          why: "Turns the claim into a visible artifact.",
          anchors: ["6-node map", "research question"],
        }),
        makeNote("core_claim", `Success means the user can name one idea to kill or one test to run in 10 minutes`, {
          strategy: "concretize_claim_success",
          why: "Defines a measurable product outcome.",
          anchors: ["kill", "10 minutes"],
        }),
      ];
    case "why_it_matters":
      return [
        makeNote("why_it_matters", `A founder saves one wasted prototype sprint`, {
          strategy: "concretize_why_time",
          why: "Converts abstract value into a concrete avoided cost.",
          anchors: ["prototype sprint", "founder"],
        }),
        makeNote("why_it_matters", `The team leaves with one sharper test instead of three vague ideas`, {
          strategy: "concretize_why_output",
          why: "Makes the benefit observable at session end.",
          anchors: ["team", "test"],
        }),
        makeNote("why_it_matters", `It matters most before user interviews, when logic is still cheap to fix`, {
          strategy: "concretize_why_timing",
          why: "Pins the product to a timing window.",
          anchors: ["user interviews", "cheap"],
        }),
      ];
    case "assumption":
      return [
        makeNote("assumption", `Test with 5 founders: do they prefer challenge mode over blank-page drafting?`, {
          strategy: "concretize_assumption_test",
          why: "Turns the assumption into a direct user test.",
          anchors: ["5 founders", "challenge mode"],
        }),
        makeNote("assumption", `Failure case: users copy one note, then leave without branching further`, {
          strategy: "concretize_assumption_failure",
          why: "Defines what assumption failure looks like in product behavior.",
          anchors: ["copy", "branching"],
        }),
        makeNote("assumption", `Measure whether node actions create a second click within 60 seconds`, {
          strategy: "concretize_assumption_metric",
          why: "Adds a fast behavioral signal.",
          anchors: ["second click", "60 seconds"],
        }),
      ];
    case "counter_argument":
      return [
        makeNote("counter_argument", `${signals.currentAlternative} wins if the idea can be pressure-tested in one paragraph`, {
          strategy: "concretize_counter_threshold",
          why: "Defines when the incumbent still wins.",
          anchors: [signals.currentAlternative, "paragraph"],
        }),
        makeNote("counter_argument", `If setup takes more than 2 minutes, the graph already lost`, {
          strategy: "concretize_counter_setup",
          why: "Makes the adoption objection measurable.",
          anchors: ["2 minutes", "graph"],
        }),
        makeNote("counter_argument", `This fails for low-stakes ideas where nobody needs explicit structure`, {
          strategy: "concretize_counter_segment",
          why: "Pins the objection to a segment boundary.",
          anchors: ["low-stakes", "structure"],
        }),
      ];
    case "research":
      return [
        makeNote("research", `Ask for the last idea they killed and what evidence caused it`, {
          strategy: "concretize_research_prompt",
          why: "Grounds the interview in real behavior.",
          anchors: ["last idea", "evidence"],
        }),
        makeNote("research", `Compare 10-minute outputs: paragraph draft versus node-action graph`, {
          strategy: "concretize_research_comparison",
          why: "Creates a clean head-to-head test.",
          anchors: ["10-minute", "graph"],
        }),
        makeNote("research", `Track whether users revisit the same map after the first session`, {
          strategy: "concretize_research_retention",
          why: "Checks whether the structure has ongoing value.",
          anchors: ["revisit", "session"],
        }),
      ];
    case "root":
      return [
        makeNote("core_claim", `User: ${signals.userType} with one rough idea and no clear proof yet`, {
          strategy: "concretize_root_user",
          why: "Defines the first user clearly.",
          anchors: [signals.userType, "proof"],
        }),
        makeNote("research", `First demo: paste one thought, click challenge, get 3 sharp counters`, {
          strategy: "concretize_root_demo",
          why: "Defines the smallest compelling interaction.",
          anchors: ["challenge", "3 sharp counters"],
        }),
        makeNote("assumption", `Core bet: short branches outperform broad prose for early-stage decisions`, {
          strategy: "concretize_root_bet",
          why: "States the product thesis directly.",
          anchors: ["short branches", "early-stage"],
        }),
      ];
  }
}

function connectNotes(map: ThoughtMapModel, node: ThoughtNodeModel, signals: ContextSignals) {
  const siblings = siblingHighlights(map, node);
  const siblingLabels = siblings.map((sibling) => `${sibling.kind}: ${sibling.content}`);

  switch (node.kind) {
    case "core_claim":
      return [
        makeNote("assumption", `This claim depends on the assumption that ${signals.currentAlternative} breaks under branching`, {
          strategy: "connect_claim_assumption",
          why: "Connects the claim to its dependency.",
          anchors: [signals.currentAlternative, "branching"],
        }),
        makeNote("research", `Connect this claim to evidence: what proof shows ${signals.userType} actually need this?`, {
          strategy: "connect_claim_research",
          why: "Connects the idea to missing evidence.",
          anchors: [signals.userType, "proof"],
        }),
        ...(siblingLabels[0]
          ? [
              makeNote("why_it_matters", `This claim gets stronger only if ${siblingLabels[0].toLowerCase()}`, {
                strategy: "connect_claim_sibling",
                why: "Connects the node to an adjacent branch already on the map.",
                anchors: [siblings[0].kind, siblings[0].content.slice(0, 24)],
              }),
            ]
          : []),
      ];
    case "why_it_matters":
      return [
        makeNote("core_claim", `If this matters, the product promise should focus on ${signals.outcome}`, {
          strategy: "connect_why_claim",
          why: "Links importance back to the product promise.",
          anchors: [signals.outcome, "promise"],
        }),
        makeNote("research", `Connect urgency to evidence: when did this friction last waste a real week?`, {
          strategy: "connect_why_research",
          why: "Links importance to a factual question.",
          anchors: ["friction", "week"],
        }),
        makeNote("assumption", `This only matters if ${signals.userType} feel the cost before they start building`, {
          strategy: "connect_why_assumption",
          why: "Links importance to timing sensitivity.",
          anchors: [signals.userType, "building"],
        }),
      ];
    case "assumption":
      return [
        makeNote("research", `Connect this assumption to one falsification test next week`, {
          strategy: "connect_assumption_test",
          why: "Links the assumption to direct evidence.",
          anchors: ["falsification", "week"],
        }),
        makeNote("counter_argument", `If this assumption fails, ${signals.currentAlternative} probably remains the default`, {
          strategy: "connect_assumption_counter",
          why: "Connects the assumption to the likely fallback.",
          anchors: [signals.currentAlternative, "default"],
        }),
        makeNote("why_it_matters", `This assumption matters because it determines whether the graph changes behavior`, {
          strategy: "connect_assumption_impact",
          why: "Links the assumption to core product value.",
          anchors: ["graph", "behavior"],
        }),
      ];
    case "counter_argument":
      return [
        makeNote("research", `Connect this objection to disconfirming evidence: when did ${signals.currentAlternative} fail?`, {
          strategy: "connect_counter_research",
          why: "Links the counterpoint to a way to disprove it.",
          anchors: [signals.currentAlternative, "fail"],
        }),
        makeNote("assumption", `This objection weakens only if the product saves more than setup costs`, {
          strategy: "connect_counter_assumption",
          why: "Connects the objection to the core ROI assumption.",
          anchors: ["setup", "costs"],
        }),
        makeNote("core_claim", `The claim must beat this objection in one sentence or it is still too soft`, {
          strategy: "connect_counter_claim",
          why: "Connects the objection back to claim quality.",
          anchors: ["sentence", "claim"],
        }),
      ];
    case "research":
      return [
        makeNote("assumption", `This research should target the assumption that matters most for ${signals.outcome}`, {
          strategy: "connect_research_assumption",
          why: "Connects evidence work to the highest-value uncertainty.",
          anchors: [signals.outcome, "assumption"],
        }),
        makeNote("counter_argument", `If the research comes back weak, the strongest counterargument probably wins`, {
          strategy: "connect_research_counter",
          why: "Connects missing evidence to decision risk.",
          anchors: ["research", "counterargument"],
        }),
        ...(siblingLabels[0]
          ? [
              makeNote("why_it_matters", `This research matters because ${siblingLabels[0].toLowerCase()}`, {
                strategy: "connect_research_sibling",
                why: "Ties the evidence request to an existing branch.",
                anchors: [siblings[0].kind, siblings[0].content.slice(0, 24)],
              }),
            ]
          : []),
      ];
    case "root":
      return [
        makeNote("core_claim", `Connect the raw thought to one buyer, one trigger, and one decision`, {
          strategy: "connect_root_triangle",
          why: "Links the raw idea to the three core structure anchors.",
          anchors: ["buyer", "trigger"],
        }),
        makeNote("research", `Connect the idea to proof: what evidence would actually kill it fast?`, {
          strategy: "connect_root_kill",
          why: "Links the raw idea to disconfirming evidence.",
          anchors: ["proof", "kill"],
        }),
        makeNote("assumption", `Connect the concept to its real bet: ${signals.userType} will trade speed for sharper structure`, {
          strategy: "connect_root_bet",
          why: "Links the idea to the core behavior-change assumption.",
          anchors: [signals.userType, "speed", "structure"],
        }),
      ];
  }
}

export function generateInitialBranchNotes(rawThought: string) {
  return generateInitialNotes(cleanSentence(rawThought));
}

export function generateActionNotes(params: {
  map: ThoughtMapModel;
  node: ThoughtNodeModel;
  action: NodeAction;
}): GeneratedActionBundle {
  const analysis = analyzeThoughtMap(params);
  const targetNode =
    params.map.nodes.find((node) => node.id === analysis.actionSelection.targetNodeId) ?? params.node;
  const sourceText = [params.map.rawThought, targetNode.content].join(" ");
  const signals = buildSignals(sourceText);
  const anchors = [
    params.map.rawThought,
    targetNode.content,
    ...signals.keyTerms,
    signals.userType,
    signals.currentAlternative,
    signals.outcome,
  ];
  const existingContents = params.map.nodes.map((node) => node.content);

  const baseCandidates =
    params.action === "expand"
      ? expandNotes(params.map, targetNode, signals)
      : params.action === "challenge"
        ? challengeNotes(targetNode, signals)
        : params.action === "invert"
          ? invertNotes(targetNode, signals)
          : params.action === "concretize"
            ? concretizeNotes(targetNode, signals)
            : connectNotes(params.map, targetNode, signals);

  const targetedGapCandidates = gapDrivenNotes(analysis.primaryGap, signals)
    .filter((note) => {
      if (params.action === "challenge") {
        return note.kind === "counter_argument";
      }

      if (params.action === "concretize") {
        return note.kind === "research" || note.kind === "core_claim";
      }

      if (params.action === "connect") {
        return note.kind === gapTargetKind(analysis.primaryGap) || note.kind === "research";
      }

      return true;
    });

  const qualityCandidates =
    analysis.actionSelection.mode === "replace_weak_branch"
      ? replacementNotes(targetNode, signals)
      : analysis.actionSelection.mode === "strengthen_branch"
        ? strengtheningNotes(targetNode, signals)
        : analysis.actionSelection.mode === "diversify_branches"
          ? diversificationNotes(targetNode)
          : [];

  const candidates =
    analysis.actionSelection.mode === "replace_weak_branch"
      ? qualityCandidates
      : [...qualityCandidates, ...targetedGapCandidates, ...baseCandidates];

  const notes = finalizeNotes(candidates, {
    desiredMin: 2,
    desiredMax: 4,
    node: targetNode,
    action: params.action,
    anchors,
    signals,
    existingContents,
  });

  const targetParentId =
    analysis.actionSelection.mode === "replace_weak_branch"
      ? targetNode.parentId
      : analysis.actionSelection.mode === "diversify_branches"
        ? targetNode.parentId ?? targetNode.id
        : targetNode.id;

  return {
    action: params.action,
    parentNodeId: targetNode.id,
    parentNodeKind: targetNode.kind,
    notes,
    execution: {
      mode: analysis.actionSelection.mode,
      targetNodeId: targetNode.id,
      targetNodeKind: targetNode.kind,
      targetParentId,
      supersededNodeId:
        analysis.actionSelection.mode === "replace_weak_branch" ? targetNode.id : null,
    },
    reasoning: {
      focus: `${params.action} on ${targetNode.kind}`,
      heuristics: [
        "Enforce node-type-specific logic",
        "Inspect the whole graph before choosing which gap to strengthen",
        "Score each node for specificity, concreteness, wording, tension, and redundancy",
        "Choose whether to add, strengthen, replace, or diversify before generating notes",
        "Anchor output to source terms and user context",
        "Reject generic notes and backfill with specificity fallbacks",
        "Drop near-duplicate notes against the existing map",
      ],
      sourceAnchors: anchors
        .map((value) => clip(value))
        .filter(Boolean)
        .slice(0, 6),
      graphAnalysis: {
        primaryGap: analysis.primaryGap,
        secondaryGap: analysis.secondaryGap,
        coverage: analysis.coverage,
        reasons: analysis.reasons,
        missingKinds: analysis.missingKinds,
        weakNodes: analysis.weakNodes.map((node) => ({
          nodeId: node.nodeId,
          kind: node.kind,
          content: node.content,
          score: node.total,
          issues: node.issues,
        })),
        actionSelection: analysis.actionSelection,
      },
    },
  };
}
