import { defineConfig } from "drizzle-kit";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

loadPennyEnv();

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for Penny migrations. Add it to .env.local or export it before running pnpm db:migrate.");
}

export default defineConfig({
  dialect: "postgresql",
  out: "./drizzle",
  schema: "./packages/brain/src/db/schema.ts",
  dbCredentials: {
    url: databaseUrl,
  },
});

function loadPennyEnv(): void {
  const loadEnvFile = (process as NodeJS.Process & { loadEnvFile?: (path: string) => void }).loadEnvFile;

  if (!loadEnvFile) {
    return;
  }

  for (const path of [".env.local", ".env"]) {
    const absolutePath = fileURLToPath(new URL(path, import.meta.url));

    if (existsSync(absolutePath)) {
      loadEnvFile(absolutePath);
    }
  }
}
