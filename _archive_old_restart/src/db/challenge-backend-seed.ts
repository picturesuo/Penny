import { inArray } from "drizzle-orm";
import { createDrizzleDb } from "@/db/drizzle";
import {
  challengeCritiqueJobAttempts,
  challengeCritiques,
  challengeRounds,
  claims,
  maps,
  movesEvents,
  profiles,
  spheres,
  workspaceContexts,
} from "@/db/schema";

export type ChallengeBackendSeedTarget = "local" | "staging";

export type SeedChallengeBackendOptions = {
  dryRun?: boolean;
  target: ChallengeBackendSeedTarget;
};

type SeedProfile = typeof profiles.$inferInsert;
type SeedSphere = typeof spheres.$inferInsert;
type SeedMap = typeof maps.$inferInsert;
type SeedClaim = typeof claims.$inferInsert;
type SeedWorkspaceContext = typeof workspaceContexts.$inferInsert;
type SeedChallengeRound = typeof challengeRounds.$inferInsert;
type SeedChallengeCritique = typeof challengeCritiques.$inferInsert;
type SeedChallengeCritiqueJobAttempt = typeof challengeCritiqueJobAttempts.$inferInsert;
type SeedMoveEvent = typeof movesEvents.$inferInsert;

type SeedBundle = {
  claims: SeedClaim[];
  critiques: SeedChallengeCritique[];
  events: SeedMoveEvent[];
  jobAttempts: SeedChallengeCritiqueJobAttempt[];
  maps: SeedMap[];
  profiles: SeedProfile[];
  rounds: SeedChallengeRound[];
  spheres: SeedSphere[];
  workspaceContexts: SeedWorkspaceContext[];
};

export type ChallengeBackendSeedSummary = {
  aiRuns: {
    generated: number;
    requestedOnly: number;
  };
  claims: number;
  critiques: number;
  dryRun: boolean;
  events: number;
  exampleData: {
    claims: Array<{
      confidence: number;
      id: string;
      mapTitle: string;
      text: string;
    }>;
    critiqueStatuses: Array<{
      claimId: string;
      critiqueStatus: string | null;
      roundId: string;
      userGoal: string | null;
    }>;
    generatedAiRuns: Array<{
      model: string;
      promptVersion: string;
      provider: string;
      requestId: string | null;
      roundId: string;
    }>;
    users: Array<{
      displayName: string | null;
      email: string;
      id: string;
    }>;
  };
  jobAttemptsByStatus: Record<string, number>;
  maps: number;
  note: string;
  outputSurface: string;
  rounds: {
    closed: number;
    open: number;
    total: number;
  };
  target: ChallengeBackendSeedTarget;
  users: number;
};

const SEED_EMAIL_SUFFIX: Record<ChallengeBackendSeedTarget, string> = {
  local: "seed.local.penny",
  staging: "seed.staging.penny",
};

const FOUNDER_USER_ID = "71000000-0000-4000-8000-000000000001";
const OPERATOR_USER_ID = "71000000-0000-4000-8000-000000000002";

const FOUNDER_SPHERE_ID = "72000000-0000-4000-8000-000000000001";
const OPERATOR_SPHERE_ID = "72000000-0000-4000-8000-000000000002";

const GTM_MAP_ID = "73000000-0000-4000-8000-000000000001";
const HABIT_MAP_ID = "73000000-0000-4000-8000-000000000002";

const DISTRIBUTION_CLAIM_ID = "74000000-0000-4000-8000-000000000001";
const SWITCHING_COSTS_CLAIM_ID = "74000000-0000-4000-8000-000000000002";
const PARTNERSHIP_CLAIM_ID = "74000000-0000-4000-8000-000000000003";
const JOURNALING_CLAIM_ID = "74000000-0000-4000-8000-000000000004";
const NOVELTY_DECAY_CLAIM_ID = "74000000-0000-4000-8000-000000000005";

const GTM_CONTEXT_ID = "75000000-0000-4000-8000-000000000001";
const HABIT_CONTEXT_ID = "75000000-0000-4000-8000-000000000002";

const GTM_ROUND_ONE_ID = "76000000-0000-4000-8000-000000000001";
const GTM_ROUND_TWO_ID = "76000000-0000-4000-8000-000000000002";
const HABIT_ROUND_ONE_ID = "76000000-0000-4000-8000-000000000003";

const GTM_CRITIQUE_ONE_ID = "77000000-0000-4000-8000-000000000001";
const HABIT_CRITIQUE_ONE_ID = "77000000-0000-4000-8000-000000000002";

const JOB_ATTEMPT_GTM_ONE_ID = "78000000-0000-4000-8000-000000000001";
const JOB_ATTEMPT_GTM_TWO_FAILED_ID = "78000000-0000-4000-8000-000000000002";
const JOB_ATTEMPT_GTM_TWO_RETRY_ID = "78000000-0000-4000-8000-000000000003";
const JOB_ATTEMPT_HABIT_VALIDATION_ID = "78000000-0000-4000-8000-000000000004";
const JOB_ATTEMPT_HABIT_SUCCESS_ID = "78000000-0000-4000-8000-000000000005";

const REQUEST_ID_GTM_ONE = "seed-gtm-r1-request";
const REQUEST_ID_GTM_TWO_FAILED = "seed-gtm-r2-request-1";
const REQUEST_ID_GTM_TWO_RETRY = "seed-gtm-r2-request-2";
const REQUEST_ID_HABIT_ONE_FAILED = "seed-habit-r1-request-1";
const REQUEST_ID_HABIT_ONE_SUCCESS = "seed-habit-r1-request-2";

const ISO = {
  profileCreated: "2026-04-10T09:00:00.000Z",
  gtmMapCreated: "2026-04-12T10:15:00.000Z",
  habitMapCreated: "2026-04-13T11:30:00.000Z",
  gtmRoundOneStarted: "2026-04-14T15:00:00.000Z",
  gtmRoundOneClosed: "2026-04-14T15:24:00.000Z",
  gtmRoundTwoStarted: "2026-04-18T14:05:00.000Z",
  habitRoundOneStarted: "2026-04-19T16:10:00.000Z",
  gtmCritiqueRequested: "2026-04-14T15:02:00.000Z",
  gtmCritiqueGenerated: "2026-04-14T15:05:30.000Z",
  gtmRetryRequested: "2026-04-18T14:07:00.000Z",
  gtmRetryFailed: "2026-04-18T14:07:42.000Z",
  gtmRetryQueued: "2026-04-18T14:10:00.000Z",
  habitValidationRequested: "2026-04-19T16:11:00.000Z",
  habitValidationFailed: "2026-04-19T16:11:42.000Z",
  habitRetryRequested: "2026-04-19T16:14:00.000Z",
  habitCritiqueGenerated: "2026-04-19T16:16:40.000Z",
};

function assertNonProductionSeedTarget(target: string): asserts target is ChallengeBackendSeedTarget {
  if (target !== "local" && target !== "staging") {
    throw new Error(`Invalid seed target "${target}". Use "local" or "staging".`);
  }

  const envSignals = [
    process.env.PENNY_ENVIRONMENT,
    process.env.APP_ENV,
    process.env.SENTRY_ENVIRONMENT,
    process.env.VERCEL_ENV,
  ]
    .map((value) => value?.trim().toLowerCase())
    .filter(Boolean);

  if (envSignals.includes("production")) {
    throw new Error("Challenge backend seed refused to run because the environment is marked as production.");
  }
}

function toDate(value: string) {
  return new Date(value);
}

function buildSeedBundle(target: ChallengeBackendSeedTarget): SeedBundle {
  const emailSuffix = SEED_EMAIL_SUFFIX[target];

  const profilesSeed: SeedProfile[] = [
    {
      id: FOUNDER_USER_ID,
      email: `maya.chen@${emailSuffix}`,
      displayName: "Maya Chen",
      avatarUrl: null,
      createdAt: toDate(ISO.profileCreated),
      updatedAt: toDate(ISO.profileCreated),
    },
    {
      id: OPERATOR_USER_ID,
      email: `alex.rivera@${emailSuffix}`,
      displayName: "Alex Rivera",
      avatarUrl: null,
      createdAt: toDate(ISO.profileCreated),
      updatedAt: toDate(ISO.profileCreated),
    },
  ];

  const spheresSeed: SeedSphere[] = [
    {
      id: FOUNDER_SPHERE_ID,
      userId: FOUNDER_USER_ID,
      slug: "market-thesis",
      title: "Market Thesis",
      description: "Live market structure assumptions for the current go-to-market push.",
      colorToken: "copper",
      isArchived: false,
      createdAt: toDate(ISO.gtmMapCreated),
      updatedAt: toDate(ISO.gtmMapCreated),
    },
    {
      id: OPERATOR_SPHERE_ID,
      userId: OPERATOR_USER_ID,
      slug: "consumer-habits",
      title: "Consumer Habits",
      description: "Retention and habit-formation assumptions for the journaling product.",
      colorToken: "patina",
      isArchived: false,
      createdAt: toDate(ISO.habitMapCreated),
      updatedAt: toDate(ISO.habitMapCreated),
    },
  ];

  const mapsSeed: SeedMap[] = [
    {
      id: GTM_MAP_ID,
      userId: FOUNDER_USER_ID,
      sphereId: FOUNDER_SPHERE_ID,
      title: "Go-to-market thesis",
      rawThought: "Pressure-test whether distribution leverage can outrun pure model quality in this segment.",
      status: "active",
      claimCount: 3,
      metadata: {
        seededBy: "challenge-backend-seed",
        target,
        persona: "founder",
      },
      createdAt: toDate(ISO.gtmMapCreated),
      updatedAt: toDate(ISO.gtmRoundTwoStarted),
    },
    {
      id: HABIT_MAP_ID,
      userId: OPERATOR_USER_ID,
      sphereId: OPERATOR_SPHERE_ID,
      title: "Consumer habit thesis",
      rawThought: "Stress-test whether solo AI journaling can become a durable daily habit before social features exist.",
      status: "active",
      claimCount: 2,
      metadata: {
        seededBy: "challenge-backend-seed",
        target,
        persona: "operator",
      },
      createdAt: toDate(ISO.habitMapCreated),
      updatedAt: toDate(ISO.habitCritiqueGenerated),
    },
  ];

  const claimsSeed: SeedClaim[] = [
    {
      id: DISTRIBUTION_CLAIM_ID,
      userId: FOUNDER_USER_ID,
      mapId: GTM_MAP_ID,
      parentClaimId: null,
      text: "Distribution advantage matters more than model quality in this market.",
      note: "This is the load-bearing market claim for the next quarter.",
      kind: "claim",
      structureKind: "market_thesis",
      provenance: "user",
      status: "open",
      confidence: 61,
      resolutionDate: null,
      lastChallengedAt: toDate(ISO.gtmRoundOneClosed),
      metadata: {
        stakes: "high",
        seededBy: "challenge-backend-seed",
      },
      createdAt: toDate(ISO.gtmMapCreated),
      updatedAt: toDate(ISO.gtmRoundTwoStarted),
    },
    {
      id: SWITCHING_COSTS_CLAIM_ID,
      userId: FOUNDER_USER_ID,
      mapId: GTM_MAP_ID,
      parentClaimId: DISTRIBUTION_CLAIM_ID,
      text: "Switching costs become real once workflow integration replaces pilot usage.",
      note: "Used as supporting context for enterprise motion.",
      kind: "assumption",
      structureKind: "dependency",
      provenance: "user",
      status: "open",
      confidence: 68,
      resolutionDate: null,
      lastChallengedAt: null,
      metadata: {
        seededBy: "challenge-backend-seed",
      },
      createdAt: toDate(ISO.gtmMapCreated),
      updatedAt: toDate(ISO.gtmMapCreated),
    },
    {
      id: PARTNERSHIP_CLAIM_ID,
      userId: FOUNDER_USER_ID,
      mapId: GTM_MAP_ID,
      parentClaimId: DISTRIBUTION_CLAIM_ID,
      text: "Channel partnerships can move us faster than bottoms-up adoption in regulated accounts.",
      note: "Alternative path if direct sales cycle stays slow.",
      kind: "strategy",
      structureKind: "distribution",
      provenance: "user",
      status: "open",
      confidence: 57,
      resolutionDate: null,
      lastChallengedAt: null,
      metadata: {
        seededBy: "challenge-backend-seed",
      },
      createdAt: toDate(ISO.gtmMapCreated),
      updatedAt: toDate(ISO.gtmMapCreated),
    },
    {
      id: JOURNALING_CLAIM_ID,
      userId: OPERATOR_USER_ID,
      mapId: HABIT_MAP_ID,
      parentClaimId: null,
      text: "Daily AI journaling can become a durable consumer habit without a social graph.",
      note: "Core retention hypothesis for the solo journaling product.",
      kind: "claim",
      structureKind: "retention",
      provenance: "user",
      status: "open",
      confidence: 63,
      resolutionDate: null,
      lastChallengedAt: null,
      metadata: {
        stakes: "medium",
        seededBy: "challenge-backend-seed",
      },
      createdAt: toDate(ISO.habitMapCreated),
      updatedAt: toDate(ISO.habitCritiqueGenerated),
    },
    {
      id: NOVELTY_DECAY_CLAIM_ID,
      userId: OPERATOR_USER_ID,
      mapId: HABIT_MAP_ID,
      parentClaimId: JOURNALING_CLAIM_ID,
      text: "Novelty decay is the main retention risk after the first week.",
      note: "Used to frame the strongest consumer habit critique.",
      kind: "risk",
      structureKind: "retention_risk",
      provenance: "user",
      status: "open",
      confidence: 69,
      resolutionDate: null,
      lastChallengedAt: null,
      metadata: {
        seededBy: "challenge-backend-seed",
      },
      createdAt: toDate(ISO.habitMapCreated),
      updatedAt: toDate(ISO.habitMapCreated),
    },
  ];

  const contextsSeed: SeedWorkspaceContext[] = [
    {
      id: GTM_CONTEXT_ID,
      userId: FOUNDER_USER_ID,
      sphereId: FOUNDER_SPHERE_ID,
      mapId: GTM_MAP_ID,
      selectedClaimId: DISTRIBUTION_CLAIM_ID,
      selectedConceptId: null,
      contextKey: `seed:${target}:maya:gtm`,
      mode: "challenge",
      breadcrumb: ["Work", "Market Thesis", "Distribution Claim"],
      contextSnapshot: {
        seededBy: "challenge-backend-seed",
        target,
      },
      lastAccessedAt: toDate(ISO.gtmRoundTwoStarted),
      createdAt: toDate(ISO.gtmMapCreated),
      updatedAt: toDate(ISO.gtmRoundTwoStarted),
    },
    {
      id: HABIT_CONTEXT_ID,
      userId: OPERATOR_USER_ID,
      sphereId: OPERATOR_SPHERE_ID,
      mapId: HABIT_MAP_ID,
      selectedClaimId: JOURNALING_CLAIM_ID,
      selectedConceptId: null,
      contextKey: `seed:${target}:alex:habit`,
      mode: "challenge",
      breadcrumb: ["Learn", "Consumer Habits", "Journaling Claim"],
      contextSnapshot: {
        seededBy: "challenge-backend-seed",
        target,
      },
      lastAccessedAt: toDate(ISO.habitCritiqueGenerated),
      createdAt: toDate(ISO.habitMapCreated),
      updatedAt: toDate(ISO.habitCritiqueGenerated),
    },
  ];

  const roundsSeed: SeedChallengeRound[] = [
    {
      id: GTM_ROUND_ONE_ID,
      userId: FOUNDER_USER_ID,
      mapId: GTM_MAP_ID,
      claimId: DISTRIBUTION_CLAIM_ID,
      workspaceContextId: GTM_CONTEXT_ID,
      priorRoundId: null,
      roundNumber: 1,
      critiqueGenerated:
        "Distribution only dominates if model quality has already crossed the threshold buyers care about. A visible leap in accuracy or reliability can reopen evaluation and weaken incumbent channel leverage.",
      critiqueFailureTypes: ["quality reset", "switching costs overstated", "buyer re-evaluation"],
      critiqueLens: "direct",
      critiqueStrength: "strong",
      critiqueMode: "direct",
      voiceLabel: "Operator skeptic",
      responsePath: "defend",
      userResponse:
        "I still think distribution matters more, but I need stronger proof that the buyer threshold has already been crossed and won't reset after a quality leap.",
      confidenceAtRoundStart: 72,
      confidenceAtRoundEnd: 61,
      confidenceDelta: -11,
      concessions: ["A quality jump could reset buyer evaluation."],
      defenses: ["Workflow lock-in still matters once integration is complete."],
      dismissals: [],
      engagementScore: 84,
      followUpPrompt: "What concrete model gap would make buyers reopen evaluation?",
      uncertainty: {
        critiqueStatus: "ready",
        critiqueRequestId: REQUEST_ID_GTM_ONE,
        critiqueRunId: "seed-ai-run-gtm-r1",
        critiqueRequestedAt: ISO.gtmCritiqueRequested,
        critiqueGeneratedAt: ISO.gtmCritiqueGenerated,
        critiqueFailedAt: null,
        critiqueError: null,
        userGoal: "Decide whether to prioritize partnerships over model R&D in the next quarter.",
        suggestedConfidenceDelta: -11,
        uncertaintyNote:
          "The open risk is whether model quality has actually crossed the buyer sufficiency threshold or is still capable of resetting vendor choice.",
      },
      startedAt: toDate(ISO.gtmRoundOneStarted),
      closedAt: toDate(ISO.gtmRoundOneClosed),
      createdAt: toDate(ISO.gtmRoundOneStarted),
      updatedAt: toDate(ISO.gtmRoundOneClosed),
    },
    {
      id: GTM_ROUND_TWO_ID,
      userId: FOUNDER_USER_ID,
      mapId: GTM_MAP_ID,
      claimId: DISTRIBUTION_CLAIM_ID,
      workspaceContextId: GTM_CONTEXT_ID,
      priorRoundId: GTM_ROUND_ONE_ID,
      roundNumber: 2,
      critiqueGenerated: "Critique queued.",
      critiqueFailureTypes: [],
      critiqueLens: "red_team",
      critiqueStrength: "moderate",
      critiqueMode: "red_team",
      voiceLabel: "Distribution red team",
      responsePath: null,
      userResponse: null,
      confidenceAtRoundStart: 61,
      confidenceAtRoundEnd: null,
      confidenceDelta: null,
      concessions: [],
      defenses: [],
      dismissals: [],
      engagementScore: null,
      followUpPrompt: null,
      uncertainty: {
        critiqueStatus: "pending",
        critiqueRequestId: REQUEST_ID_GTM_TWO_RETRY,
        critiqueRunId: "seed-ai-run-gtm-r2",
        critiqueRequestedAt: ISO.gtmRetryRequested,
        critiqueGeneratedAt: null,
        critiqueFailedAt: null,
        critiqueError: null,
        userGoal: "Decide whether the second round should test channel fragility or buyer urgency.",
        suggestedConfidenceDelta: null,
        uncertaintyNote: null,
      },
      startedAt: toDate(ISO.gtmRoundTwoStarted),
      closedAt: null,
      createdAt: toDate(ISO.gtmRoundTwoStarted),
      updatedAt: toDate(ISO.gtmRetryQueued),
    },
    {
      id: HABIT_ROUND_ONE_ID,
      userId: OPERATOR_USER_ID,
      mapId: HABIT_MAP_ID,
      claimId: JOURNALING_CLAIM_ID,
      workspaceContextId: HABIT_CONTEXT_ID,
      priorRoundId: null,
      roundNumber: 1,
      critiqueGenerated:
        "Immediate payoff is not the same as habit durability. Many solo wellness products create a strong first-week benefit and still decay once reminder novelty fades.",
      critiqueFailureTypes: ["novelty decay", "reminder dependence", "identity reinforcement gap"],
      critiqueLens: "socratic",
      critiqueStrength: "strong",
      critiqueMode: "socratic",
      voiceLabel: "Retention coach",
      responsePath: null,
      userResponse: null,
      confidenceAtRoundStart: 63,
      confidenceAtRoundEnd: null,
      confidenceDelta: null,
      concessions: [],
      defenses: [],
      dismissals: [],
      engagementScore: null,
      followUpPrompt: "What brings the user back after the reminder period ends?",
      uncertainty: {
        critiqueStatus: "ready",
        critiqueRequestId: REQUEST_ID_HABIT_ONE_SUCCESS,
        critiqueRunId: "seed-ai-run-habit-r1",
        critiqueRequestedAt: ISO.habitRetryRequested,
        critiqueGeneratedAt: ISO.habitCritiqueGenerated,
        critiqueFailedAt: null,
        critiqueError: null,
        userGoal: "Decide whether to invest in solo retention loops before building social features.",
        suggestedConfidenceDelta: -8,
        uncertaintyNote:
          "The unresolved question is whether the product has a self-sustaining returning mechanism or only a useful session-level benefit.",
      },
      startedAt: toDate(ISO.habitRoundOneStarted),
      closedAt: null,
      createdAt: toDate(ISO.habitRoundOneStarted),
      updatedAt: toDate(ISO.habitCritiqueGenerated),
    },
  ];

  const critiquesSeed: SeedChallengeCritique[] = [
    {
      id: GTM_CRITIQUE_ONE_ID,
      userId: FOUNDER_USER_ID,
      mapId: GTM_MAP_ID,
      claimId: DISTRIBUTION_CLAIM_ID,
      roundId: GTM_ROUND_ONE_ID,
      workspaceContextId: GTM_CONTEXT_ID,
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      promptVersion: "challenge-critique.v1",
      headline:
        "The claim leans on current distribution friction but underweights the risk that better model performance can reset buyer priorities.",
      critiqueText:
        "Distribution only dominates if model quality has already crossed the threshold buyers care about. If the market is still sensitive to output quality, a visible leap in accuracy or reliability can reopen evaluation and weaken incumbent channel leverage.",
      critiqueLens: "direct",
      failureTypes: ["quality reset", "switching costs overstated", "buyer re-evaluation"],
      dependencyRisks: [
        "Model quality is already sufficient for the main buyer workflow.",
        "Buyers will not re-open vendor evaluation after a visible quality leap.",
      ],
      whyNow:
        "The next quarter involves channel prioritization, so the cost of overstating distribution defensibility is immediate.",
      validatedOutput: {
        conciseCritiqueSummary:
          "The claim leans on current distribution friction but underweights the risk that better model performance can reset buyer priorities.",
        strongestCounterargument:
          "Distribution only dominates if model quality has already crossed the threshold buyers care about. If the market is still sensitive to output quality, a visible leap in accuracy or reliability can reopen evaluation and weaken incumbent channel leverage.",
        assumptions: [
          "Model quality is already good enough for the main buyer workflow.",
          "Distribution access is more durable than the current technical lead.",
        ],
        likelyFailureModes: ["quality reset", "switching costs overstated", "buyer re-evaluation"],
        followUpQuestions: [
          "What concrete model gap would make buyers reopen evaluation?",
          "Which workflow step actually creates switching costs?",
        ],
        suggestedConfidenceDelta: -11,
        uncertaintyNote:
          "The open risk is whether model quality has already crossed the buyer sufficiency threshold or is still capable of resetting vendor choice.",
        _aiRun: {
          provider: "anthropic",
          model: "claude-sonnet-4-20250514",
          promptVersion: "challenge-critique.v1",
          release: "seed.challenge-backend.v1",
          environment: target,
          traceId: "seed-trace-gtm-r1",
          observationId: "seed-observation-gtm-r1",
        },
      },
      createdAt: toDate(ISO.gtmCritiqueGenerated),
      updatedAt: toDate(ISO.gtmCritiqueGenerated),
    },
    {
      id: HABIT_CRITIQUE_ONE_ID,
      userId: OPERATOR_USER_ID,
      mapId: HABIT_MAP_ID,
      claimId: JOURNALING_CLAIM_ID,
      roundId: HABIT_ROUND_ONE_ID,
      workspaceContextId: HABIT_CONTEXT_ID,
      provider: "xai",
      model: "grok-4.20",
      promptVersion: "challenge-critique.v1",
      headline:
        "The defense strengthens the short-term payoff story, but it still does not explain why the habit survives once novelty and reminders weaken.",
      critiqueText:
        "Immediate payoff is not the same as durable habit formation. Many solo wellness products produce a strong first-week benefit and still decay because the behavior lacks identity reinforcement, accountability, or external triggers.",
      critiqueLens: "socratic",
      failureTypes: ["novelty decay", "reminder dependence", "identity reinforcement gap"],
      dependencyRisks: [
        "Early repeat usage is a valid proxy for month-two habit durability.",
        "Emotional payoff alone can replace identity or social reinforcement.",
      ],
      whyNow:
        "The team is deciding whether solo retention loops are sufficient before social features are built, so habit durability must be separated from first-week engagement.",
      validatedOutput: {
        conciseCritiqueSummary:
          "The defense strengthens the short-term payoff story, but it still does not explain why the habit survives once novelty and reminders weaken.",
        strongestCounterargument:
          "Immediate payoff is not the same as durable habit formation. Many solo wellness products produce a strong first-week benefit and still decay because the behavior lacks identity reinforcement, accountability, or external triggers.",
        assumptions: [
          "Early repeat usage is a valid proxy for long-term habit durability.",
          "Reminder-driven engagement will convert into self-propelled behavior.",
        ],
        likelyFailureModes: ["novelty decay", "reminder dependence", "identity reinforcement gap"],
        followUpQuestions: [
          "What mechanism brings the user back after reminder novelty fades?",
          "What evidence separates first-week repeat usage from month-two durability?",
        ],
        suggestedConfidenceDelta: -8,
        uncertaintyNote:
          "The unresolved question is whether the product creates a self-sustaining ritual or only a high-quality, reminder-dependent session.",
        _aiRun: {
          provider: "xai",
          model: "grok-4.20",
          promptVersion: "challenge-critique.v1",
          release: "seed.challenge-backend.v1",
          environment: target,
          traceId: "seed-trace-habit-r1",
          observationId: "seed-observation-habit-r1",
        },
      },
      createdAt: toDate(ISO.habitCritiqueGenerated),
      updatedAt: toDate(ISO.habitCritiqueGenerated),
    },
  ];

  const jobAttemptsSeed: SeedChallengeCritiqueJobAttempt[] = [
    {
      id: JOB_ATTEMPT_GTM_ONE_ID,
      userId: FOUNDER_USER_ID,
      mapId: GTM_MAP_ID,
      claimId: DISTRIBUTION_CLAIM_ID,
      roundId: GTM_ROUND_ONE_ID,
      idempotencyKey: REQUEST_ID_GTM_ONE,
      status: "succeeded",
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      promptVersion: "challenge-critique.v1",
      errorMessage: null,
      validationIssues: {},
      queuedAt: toDate(ISO.gtmCritiqueRequested),
      startedAt: toDate(ISO.gtmCritiqueRequested),
      finishedAt: toDate(ISO.gtmCritiqueGenerated),
      createdAt: toDate(ISO.gtmCritiqueRequested),
      updatedAt: toDate(ISO.gtmCritiqueGenerated),
    },
    {
      id: JOB_ATTEMPT_GTM_TWO_FAILED_ID,
      userId: FOUNDER_USER_ID,
      mapId: GTM_MAP_ID,
      claimId: DISTRIBUTION_CLAIM_ID,
      roundId: GTM_ROUND_TWO_ID,
      idempotencyKey: REQUEST_ID_GTM_TWO_FAILED,
      status: "failed",
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      promptVersion: "challenge-critique.v1",
      errorMessage: "Anthropic request failed with status 529: upstream overloaded.",
      validationIssues: {},
      queuedAt: toDate(ISO.gtmRetryRequested),
      startedAt: toDate(ISO.gtmRetryRequested),
      finishedAt: toDate(ISO.gtmRetryFailed),
      createdAt: toDate(ISO.gtmRetryRequested),
      updatedAt: toDate(ISO.gtmRetryFailed),
    },
    {
      id: JOB_ATTEMPT_GTM_TWO_RETRY_ID,
      userId: FOUNDER_USER_ID,
      mapId: GTM_MAP_ID,
      claimId: DISTRIBUTION_CLAIM_ID,
      roundId: GTM_ROUND_TWO_ID,
      idempotencyKey: REQUEST_ID_GTM_TWO_RETRY,
      status: "queued",
      provider: "xai",
      model: "grok-4.20",
      promptVersion: "challenge-critique.v1",
      errorMessage: null,
      validationIssues: {},
      queuedAt: toDate(ISO.gtmRetryQueued),
      startedAt: null,
      finishedAt: null,
      createdAt: toDate(ISO.gtmRetryQueued),
      updatedAt: toDate(ISO.gtmRetryQueued),
    },
    {
      id: JOB_ATTEMPT_HABIT_VALIDATION_ID,
      userId: OPERATOR_USER_ID,
      mapId: HABIT_MAP_ID,
      claimId: JOURNALING_CLAIM_ID,
      roundId: HABIT_ROUND_ONE_ID,
      idempotencyKey: REQUEST_ID_HABIT_ONE_FAILED,
      status: "validation_failed",
      provider: "xai",
      model: "grok-4.20",
      promptVersion: "challenge-critique.v1",
      errorMessage: "AI output failed schema validation.",
      validationIssues: {
        formErrors: [],
        fieldErrors: {
          likelyFailureModes: ["Expected at most 6 items."],
        },
      },
      queuedAt: toDate(ISO.habitValidationRequested),
      startedAt: toDate(ISO.habitValidationRequested),
      finishedAt: toDate(ISO.habitValidationFailed),
      createdAt: toDate(ISO.habitValidationRequested),
      updatedAt: toDate(ISO.habitValidationFailed),
    },
    {
      id: JOB_ATTEMPT_HABIT_SUCCESS_ID,
      userId: OPERATOR_USER_ID,
      mapId: HABIT_MAP_ID,
      claimId: JOURNALING_CLAIM_ID,
      roundId: HABIT_ROUND_ONE_ID,
      idempotencyKey: REQUEST_ID_HABIT_ONE_SUCCESS,
      status: "succeeded",
      provider: "xai",
      model: "grok-4.20",
      promptVersion: "challenge-critique.v1",
      errorMessage: null,
      validationIssues: {},
      queuedAt: toDate(ISO.habitRetryRequested),
      startedAt: toDate(ISO.habitRetryRequested),
      finishedAt: toDate(ISO.habitCritiqueGenerated),
      createdAt: toDate(ISO.habitRetryRequested),
      updatedAt: toDate(ISO.habitCritiqueGenerated),
    },
  ];

  const eventsSeed: SeedMoveEvent[] = [
    {
      id: "79000000-0000-4000-8000-000000000001",
      userId: FOUNDER_USER_ID,
      mapId: GTM_MAP_ID,
      claimId: null,
      conceptId: null,
      requestId: null,
      type: "map.created",
      payload: {
        title: "Go-to-market thesis",
        source: "challenge-backend-seed",
        target,
      },
      createdAt: toDate(ISO.gtmMapCreated),
    },
    {
      id: "79000000-0000-4000-8000-000000000002",
      userId: OPERATOR_USER_ID,
      mapId: HABIT_MAP_ID,
      claimId: null,
      conceptId: null,
      requestId: null,
      type: "map.created",
      payload: {
        title: "Consumer habit thesis",
        source: "challenge-backend-seed",
        target,
      },
      createdAt: toDate(ISO.habitMapCreated),
    },
    {
      id: "79000000-0000-4000-8000-000000000003",
      userId: FOUNDER_USER_ID,
      mapId: GTM_MAP_ID,
      claimId: DISTRIBUTION_CLAIM_ID,
      conceptId: null,
      requestId: null,
      type: "claim.created",
      payload: {
        claimId: DISTRIBUTION_CLAIM_ID,
        confidence: 72,
      },
      createdAt: toDate(ISO.gtmMapCreated),
    },
    {
      id: "79000000-0000-4000-8000-000000000004",
      userId: FOUNDER_USER_ID,
      mapId: GTM_MAP_ID,
      claimId: SWITCHING_COSTS_CLAIM_ID,
      conceptId: null,
      requestId: null,
      type: "claim.created",
      payload: {
        claimId: SWITCHING_COSTS_CLAIM_ID,
        confidence: 68,
      },
      createdAt: toDate(ISO.gtmMapCreated),
    },
    {
      id: "79000000-0000-4000-8000-000000000005",
      userId: FOUNDER_USER_ID,
      mapId: GTM_MAP_ID,
      claimId: PARTNERSHIP_CLAIM_ID,
      conceptId: null,
      requestId: null,
      type: "claim.created",
      payload: {
        claimId: PARTNERSHIP_CLAIM_ID,
        confidence: 57,
      },
      createdAt: toDate(ISO.gtmMapCreated),
    },
    {
      id: "79000000-0000-4000-8000-000000000006",
      userId: OPERATOR_USER_ID,
      mapId: HABIT_MAP_ID,
      claimId: JOURNALING_CLAIM_ID,
      conceptId: null,
      requestId: null,
      type: "claim.created",
      payload: {
        claimId: JOURNALING_CLAIM_ID,
        confidence: 63,
      },
      createdAt: toDate(ISO.habitMapCreated),
    },
    {
      id: "79000000-0000-4000-8000-000000000007",
      userId: OPERATOR_USER_ID,
      mapId: HABIT_MAP_ID,
      claimId: NOVELTY_DECAY_CLAIM_ID,
      conceptId: null,
      requestId: null,
      type: "claim.created",
      payload: {
        claimId: NOVELTY_DECAY_CLAIM_ID,
        confidence: 69,
      },
      createdAt: toDate(ISO.habitMapCreated),
    },
    {
      id: "79000000-0000-4000-8000-000000000008",
      userId: FOUNDER_USER_ID,
      mapId: GTM_MAP_ID,
      claimId: DISTRIBUTION_CLAIM_ID,
      conceptId: null,
      requestId: null,
      type: "workspace.selection.changed",
      payload: {
        workspaceContextId: GTM_CONTEXT_ID,
        mode: "challenge",
      },
      createdAt: toDate(ISO.gtmRoundTwoStarted),
    },
    {
      id: "79000000-0000-4000-8000-000000000009",
      userId: OPERATOR_USER_ID,
      mapId: HABIT_MAP_ID,
      claimId: JOURNALING_CLAIM_ID,
      conceptId: null,
      requestId: null,
      type: "workspace.selection.changed",
      payload: {
        workspaceContextId: HABIT_CONTEXT_ID,
        mode: "challenge",
      },
      createdAt: toDate(ISO.habitCritiqueGenerated),
    },
    {
      id: "79000000-0000-4000-8000-000000000010",
      userId: FOUNDER_USER_ID,
      mapId: GTM_MAP_ID,
      claimId: DISTRIBUTION_CLAIM_ID,
      conceptId: null,
      requestId: null,
      type: "challenge.round.started",
      payload: {
        roundId: GTM_ROUND_ONE_ID,
        roundNumber: 1,
        critiqueStrength: "strong",
        critiqueMode: "direct",
      },
      createdAt: toDate(ISO.gtmRoundOneStarted),
    },
    {
      id: "79000000-0000-4000-8000-000000000011",
      userId: FOUNDER_USER_ID,
      mapId: GTM_MAP_ID,
      claimId: DISTRIBUTION_CLAIM_ID,
      conceptId: null,
      requestId: REQUEST_ID_GTM_ONE,
      type: "challenge.critique.requested",
      payload: {
        roundId: GTM_ROUND_ONE_ID,
        critiqueMode: "direct",
      },
      createdAt: toDate(ISO.gtmCritiqueRequested),
    },
    {
      id: "79000000-0000-4000-8000-000000000012",
      userId: FOUNDER_USER_ID,
      mapId: GTM_MAP_ID,
      claimId: DISTRIBUTION_CLAIM_ID,
      conceptId: null,
      requestId: REQUEST_ID_GTM_ONE,
      type: "challenge.critique.generated",
      payload: {
        roundId: GTM_ROUND_ONE_ID,
        critiqueId: GTM_CRITIQUE_ONE_ID,
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        promptVersion: "challenge-critique.v1",
      },
      createdAt: toDate(ISO.gtmCritiqueGenerated),
    },
    {
      id: "79000000-0000-4000-8000-000000000013",
      userId: FOUNDER_USER_ID,
      mapId: GTM_MAP_ID,
      claimId: DISTRIBUTION_CLAIM_ID,
      conceptId: null,
      requestId: null,
      type: "claim.confidence.changed",
      payload: {
        previousConfidence: 72,
        nextConfidence: 61,
        source: "challenge.response.recorded",
        roundId: GTM_ROUND_ONE_ID,
      },
      createdAt: toDate(ISO.gtmRoundOneClosed),
    },
    {
      id: "79000000-0000-4000-8000-000000000014",
      userId: FOUNDER_USER_ID,
      mapId: GTM_MAP_ID,
      claimId: DISTRIBUTION_CLAIM_ID,
      conceptId: null,
      requestId: null,
      type: "challenge.response.recorded",
      payload: {
        roundId: GTM_ROUND_ONE_ID,
        responsePath: "defend",
        confidenceAtRoundEnd: 61,
      },
      createdAt: toDate(ISO.gtmRoundOneClosed),
    },
    {
      id: "79000000-0000-4000-8000-000000000015",
      userId: FOUNDER_USER_ID,
      mapId: GTM_MAP_ID,
      claimId: DISTRIBUTION_CLAIM_ID,
      conceptId: null,
      requestId: null,
      type: "challenge.round.started",
      payload: {
        roundId: GTM_ROUND_TWO_ID,
        roundNumber: 2,
        critiqueStrength: "moderate",
        critiqueMode: "red_team",
      },
      createdAt: toDate(ISO.gtmRoundTwoStarted),
    },
    {
      id: "79000000-0000-4000-8000-000000000016",
      userId: FOUNDER_USER_ID,
      mapId: GTM_MAP_ID,
      claimId: DISTRIBUTION_CLAIM_ID,
      conceptId: null,
      requestId: REQUEST_ID_GTM_TWO_FAILED,
      type: "challenge.critique.requested",
      payload: {
        roundId: GTM_ROUND_TWO_ID,
        critiqueMode: "red_team",
      },
      createdAt: toDate(ISO.gtmRetryRequested),
    },
    {
      id: "79000000-0000-4000-8000-000000000017",
      userId: FOUNDER_USER_ID,
      mapId: GTM_MAP_ID,
      claimId: DISTRIBUTION_CLAIM_ID,
      conceptId: null,
      requestId: REQUEST_ID_GTM_TWO_RETRY,
      type: "challenge.critique.requested",
      payload: {
        roundId: GTM_ROUND_TWO_ID,
        critiqueMode: "red_team",
      },
      createdAt: toDate(ISO.gtmRetryQueued),
    },
    {
      id: "79000000-0000-4000-8000-000000000018",
      userId: OPERATOR_USER_ID,
      mapId: HABIT_MAP_ID,
      claimId: JOURNALING_CLAIM_ID,
      conceptId: null,
      requestId: null,
      type: "challenge.round.started",
      payload: {
        roundId: HABIT_ROUND_ONE_ID,
        roundNumber: 1,
        critiqueStrength: "strong",
        critiqueMode: "socratic",
      },
      createdAt: toDate(ISO.habitRoundOneStarted),
    },
    {
      id: "79000000-0000-4000-8000-000000000019",
      userId: OPERATOR_USER_ID,
      mapId: HABIT_MAP_ID,
      claimId: JOURNALING_CLAIM_ID,
      conceptId: null,
      requestId: REQUEST_ID_HABIT_ONE_FAILED,
      type: "challenge.critique.requested",
      payload: {
        roundId: HABIT_ROUND_ONE_ID,
        critiqueMode: "socratic",
      },
      createdAt: toDate(ISO.habitValidationRequested),
    },
    {
      id: "79000000-0000-4000-8000-000000000020",
      userId: OPERATOR_USER_ID,
      mapId: HABIT_MAP_ID,
      claimId: JOURNALING_CLAIM_ID,
      conceptId: null,
      requestId: REQUEST_ID_HABIT_ONE_SUCCESS,
      type: "challenge.critique.requested",
      payload: {
        roundId: HABIT_ROUND_ONE_ID,
        critiqueMode: "socratic",
      },
      createdAt: toDate(ISO.habitRetryRequested),
    },
    {
      id: "79000000-0000-4000-8000-000000000021",
      userId: OPERATOR_USER_ID,
      mapId: HABIT_MAP_ID,
      claimId: JOURNALING_CLAIM_ID,
      conceptId: null,
      requestId: REQUEST_ID_HABIT_ONE_SUCCESS,
      type: "challenge.critique.generated",
      payload: {
        roundId: HABIT_ROUND_ONE_ID,
        critiqueId: HABIT_CRITIQUE_ONE_ID,
        provider: "xai",
        model: "grok-4.20",
        promptVersion: "challenge-critique.v1",
      },
      createdAt: toDate(ISO.habitCritiqueGenerated),
    },
  ];

  return {
    profiles: profilesSeed,
    spheres: spheresSeed,
    maps: mapsSeed,
    claims: claimsSeed,
    workspaceContexts: contextsSeed,
    rounds: roundsSeed,
    critiques: critiquesSeed,
    jobAttempts: jobAttemptsSeed,
    events: eventsSeed,
  };
}

function buildSummary(
  bundle: SeedBundle,
  target: ChallengeBackendSeedTarget,
  dryRun: boolean,
): ChallengeBackendSeedSummary {
  const closedRounds = bundle.rounds.filter((round) => round.closedAt != null).length;
  const generatedRequestIds = new Set(
    bundle.events
      .filter((event) => event.type === "challenge.critique.generated")
      .map((event) => event.requestId)
      .filter((value): value is string => typeof value === "string" && value.length > 0),
  );
  const requestedOnly = bundle.events.filter(
    (event) => event.type === "challenge.critique.requested" && (!event.requestId || !generatedRequestIds.has(event.requestId)),
  ).length;

  const mapTitleById = new Map(bundle.maps.map((map) => [map.id, map.title]));
  const jobAttemptsByStatus = bundle.jobAttempts.reduce<Record<string, number>>((counts, attempt) => {
    const key = attempt.status;
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});

  return {
    target,
    dryRun,
    users: bundle.profiles.length,
    maps: bundle.maps.length,
    claims: bundle.claims.length,
    critiques: bundle.critiques.length,
    events: bundle.events.length,
    aiRuns: {
      generated: bundle.critiques.length,
      requestedOnly,
    },
    rounds: {
      total: bundle.rounds.length,
      closed: closedRounds,
      open: bundle.rounds.length - closedRounds,
    },
    jobAttemptsByStatus,
    outputSurface:
      "challenge backend fixtures seeded through profiles, maps, claims, challenge_rounds, challenge_critiques, moves_events, and ai_run metadata embedded in validated_output.",
    note:
      "These are compact workspace-backend fixtures only. They create realistic challenge state for local or staging inspection but do not create login credentials in Prisma auth tables.",
    exampleData: {
      users: bundle.profiles.map((profile) => ({
        id: profile.id,
        email: profile.email,
        displayName: profile.displayName ?? null,
      })),
      claims: bundle.claims.slice(0, 3).map((claim) => ({
        id: claim.id,
        mapTitle: mapTitleById.get(claim.mapId) ?? claim.mapId,
        text: claim.text,
        confidence: claim.confidence,
      })),
      critiqueStatuses: bundle.rounds.map((round) => {
        const state = (round.uncertainty ?? {}) as Record<string, unknown>;
        return {
          roundId: round.id,
          claimId: round.claimId,
          critiqueStatus: typeof state.critiqueStatus === "string" ? state.critiqueStatus : null,
          userGoal: typeof state.userGoal === "string" ? state.userGoal : null,
        };
      }),
      generatedAiRuns: bundle.critiques.map((critique) => {
        const aiRun = (critique.validatedOutput?._aiRun ?? {}) as Record<string, unknown>;
        const matchingGeneratedEvent =
          bundle.events.find(
            (event) =>
              event.type === "challenge.critique.generated" &&
              event.payload &&
              typeof event.payload === "object" &&
              event.payload.roundId === critique.roundId,
          ) ?? null;
        return {
          roundId: critique.roundId,
          provider: typeof aiRun.provider === "string" ? aiRun.provider : critique.provider,
          model: typeof aiRun.model === "string" ? aiRun.model : critique.model,
          promptVersion:
            typeof aiRun.promptVersion === "string" ? aiRun.promptVersion : critique.promptVersion,
          requestId: matchingGeneratedEvent?.requestId ?? null,
        };
      }),
    },
  };
}

async function clearExistingSeedData(bundle: SeedBundle) {
  const db = createDrizzleDb();
  const seededUserIds = bundle.profiles.map((profile) => profile.id);

  await db.transaction(async (tx) => {
    await tx.delete(profiles).where(inArray(profiles.id, seededUserIds));
  });
}

async function insertSeedData(bundle: SeedBundle) {
  const db = createDrizzleDb();

  await db.transaction(async (tx) => {
    await tx.insert(profiles).values(bundle.profiles);
    await tx.insert(spheres).values(bundle.spheres);
    await tx.insert(maps).values(bundle.maps);
    await tx.insert(claims).values(bundle.claims);
    await tx.insert(workspaceContexts).values(bundle.workspaceContexts);
    await tx.insert(challengeRounds).values(bundle.rounds);
    await tx.insert(challengeCritiques).values(bundle.critiques);
    await tx.insert(challengeCritiqueJobAttempts).values(bundle.jobAttempts);
    await tx.insert(movesEvents).values(bundle.events);
  });
}

export async function seedChallengeBackend(options: SeedChallengeBackendOptions): Promise<ChallengeBackendSeedSummary> {
  assertNonProductionSeedTarget(options.target);
  const bundle = buildSeedBundle(options.target);
  const summary = buildSummary(bundle, options.target, Boolean(options.dryRun));

  if (options.dryRun) {
    return summary;
  }

  await clearExistingSeedData(bundle);
  await insertSeedData(bundle);

  return summary;
}
