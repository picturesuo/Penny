import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required to run Drizzle commands.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
});
