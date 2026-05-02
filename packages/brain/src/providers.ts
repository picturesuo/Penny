import { createXai } from "@ai-sdk/xai";
import { generateText, Output, type LanguageModel, type ToolSet } from "ai";
import { SeedProviderSchema, type BrainSeedInput, type BrainSeedOutput, type SeedProviderOutput } from "./schema.ts";
import { createSearchBroker } from "./search-broker.ts";
import { shouldUseWebSearch } from "./search-decision-service.ts";

export const defaultXaiBrainSeedModel = "grok-4.20-reasoning";

const brainSeedOutputSpec = Output.object<SeedProviderOutput>({
  schema: SeedProviderSchema,
  name: "penny_brain_seed",
  description: "Penny's first-loop seed extraction with claims, assumption edges, exploration paths, and a challenge preview.",
});

export type BrainSeedGenerateText = (request: {
  model: LanguageModel;
  system: string;
  prompt: string;
  output: typeof brainSeedOutputSpec;
  maxRetries: number;
  tools?: ToolSet;
  providerOptions: {
    xai: {
      store: false;
    };
  };
}) => Promise<{ output: unknown }>;

export type XaiBrainSeedProviderOptions = {
  generateText?: BrainSeedGenerateText;
};

export type BrainSeedProvider = {
  name: string;
  generate(input: BrainSeedInput): Promise<unknown>;
};

export class BrainSeedProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrainSeedProviderError";
  }
}

export function createDefaultBrainSeedProvider(env: Record<string, string | undefined> = process.env): BrainSeedProvider {
  if (env.XAI_API_KEY?.trim()) {
    return createXaiBrainSeedProvider(env);
  }

  return createHeuristicBrainSeedProvider();
}

export function createHeuristicBrainSeedProvider(): BrainSeedProvider {
  return {
    name: "heuristic",
    async generate(input) {
      return buildHeuristicSeed(input);
    },
  };
}

export function createXaiBrainSeedProvider(
  env: Record<string, string | undefined> = process.env,
  options: XaiBrainSeedProviderOptions = {},
): BrainSeedProvider {
  return createAiSdkXaiBrainSeedProvider(env, options);
}

export function createAiSdkXaiBrainSeedProvider(
  env: Record<string, string | undefined> = process.env,
  options: XaiBrainSeedProviderOptions = {},
): BrainSeedProvider {
  return {
    name: "xai",
    async generate(input) {
      const apiKey = env.XAI_API_KEY?.trim();

      if (!apiKey) {
        throw new BrainSeedProviderError("XAI_API_KEY is required for the xAI brain seed provider.");
      }

      const xai = createXai(createXaiSettings(apiKey, env));
      const callGenerateText = options.generateText ?? generateStructuredBrainSeed;
      const searchBroker = createSearchBroker({
        providerName: "xai",
        webSearch: typeof xai.tools.webSearch === "function" ? xai.tools.webSearch : null,
      });
      const search = searchBroker.prepare(brainSeedSearchInput(input), "learn", brainSeedSearchContext(input));

      try {
        const request: Parameters<BrainSeedGenerateText>[0] = {
          model: xai.responses(resolveXaiBrainSeedModel(env)),
          system: buildBrainSeedSystemPrompt(),
          prompt: buildBrainSeedPrompt(input, search.instructions),
          output: brainSeedOutputSpec,
          maxRetries: 1,
          providerOptions: {
            xai: {
              store: false,
            },
          },
        };

        if (search.tools) {
          request.tools = search.tools;
        }

        const result = await callGenerateText(request);

        return result.output;
      } catch (error) {
        if (error instanceof BrainSeedProviderError) {
          throw error;
        }

        throw new BrainSeedProviderError(`xAI brain seed request failed: ${formatUnknownError(error)}`);
      }
    },
  };
}

export function resolveXaiBrainSeedModel(env: Record<string, string | undefined> = process.env): string {
  return env.XAI_BRAIN_SEED_MODEL?.trim() || env.XAI_MODEL?.trim() || defaultXaiBrainSeedModel;
}

export function buildBrainSeedSystemPrompt(): string {
  return [
    "You are Penny, a controllable thinking instrument enhanced by AI.",
    "You are on the user's team, but you push them when their structure is weak.",
    "Extract hidden assumptions from the raw idea. Do not provide generic advice.",
    "Build a compact thought map from Claims and typed Edges.",
    "The first challenge must attack the load-bearing structure: the assumption whose failure would make the idea collapse or need major revision.",
    "Avoid generic startup, product, productivity, or AI-app platitudes.",
    "Do not invent citations, market facts, or external evidence.",
    "Return only the structured seed extraction.",
  ].join("\n");
}

export function buildBrainSeedPrompt(input: BrainSeedInput, searchInstructions?: string): string {
  const sessionId = resolveSeedSessionId(input);

  return [
    "Create Penny's first-loop seed extraction for this raw idea.",
    "",
    "Required IDs and values:",
    "- source.id must be source.raw_idea.",
    `- source.rawText must exactly equal: ${JSON.stringify(input.rawIdea.trim())}.`,
    `- session.id must be ${sessionId}.`,
    "- session.sourceId must be source.raw_idea.",
    "- session.status must be open.",
    "- seedClaim.id should be claim.seed.",
    "- Confidence values must be integer percentages from 0 to 100.",
    "- responseOptions must be exactly Defend, Revise, Absorb in that order.",
    "- firstChallenge.failureType must be one of weak_evidence, missing_counterargument, shaky_assumption, analogy_break, dependency_risk, unaddressed_precedent, premise_rejection, definition_failure.",
    "- learnCandidates must include contextual terms that could confuse the user inside this idea.",
    "- Do not return moves. Penny creates immutable Moves locally after persistence.",
    "- Do not return artifacts. Penny compiles artifacts later from actual session state.",
    "",
    "Quality bar:",
    "- Return at least 3 hidden assumptions specific to the user's raw idea, not generic implementation advice.",
    "- Return at least 6 exploration paths that help the user decide what to inspect next in Brain.",
    "- The challenge should name the weakest load-bearing assumption and pressure it directly.",
    "- Keep the output compact enough for a first session.",
    "- If web search is attached, use it only for current facts or named entities the user explicitly brings into the idea.",
    "- Do not add external facts to the graph unless the searched source directly grounds them.",
    "",
    searchInstructions ?? createSearchBroker().prepare(brainSeedSearchInput(input), "learn", brainSeedSearchContext(input)).instructions,
    "",
    `Raw idea: ${input.rawIdea}`,
  ].join("\n");
}

export function brainSeedSearchDecision(input: BrainSeedInput) {
  return shouldUseWebSearch(brainSeedSearchInput(input), "learn", brainSeedSearchContext(input));
}

function brainSeedSearchInput(input: BrainSeedInput) {
  return {
    query: input.rawIdea,
    text: input.rawIdea,
    userRequest: input.rawIdea,
  };
}

function brainSeedSearchContext(_input: BrainSeedInput) {
  return {
    brainContext: null,
    brainContextSufficient: true,
  };
}

function buildHeuristicSeed(input: BrainSeedInput): BrainSeedOutput {
  const idea = input.rawIdea.trim();
  const sessionId = input.sessionId ?? "00000000-0000-4000-8000-000000000001";
  const ycSeed = buildYcHeuristicSeed(idea, sessionId);
  const demoSeed = buildPennyDemoHeuristicSeed(idea, sessionId);

  if (ycSeed) {
    return ycSeed;
  }

  if (demoSeed) {
    return demoSeed;
  }

  const focusTerm = extractFocusTerm(idea);
  const learnTerm = extractLearnTerm(idea);
  const assumptionOne =
    `The claim "${idea}" names a real study bottleneck rather than a vague product benefit.`;
  const assumptionTwo =
    `The proposed assistant can reduce ${focusTerm} by structuring attention, choices, and next steps instead of adding more material to process.`;
  const assumptionThree =
    `Lower ${focusTerm} will improve learning outcomes enough for the user to notice and trust the system.`;

  return {
    source: {
      id: "source.raw_idea",
      rawText: idea,
    },
    session: {
      id: sessionId,
      sourceId: "source.raw_idea",
      status: "open",
    },
    seedClaim: {
      id: "claim.seed",
      kind: "belief",
      text: idea,
      confidence: 62,
    },
    assumptions: [
      {
        id: "claim.assumption.1",
        kind: "assumption",
        text: assumptionOne,
        confidence: 55,
        pressure: "high",
        whyItMatters: "If the input is only a broad slogan, the map will look useful while hiding the real mechanism.",
      },
      {
        id: "claim.assumption.2",
        kind: "assumption",
        text: assumptionTwo,
        confidence: 50,
        pressure: "high",
        whyItMatters: "If the assistant adds more decisions or explanations, it can increase the exact burden it claims to reduce.",
      },
      {
        id: "claim.assumption.3",
        kind: "assumption",
        text: assumptionThree,
        confidence: 48,
        pressure: "medium",
        whyItMatters: "If reduced load does not change retention, confidence, or study behavior, the product benefit is cosmetic.",
      },
    ],
    thoughtMap: {
      claims: [
        {
          id: "claim.seed",
          kind: "belief",
          text: idea,
          confidence: 62,
        },
        {
          id: "claim.assumption.1",
          kind: "assumption",
          text: assumptionOne,
          confidence: 55,
        },
        {
          id: "claim.assumption.2",
          kind: "assumption",
          text: assumptionTwo,
          confidence: 50,
        },
        {
          id: "claim.assumption.3",
          kind: "assumption",
          text: assumptionThree,
          confidence: 48,
        },
      ],
      edges: [
        {
          id: "edge.seed.assumption.1",
          fromClaimId: "claim.seed",
          toClaimId: "claim.assumption.1",
          kind: "depends_on",
          label: "depends on the raw idea naming a real bottleneck",
        },
        {
          id: "edge.seed.assumption.2",
          fromClaimId: "claim.seed",
          toClaimId: "claim.assumption.2",
          kind: "depends_on",
          label: `depends on the assistant reducing ${focusTerm}`,
        },
        {
          id: "edge.seed.assumption.3",
          fromClaimId: "claim.seed",
          toClaimId: "claim.assumption.3",
          kind: "depends_on",
          label: "depends on reduced load improving learning outcomes",
        },
      ],
    },
    explorationPaths: [
      {
        id: "path.define-load",
        title: `Define ${focusTerm}`,
        prompt: `What exactly counts as ${focusTerm} in the user's study session, and how would the user recognize it dropping?`,
        expectedValue: "Turns a broad benefit into an inspectable claim.",
      },
      {
        id: "path-find-burden",
        title: "Find the burden source",
        prompt: "Is the load coming from choosing what to study, holding context in memory, judging confidence, or translating feedback into action?",
        expectedValue: "Identifies which claim the product has to prove first.",
      },
      {
        id: "path-mechanism",
        title: "Name the reduction mechanism",
        prompt: "What does the assistant remove or simplify: options, reminders, explanations, feedback loops, or context switching?",
        expectedValue: "Prevents the idea from relying on a vague AI improvement claim.",
      },
      {
        id: "path-counterexample",
        title: "Find the overload counterexample",
        prompt: "Where could an AI study assistant increase load by producing more suggestions, explanations, or notifications?",
        expectedValue: "Surfaces the weakest version before building around it.",
      },
      {
        id: "path-measure",
        title: "Choose the proof signal",
        prompt: "What observable signal would prove reduced load: faster recall, fewer abandoned sessions, better quiz performance, or lower self-reported effort?",
        expectedValue: "Connects the claim to a falsifiable outcome.",
      },
      {
        id: "path-alternative",
        title: "Compare the non-AI alternative",
        prompt: "Could a checklist, spaced repetition flow, or teacher-created guide reduce the same load with less risk?",
        expectedValue: "Tests whether AI is necessary for the value proposition.",
      },
    ],
    keyInsight: `The load-bearing question is whether the assistant can reduce ${focusTerm} without creating a new layer of work.`,
    firstChallenge: {
      targetClaimId: "claim.assumption.1",
      failureType: "definition_failure",
      weakestPart: `The idea does not yet define ${focusTerm} tightly enough to prove reduction.`,
      challenge: `Defend what ${focusTerm} means here. If the load is really motivation, poor materials, or weak feedback rather than mental effort, revise the seed claim before building the assistant around it.`,
      responseOptions: ["Defend", "Revise", "Absorb"],
    },
    learnCandidates: [
      {
        id: "learn.cognitive-load",
        claimId: "claim.assumption.1",
        term: learnTerm,
        whyItMatters: `The seed idea relies on ${learnTerm} being concrete enough to challenge and measure.`,
        unblockExplanation: `${capitalize(learnTerm)} is the mental effort needed to process a task. In this idea, Penny should ask what part of studying consumes that effort before assuming AI reduces it.`,
      },
    ],
  };
}

function buildYcHeuristicSeed(idea: string, sessionId: string): BrainSeedOutput | null {
  if (!/\b(yc|y combinator)\b/i.test(idea)) {
    return null;
  }

  const seedText =
    "Learn YC as an application evaluation model: what the program does, which early-company signals matter, and how a founder should turn that into concrete application proof.";
  const assumptionOne =
    "YC is primarily evaluating whether the founders can make an early startup become much stronger during the batch.";
  const assumptionTwo =
    "Founder evidence, clarity of thought, and problem insight matter more than outside investor interest for an early application.";
  const assumptionThree =
    "The idea, market, traction, and investors are useful only when they make the founder-team and company trajectory more believable.";
  const questionOne = "Which part of the application currently asks YC to trust a vague adjective instead of inspecting concrete proof?";
  const conceptOne =
    "Founder evidence means specific built, learned, sold, shipped, or unusually hard things that show the team can execute under uncertainty.";
  const conceptTwo =
    "Application signal means a concrete detail that lets a reader infer team quality, market pull, insight, speed, or learning rate.";

  return {
    source: {
      id: "source.raw_idea",
      rawText: idea,
    },
    session: {
      id: sessionId,
      sourceId: "source.raw_idea",
      status: "open",
    },
    seedClaim: {
      id: "claim.seed",
      kind: "belief",
      text: seedText,
      confidence: 68,
    },
    assumptions: [
      {
        id: "claim.assumption.founders",
        kind: "assumption",
        text: assumptionOne,
        confidence: 64,
        pressure: "high",
        whyItMatters: "If YC is not mostly judging founder capacity and learning rate, the learning path will optimize the wrong signal.",
      },
      {
        id: "claim.assumption.signal",
        kind: "assumption",
        text: assumptionTwo,
        confidence: 62,
        pressure: "high",
        whyItMatters: "If investor interest is treated as the main proof, the application can hide the more important founder and insight evidence.",
      },
      {
        id: "claim.assumption.context",
        kind: "assumption",
        text: assumptionThree,
        confidence: 58,
        pressure: "medium",
        whyItMatters: "If each category is learned in isolation, the founder will memorize labels instead of building a coherent application spine.",
      },
    ],
    thoughtMap: {
      claims: [
        {
          id: "claim.seed",
          kind: "belief",
          text: seedText,
          confidence: 68,
        },
        {
          id: "claim.assumption.founders",
          kind: "assumption",
          text: assumptionOne,
          confidence: 64,
        },
        {
          id: "claim.assumption.signal",
          kind: "assumption",
          text: assumptionTwo,
          confidence: 62,
        },
        {
          id: "claim.assumption.context",
          kind: "assumption",
          text: assumptionThree,
          confidence: 58,
        },
        {
          id: "claim.question.application-proof",
          kind: "question",
          text: questionOne,
          confidence: 70,
        },
        {
          id: "claim.concept.founder-evidence",
          kind: "concept",
          text: conceptOne,
          confidence: 74,
        },
        {
          id: "claim.concept.application-signal",
          kind: "concept",
          text: conceptTwo,
          confidence: 72,
        },
      ],
      edges: [
        {
          id: "edge.seed.founders",
          fromClaimId: "claim.seed",
          toClaimId: "claim.assumption.founders",
          kind: "depends_on",
          label: "depends on YC judging early founder capacity",
        },
        {
          id: "edge.seed.signal",
          fromClaimId: "claim.seed",
          toClaimId: "claim.assumption.signal",
          kind: "depends_on",
          label: "depends on concrete signals mattering more than investor status",
        },
        {
          id: "edge.seed.context",
          fromClaimId: "claim.seed",
          toClaimId: "claim.assumption.context",
          kind: "depends_on",
          label: "depends on idea, market, traction, and investors acting as evidence",
        },
        {
          id: "edge.question.signal",
          fromClaimId: "claim.question.application-proof",
          toClaimId: "claim.assumption.signal",
          kind: "questions",
          label: "asks where the application lacks inspectable proof",
        },
        {
          id: "edge.concept.founder-evidence",
          fromClaimId: "claim.concept.founder-evidence",
          toClaimId: "claim.assumption.founders",
          kind: "teaches",
          label: "defines founder proof",
        },
        {
          id: "edge.concept.application-signal",
          fromClaimId: "claim.concept.application-signal",
          toClaimId: "claim.assumption.signal",
          kind: "teaches",
          label: "defines what the application should expose",
        },
      ],
    },
    explorationPaths: [
      {
        id: "path-reword-goal",
        title: "Reword the real goal",
        prompt: "Can the founder restate the YC task as proving team quality, insight, and progress rather than winning prestige?",
        expectedValue: "Turns a broad YC question into an actionable application model.",
      },
      {
        id: "path-what-yc-does",
        title: "Frame what YC does",
        prompt: "What changes for a company during YC: advice, batch pressure, user learning, fundraising readiness, or founder judgment?",
        expectedValue: "Separates YC the program from investor logo-chasing.",
      },
      {
        id: "path-founder-proof",
        title: "Inventory founder evidence",
        prompt: "What has each founder built, shipped, sold, learned, or endured that proves unusual execution ability?",
        expectedValue: "Creates the proof base before polishing application prose.",
      },
      {
        id: "path-idea-insight",
        title: "Name the insight in the idea",
        prompt: "What non-obvious user behavior, workflow pain, or market opening makes this idea more than a generic startup category?",
        expectedValue: "Connects idea quality to founder insight.",
      },
      {
        id: "path-traction-market",
        title: "Sort traction and market signals",
        prompt: "Which traction or market facts show real pull, and which are only large-market storytelling?",
        expectedValue: "Prevents market size or early investors from substituting for proof.",
      },
      {
        id: "path-application-gap",
        title: "Find the foundation gap",
        prompt: "Which application sentence needs a concrete example, number, user quote, shipped artifact, or customer fact before Check or Verify?",
        expectedValue: "Produces the next Check or Verify target.",
      },
    ],
    keyInsight:
      "The reworded goal is to learn YC as a signal-reading system: show founder quality, clear insight, and evidence of progress, while treating investors as context rather than the main proof.",
    firstChallenge: {
      targetClaimId: "claim.assumption.signal",
      failureType: "weak_evidence",
      weakestPart: "The founder may still be ranking YC categories abstractly instead of naming the concrete proof that would make an application believable.",
      challenge:
        "Defend the strongest concrete signal in the application. If the proof is only adjectives, market size, or investor interest, revise the application spine around founder evidence, insight, and progress before moving to Verify.",
      responseOptions: ["Defend", "Revise", "Absorb"],
    },
    learnCandidates: [
      {
        id: "learn.founder-evidence",
        claimId: "claim.concept.founder-evidence",
        term: "founder evidence",
        whyItMatters: "The learning path depends on knowing what proof makes founders credible before the company has much history.",
        unblockExplanation:
          "Founder evidence is specific behavior or output that proves the team can execute: shipped products, customer learning, unusual speed, technical depth, sales ability, or hard-won domain insight.",
      },
      {
        id: "learn.application-signal",
        claimId: "claim.concept.application-signal",
        term: "application signal",
        whyItMatters: "The founder needs to turn each YC answer into inspectable evidence rather than broad ambition.",
        unblockExplanation:
          "An application signal is a detail that lets a reader infer something important quickly, such as team quality, user pull, market insight, learning speed, or execution under uncertainty.",
      },
    ],
  };
}

function buildPennyDemoHeuristicSeed(idea: string, sessionId: string): BrainSeedOutput | null {
  if (!/\bpenny\b/i.test(idea) || !/\bcreativ/i.test(idea) || !/\bsource[-\s]grounded\b/i.test(idea)) {
    return null;
  }

  const assumptionOne = "Penny can evoke better creative starting points more consistently than an open-ended chat or blank document.";
  const assumptionTwo = "Penny can turn that creative spark into claims, assumptions, checks, and sources without slowing the user down.";
  const assumptionThree = "Users will trust structured, source-grounded thinking more than fast but unsupported generative output.";
  const questionOne = "What observable first-session signal proves Penny is more efficient?";
  const conceptOne = "Source-grounded thinking means each important claim keeps a visible path back to evidence, assumptions, or user-provided context.";

  return {
    source: {
      id: "source.raw_idea",
      rawText: idea,
    },
    session: {
      id: sessionId,
      sourceId: "source.raw_idea",
      status: "open",
    },
    seedClaim: {
      id: "claim.seed",
      kind: "belief",
      text: idea,
      confidence: 64,
    },
    assumptions: [
      {
        id: "claim.assumption.creativity",
        kind: "assumption",
        text: assumptionOne,
        confidence: 46,
        pressure: "high",
        whyItMatters: "If Penny cannot reliably evoke better starting material, the efficiency claim becomes a prettier capture flow rather than a thinking advantage.",
      },
      {
        id: "claim.assumption.structure",
        kind: "assumption",
        text: assumptionTwo,
        confidence: 50,
        pressure: "high",
        whyItMatters: "If structure adds friction, Penny loses the efficiency wedge even if the final map is intellectually cleaner.",
      },
      {
        id: "claim.assumption.trust",
        kind: "assumption",
        text: assumptionThree,
        confidence: 52,
        pressure: "medium",
        whyItMatters: "If users do not care about provenance during creative work, source grounding may be a later enterprise feature rather than the first-loop hook.",
      },
    ],
    thoughtMap: {
      claims: [
        {
          id: "claim.seed",
          kind: "belief",
          text: idea,
          confidence: 64,
        },
        {
          id: "claim.assumption.creativity",
          kind: "assumption",
          text: assumptionOne,
          confidence: 46,
        },
        {
          id: "claim.assumption.structure",
          kind: "assumption",
          text: assumptionTwo,
          confidence: 50,
        },
        {
          id: "claim.assumption.trust",
          kind: "assumption",
          text: assumptionThree,
          confidence: 52,
        },
        {
          id: "claim.question.efficiency",
          kind: "question",
          text: questionOne,
          confidence: 66,
        },
        {
          id: "claim.concept.source_grounded",
          kind: "concept",
          text: conceptOne,
          confidence: 74,
        },
      ],
      edges: [
        {
          id: "edge.seed.creativity",
          fromClaimId: "claim.seed",
          toClaimId: "claim.assumption.creativity",
          kind: "depends_on",
          label: "depends on creativity being reliably evoked",
        },
        {
          id: "edge.seed.structure",
          fromClaimId: "claim.seed",
          toClaimId: "claim.assumption.structure",
          kind: "depends_on",
          label: "depends on structure preserving speed",
        },
        {
          id: "edge.seed.trust",
          fromClaimId: "claim.seed",
          toClaimId: "claim.assumption.trust",
          kind: "depends_on",
          label: "depends on source grounding increasing trust",
        },
        {
          id: "edge.question.seed",
          fromClaimId: "claim.question.efficiency",
          toClaimId: "claim.seed",
          kind: "questions",
          label: "asks how efficiency will be observed",
        },
        {
          id: "edge.concept.seed",
          fromClaimId: "claim.concept.source_grounded",
          toClaimId: "claim.seed",
          kind: "teaches",
          label: "defines the source-grounded thinking promise",
        },
      ],
    },
    explorationPaths: [
      {
        id: "path-first-session-signal",
        title: "Define the first-session efficiency signal",
        prompt: "What should a user accomplish in the first five minutes that would be slower or weaker in chat, notes, or a blank document?",
        expectedValue: "Turns the efficiency claim into a demo-visible outcome.",
      },
      {
        id: "path-creativity-mechanism",
        title: "Name the creativity mechanism",
        prompt: "Does Penny evoke creativity through better prompts, visible assumptions, pressure from Check, retrieval from Brain, or a canvas that makes relationships obvious?",
        expectedValue: "Separates real product mechanism from a broad creativity slogan.",
      },
      {
        id: "path-structure-without-friction",
        title: "Test structure without friction",
        prompt: "Where could the claim and source structure slow the user enough that a looser AI chat feels more efficient?",
        expectedValue: "Finds the main product tradeoff before the demo overclaims speed.",
      },
      {
        id: "path-source-grounding-threshold",
        title: "Set the grounding threshold",
        prompt: "Which claims need sources immediately, and which can remain clearly labeled as assumptions until Verify is invoked?",
        expectedValue: "Keeps source grounding from becoming fake citation theater.",
      },
      {
        id: "path-compare-current-workflow",
        title: "Compare the current workflow",
        prompt: "What does the target user do today when they need creative but rigorous thinking: chat, docs, Miro, notes, research tabs, or a teammate?",
        expectedValue: "Anchors the demo in a concrete before-and-after workflow.",
      },
      {
        id: "path-saveable-artifact",
        title: "Choose the saveable artifact",
        prompt: "Should the first loop leave behind an Idea Map, Challenge Brief, decision memo, or reusable Brain object?",
        expectedValue: "Connects the creative spark to durable structured memory.",
      },
    ],
    keyInsight:
      "The load-bearing bet is not that Penny can generate ideas; it is that Penny can make creative thinking inspectable, challengeable, and source-grounded without losing speed.",
    firstChallenge: {
      targetClaimId: "claim.assumption.creativity",
      failureType: "shaky_assumption",
      weakestPart: "The demo claim assumes Penny reliably evokes better creativity, but it has not named the mechanism or the first-session proof.",
      challenge:
        "Defend why Penny is more efficient than a strong prompt in a chat window. If the advantage is really structure, provenance, or follow-through rather than creativity itself, revise the claim so the demo pressure lands on the true mechanism.",
      responseOptions: ["Defend", "Revise", "Absorb"],
    },
    learnCandidates: [
      {
        id: "learn.source-grounded-thinking",
        claimId: "claim.concept.source_grounded",
        term: "source-grounded thinking",
        whyItMatters: "The seed promise depends on grounding being visible enough to build trust without turning creativity into a research chore.",
        unblockExplanation:
          "Source-grounded thinking means Penny marks which parts came from the user, which parts are assumptions, and which parts need Verify before they become stable claims.",
      },
      {
        id: "learn-structured-creativity",
        claimId: "claim.assumption.creativity",
        term: "structured creativity",
        whyItMatters: "The demo needs to show that structure improves creative output instead of merely organizing it after the fact.",
        unblockExplanation:
          "Structured creativity is divergent thinking with constraints: Penny surfaces options, then turns them into claims and assumptions that can be checked.",
      },
    ],
  };
}

function extractFocusTerm(idea: string): string {
  const reductionMatch = /\breduces?\s+(.+)$/i.exec(idea.trim());

  if (reductionMatch?.[1]?.trim()) {
    return reductionMatch[1].trim().replace(/[.?!]+$/, "").toLowerCase();
  }

  return "the user's cognitive load";
}

function extractLearnTerm(idea: string): string {
  if (/\bcognitive load\b/i.test(idea)) {
    return "cognitive load";
  }

  return extractFocusTerm(idea);
}

function capitalize(value: string): string {
  return value ? `${value[0]?.toUpperCase()}${value.slice(1)}` : value;
}

async function generateStructuredBrainSeed(request: Parameters<BrainSeedGenerateText>[0]): Promise<{ output: unknown }> {
  const result = await generateText(request);

  return { output: result.output };
}

function resolveSeedSessionId(input: BrainSeedInput): string {
  return input.sessionId ?? "00000000-0000-4000-8000-000000000001";
}

function createXaiSettings(apiKey: string, env: Record<string, string | undefined>) {
  const baseURL = env.XAI_BASE_URL?.trim();

  if (!baseURL) {
    return { apiKey };
  }

  return { apiKey, baseURL: baseURL.replace(/\/+$/, "") };
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return String(error);
}
