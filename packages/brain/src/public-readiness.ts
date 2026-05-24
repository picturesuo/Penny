import {
  missingPennySchemaTables,
  requiredPennySchemaTables,
  validatePennyStartupEnvironment,
} from "./server.ts";

export type PublicReadinessStatus = "pass" | "fail" | "warn";

export type PublicReadinessCheck = {
  name: string;
  status: PublicReadinessStatus;
  message: string;
  missing?: string[];
  evidence?: string[];
};

export type PublicReadinessInput = {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  existingTables?: Iterable<string> | null | undefined;
  databaseSchemaError?: string | null | undefined;
  gmailStagingBundleVerified?: boolean | undefined;
  gmailStagingBundleError?: string | null | undefined;
  generatedAt?: string | undefined;
};

export type PublicReadinessReport = {
  ok: boolean;
  generatedAt: string;
  deployTarget: string;
  strict: boolean;
  summary: {
    pass: number;
    fail: number;
    warn: number;
  };
  checks: PublicReadinessCheck[];
};

export function evaluatePennyPublicReadiness(input: PublicReadinessInput = {}): PublicReadinessReport {
  const env = input.env ?? process.env;
  const startup = validatePennyStartupEnvironment(env as NodeJS.ProcessEnv);
  const checks: PublicReadinessCheck[] = [];

  checks.push(
    check(
      "strict-deploy-target",
      startup.strict ? "pass" : "fail",
      startup.strict
        ? `Strict startup validation is active for ${startup.deployTarget}.`
        : "Public/private-alpha readiness requires NODE_ENV=production or PENNY_DEPLOY_ENV=staging, private-alpha, or production.",
    ),
  );

  checks.push(
    check(
      "startup-environment",
      startup.issues.length ? "fail" : "pass",
      startup.issues.length
        ? "Startup environment validation failed."
        : "Startup environment validation passed.",
      startup.issues.map((issue) => issue.code),
    ),
  );

  checks.push(databaseSchemaCheck(input));
  checks.push(authRuntimeCheck(env));
  checks.push(rateLimitCheck(env));
  checks.push(structuredLogsCheck(env));
  checks.push(modelProviderCheck(env));
  checks.push(gmailConnectorCheck(env, input));

  const summary = checks.reduce(
    (counts, readinessCheck) => {
      counts[readinessCheck.status] += 1;
      return counts;
    },
    { pass: 0, fail: 0, warn: 0 },
  );

  return {
    ok: summary.fail === 0,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    deployTarget: startup.deployTarget,
    strict: startup.strict,
    summary,
    checks,
  };
}

function databaseSchemaCheck(input: PublicReadinessInput): PublicReadinessCheck {
  if (input.databaseSchemaError) {
    return check("database-schema", "fail", `Database schema proof failed: ${input.databaseSchemaError}`);
  }

  if (!input.existingTables) {
    return check(
      "database-schema",
      "fail",
      "Database schema proof is missing. Run the public readiness checker against the target Postgres database.",
      [...requiredPennySchemaTables],
    );
  }

  const missing = missingPennySchemaTables(input.existingTables);

  return check(
    "database-schema",
    missing.length ? "fail" : "pass",
    missing.length
      ? "Target Postgres database is missing required Penny tables."
      : "Target Postgres database exposes every required Penny table.",
    missing,
  );
}

function authRuntimeCheck(env: PublicReadinessInput["env"]): PublicReadinessCheck {
  const authMode = envValue(env, "PENNY_AUTH_MODE").toLowerCase();
  const apiToken = envValue(env, "PENNY_API_TOKEN");
  const sessionSecret = envValue(env, "PENNY_SESSION_SECRET");
  const trustHeaders = envFlag(env, "PENNY_TRUST_AUTH_HEADERS");
  const missing: string[] = [];

  if (authMode !== "token") {
    missing.push("PENNY_AUTH_MODE=token");
  }

  if (apiToken.length < 32) {
    missing.push("PENNY_API_TOKEN>=32");
  }

  if (sessionSecret.length < 32) {
    missing.push("PENNY_SESSION_SECRET>=32");
  }

  if (trustHeaders) {
    missing.push("PENNY_TRUST_AUTH_HEADERS=false");
  }

  return check(
    "token-auth",
    missing.length ? "fail" : "pass",
    missing.length
      ? "Public readiness requires token auth, a long API token/session secret, and no trusted caller scope headers."
      : "Token auth is configured without trusting caller scope headers.",
    missing,
  );
}

function rateLimitCheck(env: PublicReadinessInput["env"]): PublicReadinessCheck {
  const missing: string[] = [];

  if (positiveIntegerEnv(env, "PENNY_RATE_LIMIT_MAX") === null) {
    missing.push("PENNY_RATE_LIMIT_MAX");
  }

  if (positiveIntegerEnv(env, "PENNY_RATE_LIMIT_WINDOW_MS") === null) {
    missing.push("PENNY_RATE_LIMIT_WINDOW_MS");
  }

  if (positiveIntegerEnv(env, "PENNY_AUTH_FAILURE_RATE_LIMIT_MAX") === null) {
    missing.push("PENNY_AUTH_FAILURE_RATE_LIMIT_MAX");
  }

  if (positiveIntegerEnv(env, "PENNY_AUTH_FAILURE_RATE_LIMIT_WINDOW_MS") === null) {
    missing.push("PENNY_AUTH_FAILURE_RATE_LIMIT_WINDOW_MS");
  }

  return check(
    "rate-limits",
    missing.length ? "fail" : "pass",
    missing.length
      ? "Public readiness requires explicit API and auth-failure rate limits."
      : "API and auth-failure rate limits are explicitly configured.",
    missing,
  );
}

function structuredLogsCheck(env: PublicReadinessInput["env"]): PublicReadinessCheck {
  const enabled = envFlag(env, "PENNY_STRUCTURED_LOGS");

  return check(
    "structured-logs",
    enabled ? "pass" : "fail",
    enabled
      ? "Structured privacy-safe logs are enabled."
      : "Public readiness requires PENNY_STRUCTURED_LOGS=true so deploy evidence is auditable.",
    enabled ? [] : ["PENNY_STRUCTURED_LOGS=true"],
  );
}

function modelProviderCheck(env: PublicReadinessInput["env"]): PublicReadinessCheck {
  const modelBacked = envFlag(env, "PENNY_CREATE_MODEL_BACKED");
  const xaiKeyPresent = Boolean(envValue(env, "XAI_API_KEY"));

  if (!modelBacked) {
    return check("model-provider", "pass", "Model-backed Create is disabled; deterministic Create remains the public-safe default.");
  }

  return check(
    "model-provider",
    xaiKeyPresent ? "pass" : "fail",
    xaiKeyPresent
      ? "Model-backed Create is enabled with a provider key present."
      : "PENNY_CREATE_MODEL_BACKED=true requires XAI_API_KEY before public readiness can pass.",
    xaiKeyPresent ? [] : ["XAI_API_KEY"],
  );
}

function gmailConnectorCheck(env: PublicReadinessInput["env"], input: PublicReadinessInput): PublicReadinessCheck {
  const gmailEnabled = envFlag(env, "ENABLE_GMAIL_CONNECTOR") && envFlag(env, "ENABLE_RESTRICTED_GOOGLE_SCOPES");

  if (!gmailEnabled) {
    return check(
      "gmail-connector-proof",
      "pass",
      "Live Gmail connector is disabled or restricted scopes are not enabled; public demo claims must stay on fixture/manual context.",
    );
  }

  if (input.gmailStagingBundleVerified) {
    return check("gmail-connector-proof", "pass", "Enabled Gmail connector has a verified final staging evidence bundle.");
  }

  return check(
    "gmail-connector-proof",
    "fail",
    input.gmailStagingBundleError
      ? `Enabled Gmail connector proof failed: ${input.gmailStagingBundleError}`
      : "Enabled Gmail connector requires a verified final staging evidence bundle before public readiness.",
    ["gmail final staging evidence bundle"],
  );
}

function check(
  name: string,
  status: PublicReadinessStatus,
  message: string,
  missing: string[] = [],
  evidence: string[] = [],
): PublicReadinessCheck {
  return {
    name,
    status,
    message,
    ...(missing.length ? { missing } : {}),
    ...(evidence.length ? { evidence } : {}),
  };
}

function envValue(env: PublicReadinessInput["env"], key: string): string {
  return env?.[key]?.trim() ?? "";
}

function envFlag(env: PublicReadinessInput["env"], key: string): boolean {
  const value = envValue(env, key).toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function positiveIntegerEnv(env: PublicReadinessInput["env"], key: string): number | null {
  const raw = envValue(env, key);
  const parsed = Number.parseInt(raw, 10);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
