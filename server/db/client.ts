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
  __pennyPostgresClient?: PostgresClient;
  __pennyDbClient?: DbClient;
};

export function getDb() {
  if (!globalForDb.__pennyPostgresClient || !globalForDb.__pennyDbClient) {
    const url = getRuntimeDatabaseUrl();
    const sql = createPostgresClient(url);
    const db = drizzle(sql, { schema });

    globalForDb.__pennyPostgresClient = sql;
    globalForDb.__pennyDbClient = db;
  }

  return globalForDb.__pennyDbClient;
}

export { getRuntimeDatabaseUrl };
export type { DbClient, PostgresClient };
