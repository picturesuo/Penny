#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const args = process.argv.slice(2);
const options = {
  envFile: valueAfter("--env-file") ?? ".env.local",
  repo: valueAfter("--repo") ?? "picturesuo/Penny",
  setGithubSecret: args.includes("--set-github-secret"),
};

if (args.includes("--help") || args.includes("-h")) {
  printUsage();
  process.exit(0);
}

const loadedEnv = loadEnvFile(options.envFile);
const databaseUrl = (process.env.DATABASE_URL || loadedEnv.DATABASE_URL || "").trim();

if (!databaseUrl) {
  fail(`No DATABASE_URL found in the environment or ${options.envFile}.`);
}

const parsed = parseDatabaseUrl(databaseUrl);

if (!parsed.ok) {
  fail("DATABASE_URL must be a valid postgres:// or postgresql:// URL.");
}

if (parsed.local) {
  fail("DATABASE_URL points at localhost or loopback. Strict deploys need a remote Postgres database.");
}

const readinessEnv = {
  ...process.env,
  ...loadedEnv,
  DATABASE_URL: databaseUrl,
  NODE_ENV: "production",
  PENNY_DEPLOY_ENV: "private-alpha",
  PENNY_AUTH_MODE: "token",
  PENNY_API_TOKEN: loadedEnv.PENNY_API_TOKEN || process.env.PENNY_API_TOKEN || "x".repeat(40),
  PENNY_SESSION_SECRET: loadedEnv.PENNY_SESSION_SECRET || process.env.PENNY_SESSION_SECRET || "x".repeat(40),
  PENNY_CORS_ORIGINS:
    loadedEnv.PENNY_CORS_ORIGINS || process.env.PENNY_CORS_ORIGINS || "https://penny-preview.example.com",
  PENNY_RATE_LIMIT_MAX: "120",
  PENNY_RATE_LIMIT_WINDOW_MS: "60000",
  PENNY_AUTH_FAILURE_RATE_LIMIT_MAX: "10",
  PENNY_AUTH_FAILURE_RATE_LIMIT_WINDOW_MS: "60000",
  PENNY_TRUST_AUTH_HEADERS: "false",
  PENNY_STRUCTURED_LOGS: "true",
  PENNY_CREATE_MODEL_BACKED: "false",
  ENABLE_GMAIL_CONNECTOR: "false",
  ENABLE_RESTRICTED_GOOGLE_SCOPES: "false",
};

const readiness = spawnSync("pnpm", ["--silent", "check:public-readiness"], {
  cwd: process.cwd(),
  env: readinessEnv,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});

const output = `${readiness.stdout}\n${readiness.stderr}`.trim();
const report = parseJsonReport(output);

if (readiness.status !== 0) {
  if (report) {
    const failed = report.checks?.filter((check) => check.status === "fail") ?? [];
    console.error("DATABASE_URL candidate is not launch-ready.");
    for (const check of failed) {
      console.error(`- ${check.name}: ${check.message}`);
      if (Array.isArray(check.missing) && check.missing.length) {
        console.error(`  missing: ${check.missing.join(", ")}`);
      }
    }
    const hint = databaseUrlHint(parsed, failed);
    if (hint) {
      console.error(`Hint: ${hint}`);
    }
  } else {
    console.error(redactDatabaseUrls(output || `public readiness exited with ${readiness.status ?? "unknown status"}`));
  }
  process.exit(1);
}

if (!report?.ok) {
  fail("DATABASE_URL candidate did not produce an ok public-readiness report.");
}

console.log("DATABASE_URL candidate passed strict public-readiness schema checks.");
console.log(`Database host kind: ${parsed.azure ? "azure-postgres" : "remote-postgres"}`);

if (options.setGithubSecret) {
  const secret = spawnSync("gh", ["secret", "set", "DATABASE_URL", "--repo", options.repo, "--body", databaseUrl], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (secret.status !== 0) {
    console.error(redactDatabaseUrls(secret.stderr || secret.stdout || "Failed to set GitHub DATABASE_URL secret."));
    process.exit(secret.status ?? 1);
  }

  console.log(`GitHub secret DATABASE_URL set for ${options.repo}.`);
} else {
  console.log(`Run again with --set-github-secret to write DATABASE_URL to ${options.repo}.`);
}

function valueAfter(name) {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);

  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1] ?? null;

  return null;
}

function loadEnvFile(path) {
  if (!path || !existsSync(path)) return {};

  const env = {};
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
  return env;
}

function parseDatabaseUrl(value) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const username = decodeURIComponent(url.username || "");
    return {
      ok: url.protocol === "postgres:" || url.protocol === "postgresql:",
      local: ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname),
      azure: hostname.endsWith(".postgres.database.azure.com"),
      supabasePooler: hostname.endsWith(".pooler.supabase.com"),
      supabaseDirect: /^db\.[a-z0-9]+\.supabase\.co$/i.test(hostname),
      supabaseProjectInUser: /^postgres\.[a-z0-9]+$/i.test(username),
    };
  } catch {
    return { ok: false, local: false, azure: false, supabasePooler: false, supabaseDirect: false, supabaseProjectInUser: false };
  }
}

function databaseUrlHint(parsed, failedChecks) {
  const messages = failedChecks.map((check) => check.message).join("\n");

  if (parsed.supabasePooler && /tenant\/user .* not found/i.test(messages)) {
    return "This looks like a Supabase pooler URL, but Supavisor rejected the tenant/user. Copy a fresh Session pooler or Direct connection string from the Supabase dashboard, confirm the project is active, then rerun this command.";
  }

  if (parsed.supabaseDirect && /ENOTFOUND|does not resolve|getaddrinfo/i.test(messages)) {
    return "This looks like a Supabase direct URL, but the hostname did not resolve. Confirm the project ref and that the Supabase project is not paused or deleted.";
  }

  if (parsed.azure && /ENOTFOUND|does not resolve|getaddrinfo/i.test(messages)) {
    return "This looks like Azure Postgres, but the host did not resolve. Confirm the Flexible Server name and that Azure provisioning has completed.";
  }

  return "";
}

function parseJsonReport(output) {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start < 0 || end < start) return null;

  try {
    return JSON.parse(output.slice(start, end + 1));
  } catch {
    return null;
  }
}

function redactDatabaseUrls(value) {
  return String(value).replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, "postgresql://<redacted>");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function printUsage() {
  console.log(`Usage:
  node scripts/check-database-url-candidate.mjs [options]

Options:
  --env-file <path>          Env file to read DATABASE_URL from. Defaults to .env.local.
  --repo <owner/name>        GitHub repo for --set-github-secret. Defaults to picturesuo/Penny.
  --set-github-secret        Set the DATABASE_URL repo secret after the candidate passes.

The script validates the candidate under strict private-alpha settings and never prints the URL.`);
}
