import { pathToFileURL } from "node:url";
import postgres from "postgres";

import { createClaim } from "../server/commands/create-claim.ts";
import { createMap } from "../server/commands/create-map.ts";
import { setWorkspaceSelection } from "../server/commands/set-workspace-selection.ts";
import { getRuntimeDatabaseUrl } from "../server/db/client.ts";

export const DEFAULT_SEED_USER_ID = "00000000-0000-4000-8000-000000000001";

export type SeedResult = {
  userId: string;
  mapId: string;
  thoughtId: string;
  primaryClaimId: string;
  supportingClaimId: string;
  evidenceClaimId: string;
  tensionClaimId: string;
  challengeRoundId: string;
  critiqueId: string;
};

type SeedConfig = {
  userId: string;
  userEmail: string;
  userDisplayName: string;
};

export const SEED_STORY = {
  mapTitle: "Building Penny: traceable product judgment",
  rawThought:
    "If Penny can show one raw founder thought becoming a claim, then a critique, then a teach-back, the demo proves the product remembers how beliefs changed.",
  primaryClaim: "Penny should make every product claim traceable from raw thought to challenge and learn-back.",
  supportingClaim: "A first-run demo should keep the same selected idea visible across Brain, Challenge, and Learn.",
  evidenceClaim: "Founder notes become useful when Penny preserves provenance, confidence, and critique history.",
  tensionClaim: "Generative polish can hide weak assumptions unless the demo makes critique results inspectable.",
} as const;

const SEED_IDS = {
  thought: "00000000-0000-4000-8000-000000000101",
  thoughtNode: "00000000-0000-4000-8000-000000000201",
  primaryNode: "00000000-0000-4000-8000-000000000202",
  supportingNode: "00000000-0000-4000-8000-000000000203",
  evidenceNode: "00000000-0000-4000-8000-000000000204",
  tensionNode: "00000000-0000-4000-8000-000000000205",
  edgeThoughtPrimary: "00000000-0000-4000-8000-000000000301",
  edgeSupportPrimary: "00000000-0000-4000-8000-000000000302",
  edgeEvidencePrimary: "00000000-0000-4000-8000-000000000303",
  edgeTensionPrimary: "00000000-0000-4000-8000-000000000304",
  challengeRound: "00000000-0000-4000-8000-000000000401",
  critique: "00000000-0000-4000-8000-000000000402",
  activityThought: "00000000-0000-4000-8000-000000000501",
  activityCritique: "00000000-0000-4000-8000-000000000502",
} as const;

export function readSeedConfig(env: NodeJS.ProcessEnv = process.env): SeedConfig {
  return {
    userId: env.PENNY_SEED_USER_ID?.trim() || DEFAULT_SEED_USER_ID,
    userEmail: env.PENNY_SEED_USER_EMAIL?.trim() || "demo@penny.local",
    userDisplayName: env.PENNY_SEED_USER_NAME?.trim() || "Penny Demo",
  };
}

async function upsertSeedUser(config: SeedConfig) {
  const sql = postgres(getRuntimeDatabaseUrl(), {
    prepare: false,
  });

  try {
    await sql`
      insert into users (id, email, display_name, created_at, updated_at)
      values (${config.userId}, ${config.userEmail}, ${config.userDisplayName}, now(), now())
      on conflict (email) do update
        set display_name = excluded.display_name,
            updated_at = now()
    `;
  } finally {
    await sql.end({ timeout: 1 });
  }
}

async function polishSeedStory(input: {
  config: SeedConfig;
  mapId: string;
  primaryClaimId: string;
  supportingClaimId: string;
  evidenceClaimId: string;
  tensionClaimId: string;
}) {
  const sql = postgres(getRuntimeDatabaseUrl(), {
    prepare: false,
  });
  const now = new Date();
  const critiqueJson = {
    summary: "The demo claim is strong only if a user can audit how the belief changed.",
    strongestCounterargument:
      "A polished demo could still be a static slideshow unless Penny preserves provenance, critique, and learning state as durable workspace data.",
    assumptions: [
      "Founders care more about belief history than another notes surface.",
      "The same selected claim can remain understandable across Brain, Challenge, and Learn.",
    ],
    failureModes: [
      "The graph shows attractive nodes but not why a claim should be trusted.",
      "Challenge output feels disconnected from the original raw thought.",
    ],
    followUpQuestions: [
      "Can the user explain where the selected claim came from?",
      "Can the user see the weakest assumption without opening developer tools?",
    ],
    suggestedConfidenceBps: 6100,
    uncertaintyNote: "Seeded critique for the local Penny demo; not a live provider judgment.",
  };

  try {
    await sql`
      update maps
      set title = ${SEED_STORY.mapTitle}, updated_at = ${now.toISOString()}
      where id = ${input.mapId} and user_id = ${input.config.userId}
    `;
    await sql`
      update claims
      set body = ${SEED_STORY.primaryClaim},
          thought_id = ${SEED_IDS.thought},
          confidence_bps = ${6400},
          updated_at = ${now.toISOString()}
      where id = ${input.primaryClaimId} and user_id = ${input.config.userId}
    `;
    await sql`
      update claims
      set body = ${SEED_STORY.supportingClaim},
          confidence_bps = ${7200},
          updated_at = ${now.toISOString()}
      where id = ${input.supportingClaimId} and user_id = ${input.config.userId}
    `;
    await sql`
      update claims
      set body = ${SEED_STORY.evidenceClaim},
          confidence_bps = ${6900},
          updated_at = ${now.toISOString()}
      where id = ${input.evidenceClaimId} and user_id = ${input.config.userId}
    `;
    await sql`
      update claims
      set body = ${SEED_STORY.tensionClaim},
          confidence_bps = ${4300},
          updated_at = ${now.toISOString()}
      where id = ${input.tensionClaimId} and user_id = ${input.config.userId}
    `;

    await sql`
      insert into thoughts (id, user_id, map_id, raw_text, source, metadata_json, created_at, updated_at)
      values (
        ${SEED_IDS.thought},
        ${input.config.userId},
        ${input.mapId},
        ${SEED_STORY.rawThought},
        ${"seed"},
        ${sql.json({ story: "first-run-demo", stage: "raw-thought" })},
        ${now.toISOString()},
        ${now.toISOString()}
      )
      on conflict (id) do update
        set user_id = excluded.user_id,
            map_id = excluded.map_id,
            raw_text = excluded.raw_text,
            source = excluded.source,
            metadata_json = excluded.metadata_json,
            updated_at = excluded.updated_at
    `;

    const nodes = [
      {
        id: SEED_IDS.thoughtNode,
        kind: "thought",
        label: "Raw founder thought",
        thoughtId: SEED_IDS.thought,
        claimId: null,
      },
      {
        id: SEED_IDS.primaryNode,
        kind: "claim",
        label: "Traceable claim loop",
        thoughtId: null,
        claimId: input.primaryClaimId,
      },
      {
        id: SEED_IDS.supportingNode,
        kind: "claim",
        label: "State continuity",
        thoughtId: null,
        claimId: input.supportingClaimId,
      },
      {
        id: SEED_IDS.evidenceNode,
        kind: "claim",
        label: "Provenance and critique history",
        thoughtId: null,
        claimId: input.evidenceClaimId,
      },
      {
        id: SEED_IDS.tensionNode,
        kind: "claim",
        label: "Polish can hide weak assumptions",
        thoughtId: null,
        claimId: input.tensionClaimId,
      },
    ];

    for (const node of nodes) {
      await sql`
        insert into graph_nodes (id, user_id, map_id, kind, label, claim_id, thought_id, metadata_json, created_at, updated_at)
        values (
          ${node.id},
          ${input.config.userId},
          ${input.mapId},
          ${node.kind},
          ${node.label},
          ${node.claimId},
          ${node.thoughtId},
          ${sql.json({ story: "first-run-demo" })},
          ${now.toISOString()},
          ${now.toISOString()}
        )
        on conflict (id) do update
          set user_id = excluded.user_id,
              map_id = excluded.map_id,
              kind = excluded.kind,
              label = excluded.label,
              claim_id = excluded.claim_id,
              thought_id = excluded.thought_id,
              metadata_json = excluded.metadata_json,
              updated_at = excluded.updated_at
      `;
    }

    const edges = [
      {
        id: SEED_IDS.edgeThoughtPrimary,
        sourceNodeId: SEED_IDS.thoughtNode,
        targetNodeId: SEED_IDS.primaryNode,
        kind: "extracts",
        weightBps: 9000,
        label: "becomes",
      },
      {
        id: SEED_IDS.edgeSupportPrimary,
        sourceNodeId: SEED_IDS.supportingNode,
        targetNodeId: SEED_IDS.primaryNode,
        kind: "supports",
        weightBps: 7600,
        label: "supports",
      },
      {
        id: SEED_IDS.edgeEvidencePrimary,
        sourceNodeId: SEED_IDS.evidenceNode,
        targetNodeId: SEED_IDS.primaryNode,
        kind: "depends_on",
        weightBps: 7000,
        label: "depends on",
      },
      {
        id: SEED_IDS.edgeTensionPrimary,
        sourceNodeId: SEED_IDS.tensionNode,
        targetNodeId: SEED_IDS.primaryNode,
        kind: "contradicts",
        weightBps: 5900,
        label: "challenges",
      },
    ];

    for (const edge of edges) {
      await sql`
        insert into graph_edges (id, user_id, map_id, source_node_id, target_node_id, kind, weight_bps, metadata_json, created_at, updated_at)
        values (
          ${edge.id},
          ${input.config.userId},
          ${input.mapId},
          ${edge.sourceNodeId},
          ${edge.targetNodeId},
          ${edge.kind},
          ${edge.weightBps},
          ${sql.json({ story: "first-run-demo", label: edge.label })},
          ${now.toISOString()},
          ${now.toISOString()}
        )
        on conflict (id) do update
          set user_id = excluded.user_id,
              map_id = excluded.map_id,
              source_node_id = excluded.source_node_id,
              target_node_id = excluded.target_node_id,
              kind = excluded.kind,
              weight_bps = excluded.weight_bps,
              metadata_json = excluded.metadata_json,
              updated_at = excluded.updated_at
      `;
    }

    await sql`
      insert into challenge_rounds (id, map_id, claim_id, user_id, status, created_at, updated_at)
      values (
        ${SEED_IDS.challengeRound},
        ${input.mapId},
        ${input.primaryClaimId},
        ${input.config.userId},
        ${"critiqued"},
        ${now.toISOString()},
        ${now.toISOString()}
      )
      on conflict (id) do update
        set map_id = excluded.map_id,
            claim_id = excluded.claim_id,
            user_id = excluded.user_id,
            status = excluded.status,
            updated_at = excluded.updated_at
    `;
    await sql`
      insert into challenge_critiques (id, round_id, map_id, claim_id, user_id, status, body, critique_json, created_at, updated_at)
      values (
        ${SEED_IDS.critique},
        ${SEED_IDS.challengeRound},
        ${input.mapId},
        ${input.primaryClaimId},
        ${input.config.userId},
        ${"ready"},
        ${"Strongest challenge: the first-run story only works if Penny shows provenance and critique history as durable state, not just attractive generated copy."},
        ${sql.json(critiqueJson)},
        ${now.toISOString()},
        ${now.toISOString()}
      )
      on conflict (id) do update
        set round_id = excluded.round_id,
            map_id = excluded.map_id,
            claim_id = excluded.claim_id,
            user_id = excluded.user_id,
            status = excluded.status,
            body = excluded.body,
            critique_json = excluded.critique_json,
            updated_at = excluded.updated_at
    `;

    await sql`
      insert into activity_events (
        id,
        user_id,
        map_id,
        thought_id,
        claim_id,
        aggregate_type,
        aggregate_id,
        type,
        payload_json,
        request_id,
        created_at
      )
      values (
        ${SEED_IDS.activityThought},
        ${input.config.userId},
        ${input.mapId},
        ${SEED_IDS.thought},
        ${input.primaryClaimId},
        ${"thought"},
        ${SEED_IDS.thought},
        ${"seed.thought_captured"},
        ${sql.json({ story: "first-run-demo", rawText: SEED_STORY.rawThought })},
        ${"seed:mvp:thought"},
        ${now.toISOString()}
      )
      on conflict (id) do update
        set user_id = excluded.user_id,
            map_id = excluded.map_id,
            thought_id = excluded.thought_id,
            claim_id = excluded.claim_id,
            aggregate_type = excluded.aggregate_type,
            aggregate_id = excluded.aggregate_id,
            type = excluded.type,
            payload_json = excluded.payload_json,
            request_id = excluded.request_id,
            created_at = excluded.created_at
    `;
    await sql`
      insert into activity_events (
        id,
        user_id,
        map_id,
        claim_id,
        aggregate_type,
        aggregate_id,
        type,
        payload_json,
        request_id,
        created_at
      )
      values (
        ${SEED_IDS.activityCritique},
        ${input.config.userId},
        ${input.mapId},
        ${input.primaryClaimId},
        ${"challenge_round"},
        ${SEED_IDS.challengeRound},
        ${"seed.challenge_ready"},
        ${sql.json({ story: "first-run-demo", critique: critiqueJson })},
        ${"seed:mvp:critique"},
        ${now.toISOString()}
      )
      on conflict (id) do update
        set user_id = excluded.user_id,
            map_id = excluded.map_id,
            claim_id = excluded.claim_id,
            aggregate_type = excluded.aggregate_type,
            aggregate_id = excluded.aggregate_id,
            type = excluded.type,
            payload_json = excluded.payload_json,
            request_id = excluded.request_id,
            created_at = excluded.created_at
    `;
  } finally {
    await sql.end({ timeout: 1 });
  }
}

export async function seedMvpBackend(config = readSeedConfig()): Promise<SeedResult> {
  await upsertSeedUser(config);

  const map = await createMap({
    userId: config.userId,
    title: SEED_STORY.mapTitle,
    requestId: "seed:mvp:map",
  });
  const primaryClaim = await createClaim({
    userId: config.userId,
    mapId: map.mapId,
    text: SEED_STORY.primaryClaim,
    note: "Seeded selected claim for the Brain, Challenge, and Learn MVP loop.",
    kind: "claim",
    requestId: "seed:mvp:claim:primary",
  });
  const supportingClaim = await createClaim({
    userId: config.userId,
    mapId: map.mapId,
    text: SEED_STORY.supportingClaim,
    note: "Seeded support claim showing first-run state continuity.",
    parentClaimId: primaryClaim.claimId,
    kind: "support",
    requestId: "seed:mvp:claim:supporting",
  });
  const evidenceClaim = await createClaim({
    userId: config.userId,
    mapId: map.mapId,
    text: SEED_STORY.evidenceClaim,
    note: "Seeded evidence claim for provenance and confidence.",
    parentClaimId: primaryClaim.claimId,
    kind: "support",
    requestId: "seed:mvp:claim:evidence",
  });
  const tensionClaim = await createClaim({
    userId: config.userId,
    mapId: map.mapId,
    text: SEED_STORY.tensionClaim,
    note: "Seeded tension claim so the graph has a visible critique path.",
    parentClaimId: primaryClaim.claimId,
    kind: "tension",
    requestId: "seed:mvp:claim:tension",
  });

  await polishSeedStory({
    config,
    mapId: map.mapId,
    primaryClaimId: primaryClaim.claimId,
    supportingClaimId: supportingClaim.claimId,
    evidenceClaimId: evidenceClaim.claimId,
    tensionClaimId: tensionClaim.claimId,
  });

  await setWorkspaceSelection({
    userId: config.userId,
    mode: "Brain",
    mapId: map.mapId,
    claimId: primaryClaim.claimId,
    requestId: "seed:mvp:workspace-selection",
  });

  return {
    userId: config.userId,
    mapId: map.mapId,
    thoughtId: SEED_IDS.thought,
    primaryClaimId: primaryClaim.claimId,
    supportingClaimId: supportingClaim.claimId,
    evidenceClaimId: evidenceClaim.claimId,
    tensionClaimId: tensionClaim.claimId,
    challengeRoundId: SEED_IDS.challengeRound,
    critiqueId: SEED_IDS.critique,
  };
}

async function main() {
  const result = await seedMvpBackend();

  console.log(JSON.stringify({ ok: true, seed: result }, null, 2));
}

const isMain = process.argv[1] ? pathToFileURL(process.argv[1]).href === import.meta.url : false;

if (isMain) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
