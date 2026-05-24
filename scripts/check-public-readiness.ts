import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createPennySql } from "../packages/brain/src/db/client.ts";
import { evaluatePennyPublicReadiness } from "../packages/brain/src/public-readiness.ts";

type CliOptions = {
  schemaTablesFile: string | null;
  gmailReadinessFile: string | null;
  gmailSmokeFile: string | null;
  gmailDestructiveSmokeFile: string | null;
  gmailUiPreflightFile: string | null;
  gmailBrowserEvidenceFile: string | null;
  gmailBrowserArtifactRoot: string | null;
};

const options = parseArgs(process.argv.slice(2));
const existingTablesResult = await loadExistingTables(options);
const gmailBundleResult = verifyGmailBundle(options);
const report = evaluatePennyPublicReadiness({
  existingTables: existingTablesResult.tables,
  databaseSchemaError: existingTablesResult.error,
  gmailStagingBundleVerified: gmailBundleResult.verified,
  gmailStagingBundleError: gmailBundleResult.error,
});

console.log(JSON.stringify(report, null, 2));

if (!report.ok) {
  process.exitCode = 1;
}

async function loadExistingTables(options: CliOptions): Promise<{ tables: string[] | null; error: string | null }> {
  if (options.schemaTablesFile) {
    try {
      return { tables: parseSchemaTablesFile(options.schemaTablesFile), error: null };
    } catch (error) {
      return { tables: null, error: sanitizeError(error) };
    }
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    return { tables: null, error: "DATABASE_URL is required to prove the target Postgres schema." };
  }

  const sql = createPennySql(databaseUrl);

  try {
    const rows = await sql<Array<{ table_name: string }>>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
    `;

    return { tables: rows.map((row) => row.table_name), error: null };
  } catch (error) {
    return { tables: null, error: sanitizeError(error) };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function verifyGmailBundle(options: CliOptions): { verified: boolean; error: string | null } {
  const gmailEnabled = envFlag("ENABLE_GMAIL_CONNECTOR") && envFlag("ENABLE_RESTRICTED_GOOGLE_SCOPES");

  if (!gmailEnabled) {
    return { verified: false, error: null };
  }

  if (!options.gmailReadinessFile || !options.gmailSmokeFile) {
    return {
      verified: false,
      error: "ENABLE_GMAIL_CONNECTOR and ENABLE_RESTRICTED_GOOGLE_SCOPES are true, but --gmail-readiness and --gmail-smoke were not provided.",
    };
  }

  const args = [
    "scripts/verify-gmail-staging-bundle.mjs",
    `--readiness=${options.gmailReadinessFile}`,
    `--smoke=${options.gmailSmokeFile}`,
    "--final-staging",
    ...(options.gmailDestructiveSmokeFile ? [`--destructive-smoke=${options.gmailDestructiveSmokeFile}`] : []),
    ...(options.gmailUiPreflightFile ? [`--ui-preflight=${options.gmailUiPreflightFile}`] : []),
    ...(options.gmailBrowserEvidenceFile ? [`--browser-evidence=${options.gmailBrowserEvidenceFile}`] : []),
    ...(options.gmailBrowserArtifactRoot ? [`--browser-artifact-root=${options.gmailBrowserArtifactRoot}`] : []),
  ];
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status === 0) {
    return { verified: true, error: null };
  }

  return {
    verified: false,
    error: summarizeVerifierFailure(result.stderr || result.stdout || `Verifier exited with ${result.status ?? "unknown status"}.`),
  };
}

function parseSchemaTablesFile(path: string): string[] {
  const raw = readFileSync(path, "utf8").trim();

  if (!raw) {
    return [];
  }

  if (raw.startsWith("[")) {
    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === "string")) {
      throw new Error("--schema-tables-file JSON must be an array of table-name strings.");
    }

    return parsed;
  }

  return raw
    .split(/\r?\n|,/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseArgs(args: string[]): CliOptions {
  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  return {
    schemaTablesFile: optionValue(args, "--schema-tables-file"),
    gmailReadinessFile: optionValue(args, "--gmail-readiness"),
    gmailSmokeFile: optionValue(args, "--gmail-smoke"),
    gmailDestructiveSmokeFile: optionValue(args, "--gmail-destructive-smoke"),
    gmailUiPreflightFile: optionValue(args, "--gmail-ui-preflight"),
    gmailBrowserEvidenceFile: optionValue(args, "--gmail-browser-evidence"),
    gmailBrowserArtifactRoot: optionValue(args, "--gmail-browser-artifact-root"),
  };
}

function optionValue(args: string[], name: string): string | null {
  return args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;
}

function envFlag(key: string): boolean {
  const value = process.env[key]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function sanitizeError(error: unknown): string {
  return String(error instanceof Error ? error.message : error)
    .replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, "postgresql://<redacted>")
    .split(/\r?\n/)
    .slice(0, 3)
    .join(" | ");
}

function summarizeVerifierFailure(value: string): string {
  return value.trim().split(/\r?\n/).slice(0, 6).join(" | ");
}

function printUsage(): void {
  console.error(`Usage:
  pnpm check:public-readiness
  pnpm check:public-readiness -- --schema-tables-file=tmp/schema-tables.json

Options:
  --schema-tables-file=<file>       JSON array, newline list, or comma list of public schema table names.
                                   If omitted, the checker queries DATABASE_URL directly.
  --gmail-readiness=<file>          Gmail strict-staging readiness evidence.
  --gmail-smoke=<file>              Gmail non-destructive smoke evidence.
  --gmail-destructive-smoke=<file>  Gmail revoke/delete smoke evidence.
  --gmail-ui-preflight=<file>       Gmail UI preflight evidence.
  --gmail-browser-evidence=<file>   Gmail browser evidence JSON.
  --gmail-browser-artifact-root=<dir>
                                   Artifact root for browser evidence files.
`);
}
