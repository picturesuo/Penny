import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema.ts";

export type PennySqlClient = Sql;
export type PennyDatabase = PostgresJsDatabase<typeof schema>;

export function createPennySql(connectionString = process.env.DATABASE_URL): PennySqlClient {
  if (!connectionString?.trim()) {
    throw new Error("DATABASE_URL is required to create the Penny database client.");
  }

  return postgres(connectionString, {
    max: 1,
    prepare: false,
  });
}

export function createPennyDb(connectionString = process.env.DATABASE_URL): PennyDatabase {
  return drizzle(createPennySql(connectionString), { schema });
}

export { schema };
