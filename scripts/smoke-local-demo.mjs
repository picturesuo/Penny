#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const port = readArg("--port", process.env.PORT || "3057");
const baseUrl = readArg("--base-url", process.env.PENNY_BASE_URL || `http://localhost:${port}`);
const output = readArg("--output", ".tmp-local-demo-smoke");
const headed = args.includes("--headed");
const proofDir = readArg("--proof-dir", "");
const timeoutMs = Number.parseInt(readArg("--timeout-ms", "30000"), 10);
const specs = [
  "test/e2e/brain-first.spec.cjs",
  "test/e2e/yc-recording.spec.cjs",
  "test/e2e/learn-understanding-tour.spec.cjs",
];

if (args.includes("--help")) {
  console.log(
    [
      "Usage: node scripts/smoke-local-demo.mjs [options]",
      "",
      "Options:",
      "  --port <port>          Local Penny port. Defaults to 3057.",
      "  --base-url <url>       Existing or started Penny URL. Defaults to http://localhost:<port>.",
      "  --output <dir>         Playwright output directory. Defaults to .tmp-local-demo-smoke.",
      "  --proof-dir <dir>      Optional screenshot proof directory passed to the specs.",
      "  --headed               Run Playwright headed.",
      "  --timeout-ms <ms>      Server startup timeout. Defaults to 30000.",
    ].join("\n"),
  );
  process.exit(0);
}

const server = spawn("pnpm", ["exec", "tsx", "packages/brain/src/server.ts"], {
  env: {
    ...process.env,
    PORT: port,
    PENNY_AUTH_MODE: "dev",
    PENNY_SKIP_DATABASE_PREP: "true",
    PENNY_CREATE_MODEL_BACKED: "false",
    DATABASE_URL: "",
  },
  stdio: ["ignore", "inherit", "inherit"],
});

let serverExited = false;
server.on("exit", () => {
  serverExited = true;
});

try {
  await waitForServer(baseUrl, timeoutMs);

  const playwrightArgs = [
    "dlx",
    "@playwright/test",
    "test",
    ...specs,
    "--reporter=line",
    `--output=${output}`,
  ];

  if (headed) {
    playwrightArgs.push("--headed");
  }

  const result = spawnSync("pnpm", playwrightArgs, {
    env: {
      ...process.env,
      PENNY_BASE_URL: baseUrl,
      ...(proofDir ? { PENNY_PROOF_DIR: proofDir } : {}),
    },
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  console.log(`Local demo smoke passed against ${baseUrl}.`);
} finally {
  await stopServer();
}

function readArg(name, fallback) {
  const index = args.indexOf(name);

  if (index === -1) {
    return fallback;
  }

  const value = args[index + 1];

  if (!value || value.startsWith("--")) {
    console.error(`${name} requires a value.`);
    process.exit(1);
  }

  return value;
}

async function waitForServer(url, timeout) {
  const startedAt = Date.now();
  let lastError = "";

  while (Date.now() - startedAt < timeout) {
    if (serverExited) {
      throw new Error("Penny dev server exited before becoming ready.");
    }

    try {
      const response = await fetch(url, { redirect: "manual" });

      if (response.status < 500) {
        return;
      }

      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await delay(250);
  }

  throw new Error(`Timed out waiting for ${url}. Last error: ${lastError}`);
}

async function stopServer() {
  if (serverExited) {
    return;
  }

  server.kill("SIGTERM");

  const stopped = await new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), 3000);
    server.once("exit", () => {
      clearTimeout(timeout);
      resolve(true);
    });
  });

  if (!stopped && !serverExited) {
    server.kill("SIGKILL");
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
