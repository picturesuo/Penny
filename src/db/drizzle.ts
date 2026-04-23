import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function getPostgresUrl() {
  const url = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;

  if (!url) {
    throw new Error("Missing POSTGRES_URL or DATABASE_URL for the Drizzle PostgreSQL client.");
  }

  return url;
}

export function createPostgresClient(url = getPostgresUrl()) {
  return postgres(url, {
    prepare: false,
  });
}

export function createDrizzleDb(url = getPostgresUrl()) {
  const client = createPostgresClient(url);

  return drizzle(client, {
    schema,
  });
}

type PostgresClient = ReturnType<typeof createPostgresClient>;
type DrizzleDb = ReturnType<typeof createDrizzleDb>;

const globalForDrizzle = globalThis as typeof globalThis & {
  __pennyPostgresClient?: PostgresClient;
  __pennyDrizzleDb?: DrizzleDb;
};

export function getDrizzleDb() {
  if (!globalForDrizzle.__pennyPostgresClient || !globalForDrizzle.__pennyDrizzleDb) {
    const url = getPostgresUrl();
    const client = createPostgresClient(url);
    const db = drizzle(client, { schema });

    globalForDrizzle.__pennyPostgresClient = client;
    globalForDrizzle.__pennyDrizzleDb = db;
  }

  return globalForDrizzle.__pennyDrizzleDb;
}

export type { DrizzleDb, PostgresClient };
export { schema };
