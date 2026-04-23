import { defineConfig } from "drizzle-kit";

const postgresUrl = process.env.POSTGRES_URL;

if (!postgresUrl) {
  throw new Error("Missing POSTGRES_URL for Drizzle workspace schema commands.");
}

if (!/^postgres(ql)?:\/\//i.test(postgresUrl)) {
  throw new Error(`POSTGRES_URL must use a postgres:// or postgresql:// URL. Received: ${postgresUrl}`);
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  strict: true,
  verbose: true,
  dbCredentials: {
    url: postgresUrl,
  },
});
