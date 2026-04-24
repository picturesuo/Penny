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
  primaryClaimId: string;
  supportingClaimId: string;
};

type SeedConfig = {
  userId: string;
  userEmail: string;
  userDisplayName: string;
};

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

export async function seedMvpBackend(config = readSeedConfig()): Promise<SeedResult> {
  await upsertSeedUser(config);

  const map = await createMap({
    userId: config.userId,
    title: "Penny MVP Demo",
    requestId: "seed:mvp:map",
  });
  const primaryClaim = await createClaim({
    userId: config.userId,
    mapId: map.mapId,
    text: "Penny should help founders pressure-test their assumptions before they harden into strategy.",
    note: "Seeded claim for the Brain, Challenge, and Learn MVP loop.",
    kind: "claim",
    requestId: "seed:mvp:claim:primary",
  });
  const supportingClaim = await createClaim({
    userId: config.userId,
    mapId: map.mapId,
    text: "A visible critique trail makes belief updates easier to trust and revisit.",
    note: "Seeded supporting claim for graph/projection demos.",
    parentClaimId: primaryClaim.claimId,
    kind: "support",
    requestId: "seed:mvp:claim:supporting",
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
    primaryClaimId: primaryClaim.claimId,
    supportingClaimId: supportingClaim.claimId,
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
