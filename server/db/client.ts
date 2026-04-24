import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

const DATABASE_URL_ERROR = "Missing DATABASE_URL or DATABASE_DIRECT_URL for the Supabase Postgres client.";

function getRuntimeDatabaseUrl() {
  const url = process.env.DATABASE_URL ?? process.env.DATABASE_DIRECT_URL;

  if (!url) {
    throw new Error(DATABASE_URL_ERROR);
  }

  if (!/^postgres(ql)?:\/\//i.test(url)) {
    throw new Error(`Supabase Postgres requires a postgres:// or postgresql:// URL. Received: ${url}`);
  }

  return url;
}

export function createPostgresClient(url = getRuntimeDatabaseUrl()) {
  return postgres(url, {
    prepare: false,
  });
}

export function createDbClient(url = getRuntimeDatabaseUrl()) {
  const sql = createPostgresClient(url);

  return drizzle(sql, { schema });
}

type PostgresClient = ReturnType<typeof createPostgresClient>;
type DbClient = ReturnType<typeof createDbClient>;

const globalForDb = globalThis as typeof globalThis & {
  __pennyDatabaseUrl?: string;
  __pennyPostgresClient?: PostgresClient;
  __pennyDbClient?: DbClient;
};

export function getDb() {
  const url = getRuntimeDatabaseUrl();

  if (globalForDb.__pennyDatabaseUrl !== url || !globalForDb.__pennyPostgresClient || !globalForDb.__pennyDbClient) {
    void globalForDb.__pennyPostgresClient?.end({ timeout: 1 }).catch(() => undefined);
    const sql = createPostgresClient(url);
    const db = drizzle(sql, { schema });

    globalForDb.__pennyDatabaseUrl = url;
    globalForDb.__pennyPostgresClient = sql;
    globalForDb.__pennyDbClient = db;
  }

  return globalForDb.__pennyDbClient;
}

export async function closeDb() {
  const sql = globalForDb.__pennyPostgresClient;

  globalForDb.__pennyDatabaseUrl = undefined;
  globalForDb.__pennyPostgresClient = undefined;
  globalForDb.__pennyDbClient = undefined;

  await sql?.end({ timeout: 1 });
}

export { getRuntimeDatabaseUrl };
export type { DbClient, PostgresClient };
