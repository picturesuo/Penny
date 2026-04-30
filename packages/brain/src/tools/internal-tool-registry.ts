import { z } from "zod";
import type {
  IssueChallengeFromCandidateInput,
  IssueChallengeResponse,
  RespondToChallengeInput,
  RespondToChallengeResponse,
} from "../services/challenge-service.ts";
import type { ChallengeBriefResponse } from "../services/challenge-brief-service.ts";
import type {
  ManualFocusInput,
  ManualFocusResponse,
  StartNextMoveInput,
  StartNextMoveResponse,
  ThinkingModeStateResponse,
  ThinkingModeTickInput,
  ThinkingModeTickResponse,
} from "../services/thinking-mode-service.ts";
import { MvpModeSchema } from "../modes.ts";

export const pennyInternalToolNames = [
  "penny.get_autopilot_state",
  "penny.tick_autopilot",
  "penny.start_next_move",
  "penny.select_manual_node",
  "penny.issue_challenge",
  "penny.respond_to_challenge",
  "penny.generate_challenge_brief",
] as const;

export type PennyInternalToolName = (typeof pennyInternalToolNames)[number];

export type ThinkingModeToolService = {
  getState(brainId: string, sessionId: string): Promise<ThinkingModeStateResponse>;
  tick(input: ThinkingModeTickInput): Promise<ThinkingModeTickResponse>;
  startCandidate(input: StartNextMoveInput): Promise<StartNextMoveResponse>;
  manualFocus(input: ManualFocusInput): Promise<ManualFocusResponse>;
};

export type ChallengeRoundToolService = {
  issueChallengeFromCandidate(input: IssueChallengeFromCandidateInput): Promise<IssueChallengeResponse>;
  respondToChallenge(input: RespondToChallengeInput): Promise<RespondToChallengeResponse>;
};

export type ChallengeBriefToolService = {
  generateChallengeBrief(sessionId: string): Promise<ChallengeBriefResponse>;
};

export type PennyInternalToolServices = {
  thinkingModeService: ThinkingModeToolService;
  challengeRoundService: ChallengeRoundToolService;
  challengeBriefService: ChallengeBriefToolService;
};

export type PennyInternalTool = {
  name: PennyInternalToolName;
  description: string;
  inputSchema: z.ZodType;
  outputSchema: z.ZodType;
  handler(input: unknown): Promise<unknown>;
};

export type PennyInternalToolRegistry = ReadonlyMap<PennyInternalToolName, PennyInternalTool>;

export class PennyInternalToolNotFoundError extends Error {
  constructor(name: string) {
    super(`Internal Penny tool was not found: ${name}`);
    this.name = "PennyInternalToolNotFoundError";
  }
}

const UuidSchema = z.string().uuid();
const CandidateReferenceSchema = z.string().trim().min(1).max(200);
const JsonObjectSchema = z.record(z.string(), z.unknown());
const ToolActionSchema = z.enum(["resume_open_challenge", "learn", "clarify", "verify", "challenge"]);
const ThinkingModeSchema = z.enum(["brain", "challenge", "verify", "learn", "artifact"]);
const ChallengeResponseSchema = z.enum(["defend", "revise", "absorb"]);
const ChallengeStrengthSchema = z.enum(["weak", "moderate", "strong"]);

const GetAutopilotStateInputSchema = z
  .object({
    brainId: UuidSchema,
    sessionId: UuidSchema,
  })
  .strict();

const TickAutopilotInputSchema = z
  .object({
    brainId: UuidSchema,
    sessionId: UuidSchema,
    resume: z.boolean().optional(),
    limit: z.number().int().min(1).max(20).optional(),
  })
  .strict();

const StartNextMoveInputSchema = z
  .object({
    brainId: UuidSchema,
    sessionId: UuidSchema,
    candidateId: CandidateReferenceSchema,
  })
  .strict();

const SelectManualNodeInputSchema = z
  .object({
    brainId: UuidSchema,
    sessionId: UuidSchema,
    claimId: UuidSchema,
    reason: z.string().trim().min(1).max(1_000).nullable().optional(),
    previousSuggestionMoveId: UuidSchema.nullable().optional(),
  })
  .strict();

const IssueChallengeInputSchema = z
  .object({
    brainId: UuidSchema,
    sessionId: UuidSchema,
    candidateId: CandidateReferenceSchema,
  })
  .strict();

const RespondToChallengeInputSchema = z.discriminatedUnion("response", [
  z
    .object({
      challengeId: UuidSchema,
      response: z.literal("defend"),
      reasoning: z.string().trim().min(1).max(2_000),
    })
    .strict(),
  z
    .object({
      challengeId: UuidSchema,
      response: z.literal("revise"),
      revisedText: z.string().trim().min(1).max(4_000),
      reasoning: z.string().trim().min(1).max(2_000).nullable().optional(),
    })
    .strict(),
  z
    .object({
      challengeId: UuidSchema,
      response: z.literal("absorb"),
      reasoning: z.string().trim().min(1).max(2_000).nullable().optional(),
    })
    .strict(),
]);

const GenerateChallengeBriefInputSchema = z
  .object({
    sessionId: UuidSchema,
  })
  .strict();

const FocusStateOutputSchema = z
  .object({
    sessionId: UuidSchema,
    mode: ThinkingModeSchema,
    focusedClaimId: UuidSchema.nullable(),
    focusedEdgeId: UuidSchema.nullable(),
    source: z.string(),
    suggestionMoveId: UuidSchema.nullable(),
    manualMoveId: UuidSchema.nullable(),
    paused: z.boolean(),
    reason: z.string().nullable(),
    updatedAt: z.string().nullable(),
  })
  .passthrough();

const ScoreBreakdownOutputSchema = z
  .object({
    leverage: z.number(),
    fragility: z.number(),
    stakes: z.number(),
    readiness: z.number(),
    momentum: z.number(),
    novelty: z.number(),
    shape: z.number(),
    penalties: z.number(),
  })
  .passthrough();

const ModeContractOutputSchema = z
  .object({
    validModes: z.array(MvpModeSchema),
    activeMode: MvpModeSchema,
  })
  .passthrough();

const CandidateOutputSchema = z
  .object({
    id: UuidSchema,
    candidateId: z.string(),
    fingerprint: z.string(),
    rank: z.number().int(),
    targetClaimId: UuidSchema,
    targetEdgeId: UuidSchema.nullable(),
    action: ToolActionSchema,
    mode: ThinkingModeSchema,
    mvpMode: MvpModeSchema,
    score: z.number(),
    reason: z.string(),
    reasonCodes: z.array(z.string()),
    exitCriteria: z
      .object({
        label: z.string(),
        acceptedMoveKinds: z.array(z.string()),
      })
      .passthrough(),
    scoreBreakdown: ScoreBreakdownOutputSchema,
    graphHash: z.string(),
    provenance: z
      .object({
        engine: z.string(),
        graphHash: z.string(),
        source: z.string(),
        ruleIds: z.array(z.string()),
        claimIds: z.array(UuidSchema),
        edgeIds: z.array(UuidSchema),
        moveIds: z.array(UuidSchema),
        artifactIds: z.array(UuidSchema),
      })
      .passthrough(),
    selected: z.boolean(),
    selectedAt: z.string().nullable(),
  })
  .passthrough();

const ThinkingModeMoveOutputSchema = z
  .object({
    id: UuidSchema,
    kind: z.string(),
    summary: z.string(),
    payload: JsonObjectSchema,
    createdAt: z.string(),
  })
  .passthrough();

const ThinkingModeStateOutputSchema = z
  .object({
    status: z.enum(["ready", "paused", "empty"]),
    brainId: UuidSchema,
    sessionId: UuidSchema,
    focusState: FocusStateOutputSchema,
    modeContract: ModeContractOutputSchema,
    candidates: z.array(CandidateOutputSchema),
    selectedCandidate: CandidateOutputSchema.nullable(),
  })
  .passthrough();

const TickAutopilotOutputSchema = ThinkingModeStateOutputSchema.extend({
  graphHash: z.string().nullable(),
  persistedMoveIds: z.array(UuidSchema),
  move: ThinkingModeMoveOutputSchema.nullable(),
});

const StartNextMoveOutputSchema = z
  .object({
    status: z.literal("started"),
    brainId: UuidSchema,
    sessionId: UuidSchema,
    focusState: FocusStateOutputSchema,
    modeContract: ModeContractOutputSchema,
    selectedCandidate: CandidateOutputSchema,
    move: ThinkingModeMoveOutputSchema,
  })
  .passthrough();

const SelectManualNodeOutputSchema = z
  .object({
    status: z.literal("paused"),
    brainId: UuidSchema,
    sessionId: UuidSchema,
    focusState: FocusStateOutputSchema,
    modeContract: ModeContractOutputSchema,
    focusClaim: z
      .object({
        id: UuidSchema,
        versionId: UuidSchema,
        kind: z.string(),
        status: z.string(),
        text: z.string(),
        confidence: z.number(),
      })
      .passthrough(),
    move: ThinkingModeMoveOutputSchema,
  })
  .passthrough();

const ChallengeRoundOutputSchema = z
  .object({
    id: UuidSchema,
    sessionId: UuidSchema,
    status: z.string(),
    response: ChallengeResponseSchema.nullable(),
    targetClaimId: UuidSchema,
    targetClaimVersionId: UuidSchema,
    critiqueClaimId: UuidSchema,
    critiqueClaimVersionId: UuidSchema,
    challengeEdgeId: UuidSchema,
    brainRunId: UuidSchema,
    challengeMoveId: UuidSchema,
    responseMoveId: UuidSchema.nullable(),
    focusCompletedMoveId: UuidSchema.nullable(),
    failureType: z.string(),
    strength: ChallengeStrengthSchema,
    critique: z.string(),
    whyThis: z.string(),
    whatWouldResolveIt: z.string(),
    createdAt: z.string(),
    respondedAt: z.string().nullable(),
    updatedAt: z.string(),
  })
  .passthrough();

const ChallengeClaimOutputSchema = z
  .object({
    id: UuidSchema,
    versionId: UuidSchema,
    kind: z.string(),
    status: z.string(),
    text: z.string(),
    confidence: z.number(),
  })
  .passthrough();

const ChallengeEdgeOutputSchema = z
  .object({
    id: UuidSchema,
    fromClaimId: UuidSchema,
    toClaimId: UuidSchema,
    kind: z.enum(["challenges", "contradicts"]),
    status: z.string(),
    label: z.string().nullable(),
  })
  .passthrough();

const ChallengeMoveOutputSchema = z
  .object({
    id: UuidSchema,
    kind: z.string(),
    summary: z.string(),
    payload: JsonObjectSchema,
    createdAt: z.string(),
  })
  .passthrough();

const ChallengeDerivedEffectOutputSchema = z
  .object({
    id: UuidSchema,
    kind: z.string(),
    status: z.string(),
    version: z.number(),
    title: z.string(),
    summary: z.string(),
    payload: z.unknown(),
    createdAt: z.string(),
  })
  .passthrough();

const IssueChallengeOutputSchema = z
  .object({
    status: z.literal("issued"),
    brainId: UuidSchema,
    sessionId: UuidSchema,
    challengeRound: ChallengeRoundOutputSchema,
    targetClaim: ChallengeClaimOutputSchema,
    critiqueClaim: ChallengeClaimOutputSchema,
    challengeEdge: ChallengeEdgeOutputSchema,
    critique: z.string(),
    failureType: z.string(),
    strength: ChallengeStrengthSchema,
    whyThis: z.string(),
    whatWouldResolveIt: z.string(),
    suggestedNextMove: z.string(),
    move: ChallengeMoveOutputSchema,
    brainRun: z
      .object({
        id: UuidSchema,
        status: z.literal("succeeded"),
      })
      .passthrough(),
  })
  .passthrough();

const RespondToChallengeOutputSchema = z
  .object({
    status: z.literal("responded"),
    challengeRound: ChallengeRoundOutputSchema,
    response: ChallengeResponseSchema,
    targetClaim: ChallengeClaimOutputSchema,
    critiqueClaimId: UuidSchema,
    challengeEdge: ChallengeEdgeOutputSchema,
    move: ChallengeMoveOutputSchema,
    focusCompletedMove: ChallengeMoveOutputSchema,
    derivedEffects: z.array(ChallengeDerivedEffectOutputSchema),
    receipt: z
      .object({
        response: ChallengeResponseSchema,
        moveKind: z.string(),
        targetClaimId: UuidSchema,
        challengeEdgeId: UuidSchema,
        previousClaimVersionId: UuidSchema.nullable(),
        currentClaimVersionId: UuidSchema,
        claimTextChanged: z.boolean(),
        unresolvedRisk: z.boolean(),
      })
      .passthrough(),
    nextMove: z
      .object({
        status: z.literal("client_tick_required"),
        requiredCommand: z.literal("tick_autopilot"),
        sessionId: UuidSchema,
        method: z.literal("POST"),
        endpoint: z.string(),
        body: z
          .object({
            resume: z.literal(true),
          })
          .passthrough(),
        reason: z.string(),
        expectedMoveKind: z.literal("next_move_recomputed"),
      })
      .passthrough(),
  })
  .passthrough();

const ChallengeBriefPayloadOutputSchema = z
  .object({
    kind: z.literal("challenge_brief"),
    title: z.literal("Challenge Brief"),
    sessionId: UuidSchema,
    sections: JsonObjectSchema,
    refs: z
      .object({
        sourceIds: z.array(UuidSchema),
        claimIds: z.array(UuidSchema),
        claimVersionIds: z.array(UuidSchema),
        edgeIds: z.array(UuidSchema),
        moveIds: z.array(UuidSchema),
        artifactIds: z.array(UuidSchema),
      })
      .passthrough(),
    inputs: JsonObjectSchema,
    generatedFrom: z
      .object({
        claimCount: z.number().int(),
        currentClaimVersionCount: z.number().int(),
        moveCount: z.number().int(),
        challengeCount: z.number().int(),
      })
      .passthrough(),
    generatedBy: z
      .object({
        brainRunId: UuidSchema,
        compiler: z.literal("challenge-brief-v0"),
      })
      .passthrough(),
  })
  .passthrough();

const ChallengeBriefOutputSchema = z
  .object({
    status: z.literal("created"),
    sessionId: UuidSchema,
    artifact: z
      .object({
        id: UuidSchema,
        kind: z.literal("challenge_brief"),
        title: z.string(),
        summary: z.string(),
        payload: ChallengeBriefPayloadOutputSchema,
        createdAt: z.string(),
      })
      .passthrough(),
    move: z
      .object({
        id: UuidSchema,
        kind: z.literal("artifact_created"),
        summary: z.string(),
        claimIds: z.array(UuidSchema),
        edgeIds: z.array(UuidSchema),
        artifactIds: z.array(UuidSchema),
      })
      .passthrough(),
    brainRun: z
      .object({
        id: UuidSchema,
        status: z.literal("succeeded"),
      })
      .passthrough(),
    brief: ChallengeBriefPayloadOutputSchema,
  })
  .passthrough();

export function createPennyInternalToolRegistry(services: PennyInternalToolServices): PennyInternalToolRegistry {
  const tools: PennyInternalTool[] = [
    createTool({
      name: "penny.get_autopilot_state",
      description: "Read the persisted Thinking Mode autopilot state for a brain/session without mutating state.",
      inputSchema: GetAutopilotStateInputSchema,
      outputSchema: ThinkingModeStateOutputSchema,
      handler: ({ brainId, sessionId }) => services.thinkingModeService.getState(brainId, sessionId),
    }),
    createTool({
      name: "penny.tick_autopilot",
      description: "Recompute and persist Thinking Mode next-move candidates for a brain/session.",
      inputSchema: TickAutopilotInputSchema,
      outputSchema: TickAutopilotOutputSchema,
      handler: (input) => services.thinkingModeService.tick(thinkingModeTickInput(input)),
    }),
    createTool({
      name: "penny.start_next_move",
      description: "Start a selected next-move candidate and record the autopilot_focus_started Move.",
      inputSchema: StartNextMoveInputSchema,
      outputSchema: StartNextMoveOutputSchema,
      handler: (input) => services.thinkingModeService.startCandidate(input),
    }),
    createTool({
      name: "penny.select_manual_node",
      description: "Select a graph claim manually, pause autopilot, and record the manual_node_selected Move.",
      inputSchema: SelectManualNodeInputSchema,
      outputSchema: SelectManualNodeOutputSchema,
      handler: (input) => services.thinkingModeService.manualFocus(manualFocusInput(input)),
    }),
    createTool({
      name: "penny.issue_challenge",
      description: "Issue the deterministic V0 challenge for a selected next-move candidate.",
      inputSchema: IssueChallengeInputSchema,
      outputSchema: IssueChallengeOutputSchema,
      handler: (input) => services.challengeRoundService.issueChallengeFromCandidate(input),
    }),
    createTool({
      name: "penny.respond_to_challenge",
      description: "Respond to a challenge with Defend, Revise, or Absorb using the existing challenge service.",
      inputSchema: RespondToChallengeInputSchema,
      outputSchema: RespondToChallengeOutputSchema,
      handler: (input) => services.challengeRoundService.respondToChallenge(challengeResponseInput(input)),
    }),
    createTool({
      name: "penny.generate_challenge_brief",
      description: "Compile and persist a Challenge Brief artifact from persisted session state.",
      inputSchema: GenerateChallengeBriefInputSchema,
      outputSchema: ChallengeBriefOutputSchema,
      handler: ({ sessionId }) => services.challengeBriefService.generateChallengeBrief(sessionId),
    }),
  ];

  return new Map(tools.map((tool) => [tool.name, tool]));
}

export async function runPennyInternalTool(
  registry: PennyInternalToolRegistry,
  name: string,
  input: unknown,
): Promise<unknown> {
  const tool = registry.get(name as PennyInternalToolName);

  if (!tool) {
    throw new PennyInternalToolNotFoundError(name);
  }

  return tool.handler(input);
}

function createTool<Input>(definition: {
  name: PennyInternalToolName;
  description: string;
  inputSchema: z.ZodType<Input>;
  outputSchema: z.ZodType;
  handler(input: Input): Promise<unknown>;
}): PennyInternalTool {
  return {
    name: definition.name,
    description: definition.description,
    inputSchema: definition.inputSchema,
    outputSchema: definition.outputSchema,
    async handler(input: unknown): Promise<unknown> {
      const parsedInput = definition.inputSchema.parse(input);
      const output = await definition.handler(parsedInput);

      return definition.outputSchema.parse(output);
    },
  };
}

function thinkingModeTickInput(input: z.infer<typeof TickAutopilotInputSchema>): ThinkingModeTickInput {
  const serviceInput: ThinkingModeTickInput = {
    brainId: input.brainId,
    sessionId: input.sessionId,
  };

  if (input.resume !== undefined) {
    serviceInput.resume = input.resume;
  }

  if (input.limit !== undefined) {
    serviceInput.limit = input.limit;
  }

  return serviceInput;
}

function manualFocusInput(input: z.infer<typeof SelectManualNodeInputSchema>): ManualFocusInput {
  const serviceInput: ManualFocusInput = {
    brainId: input.brainId,
    sessionId: input.sessionId,
    claimId: input.claimId,
  };

  if (input.reason !== undefined) {
    serviceInput.reason = input.reason;
  }

  if (input.previousSuggestionMoveId !== undefined) {
    serviceInput.previousSuggestionMoveId = input.previousSuggestionMoveId;
  }

  return serviceInput;
}

function challengeResponseInput(input: z.infer<typeof RespondToChallengeInputSchema>): RespondToChallengeInput {
  switch (input.response) {
    case "defend":
      return {
        challengeId: input.challengeId,
        response: "defend",
        reasoning: input.reasoning,
      };
    case "revise":
      return {
        challengeId: input.challengeId,
        response: "revise",
        revisedText: input.revisedText,
        reasoning: input.reasoning ?? null,
      };
    case "absorb":
      return {
        challengeId: input.challengeId,
        response: "absorb",
        reasoning: input.reasoning ?? null,
      };
  }
}
