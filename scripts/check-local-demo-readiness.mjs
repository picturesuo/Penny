#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const port = readArg("--port", process.env.PORT || "3057");
const smokeOutput = readArg("--smoke-output", ".tmp-local-demo-readiness-smoke");
const skipSmoke = args.includes("--skip-smoke");
const phases = [
  { name: "typecheck", command: "pnpm", args: ["typecheck"] },
  { name: "test", command: "pnpm", args: ["test"] },
  { name: "build", command: "pnpm", args: ["build"] },
  ...(skipSmoke
    ? []
    : [
        {
          name: "local_demo_smoke",
          command: "pnpm",
          args: ["smoke:local-demo", "--", "--port", port, "--output", smokeOutput],
        },
      ]),
];

if (args.includes("--help")) {
  console.log(
    [
      "Usage: node scripts/check-local-demo-readiness.mjs [options]",
      "",
      "Options:",
      "  --port <port>              Port for the local demo smoke. Defaults to 3057.",
      "  --smoke-output <dir>       Playwright output directory. Defaults to .tmp-local-demo-readiness-smoke.",
      "  --skip-smoke               Run typecheck, tests, and build only.",
      "",
      "Runs the local product/demo readiness gate: typecheck, test, build, and local browser smoke.",
    ].join("\n"),
  );
  process.exit(0);
}

const startedAt = Date.now();
const results = [];

for (const phase of phases) {
  const phaseStartedAt = Date.now();
  console.log(`\n==> ${phase.name}: ${phase.command} ${phase.args.join(" ")}`);
  const result = spawnSync(phase.command, phase.args, {
    env: process.env,
    stdio: "inherit",
  });
  const durationMs = Date.now() - phaseStartedAt;

  results.push({
    name: phase.name,
    durationMs,
    status: result.status ?? 1,
  });

  if (result.status !== 0) {
    printSummary("failed", results, Date.now() - startedAt);
    process.exit(result.status ?? 1);
  }
}

printSummary("passed", results, Date.now() - startedAt);

function printSummary(status, phaseResults, totalMs) {
  console.log("");
  console.log(`Local demo readiness ${status}.`);
  console.log(`Total: ${formatDuration(totalMs)}`);

  for (const result of phaseResults) {
    console.log(`- ${result.name}: ${result.status === 0 ? "passed" : "failed"} in ${formatDuration(result.durationMs)}`);
  }
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

function formatDuration(ms) {
  if (ms < 1000) {
    return `${ms}ms`;
  }

  return `${(ms / 1000).toFixed(1)}s`;
}
