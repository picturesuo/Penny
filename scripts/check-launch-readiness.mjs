#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const args = process.argv.slice(2);
const githubRepo = readArg("--github-repo", "picturesuo/Penny");
const publicRepo = readArg("--public-repo", "picturesuo/penny-public");
const jsonOnly = args.includes("--json");

if (args.includes("--help")) {
  console.log(
    [
      "Usage: node scripts/check-launch-readiness.mjs [options]",
      "",
      "Options:",
      "  --github-repo <owner/name>   Private repo with deploy secrets. Defaults to picturesuo/Penny.",
      "  --public-repo <owner/name>   Sanitized public mirror. Defaults to picturesuo/penny-public.",
      "  --json                       Print JSON only.",
      "",
      "Checks git cleanliness, repo visibility, manual deploy workflow shape, GitHub deploy secrets, Azure CLI login, and public mirror safety.",
    ].join("\n"),
  );
  process.exit(0);
}

const checks = [
  checkGitState(),
  checkWorkflowShape(),
  checkRepoVisibility(githubRepo, publicRepo),
  checkDeploySecrets(githubRepo),
  checkAzureLogin(),
  checkPublicMirror(publicRepo),
];
const blockers = checks.flatMap((check) => check.blockers);
const warnings = checks.flatMap((check) => check.warnings);
const summary = {
  status: blockers.length === 0 ? "ready" : "blocked",
  checkedAt: new Date().toISOString(),
  blockers,
  warnings,
  checks,
};

if (jsonOnly) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  printHumanSummary(summary);
}

if (blockers.length > 0) {
  process.exit(1);
}

function checkGitState() {
  const status = run("git", ["status", "--short", "--branch"]);
  const branchLine = status.stdout.split("\n")[0] ?? "";
  const dirtyFiles = status.stdout.split("\n").slice(1).filter(Boolean);
  const blockers = [];

  if (status.status !== 0) {
    blockers.push("git status failed");
  } else {
    if (!branchLine.includes("main")) {
      blockers.push(`expected to be on main, got ${branchLine}`);
    }

    if (dirtyFiles.length > 0) {
      blockers.push(`working tree has uncommitted files: ${dirtyFiles.join(", ")}`);
    }
  }

  return {
    name: "git",
    status: blockers.length === 0 ? "pass" : "fail",
    blockers,
    warnings: [],
    details: { branchLine, dirtyFiles },
  };
}

function checkWorkflowShape() {
  const path = ".github/workflows/deploy-azure.yml";
  const blockers = [];
  const warnings = [];

  if (!existsSync(path)) {
    blockers.push(`${path} is missing`);
    return { name: "workflow", status: "fail", blockers, warnings, details: { path } };
  }

  const text = readFileSync(path, "utf8");
  const triggerBlock = text.match(/^on:\s*\n([\s\S]*?)(?=^\S)/m)?.[1] ?? "";
  const hasManualDispatch = /^\s+workflow_dispatch\s*:/.test(triggerBlock);
  const hasPushTrigger = /^\s+push\s*:/.test(triggerBlock);

  if (!hasManualDispatch) {
    blockers.push("deploy workflow is not manually dispatchable");
  }

  if (hasPushTrigger) {
    blockers.push("deploy workflow has a push trigger and can burn Actions minutes on normal commits");
  }

  return {
    name: "workflow",
    status: blockers.length === 0 ? "pass" : "fail",
    blockers,
    warnings,
    details: { path, hasManualDispatch, hasPushTrigger },
  };
}

function checkRepoVisibility(privateRepo, mirrorRepo) {
  const blockers = [];
  const warnings = [];
  const privateView = ghJson(["repo", "view", privateRepo, "--json", "isPrivate,nameWithOwner,url"]);
  const publicView = ghJson(["repo", "view", mirrorRepo, "--json", "isPrivate,nameWithOwner,url"]);

  if (!privateView.ok) {
    blockers.push(`cannot read private repo visibility for ${privateRepo}: ${privateView.error}`);
  } else if (privateView.value.isPrivate !== true) {
    blockers.push(`${privateRepo} should remain private while proof media exists in private history`);
  }

  if (!publicView.ok) {
    blockers.push(`cannot read public mirror visibility for ${mirrorRepo}: ${publicView.error}`);
  } else if (publicView.value.isPrivate !== false) {
    blockers.push(`${mirrorRepo} should be public as the sanitized mirror`);
  }

  return {
    name: "repo_visibility",
    status: blockers.length === 0 ? "pass" : "fail",
    blockers,
    warnings,
    details: {
      privateRepo: privateView.value ?? null,
      publicRepo: publicView.value ?? null,
    },
  };
}

function checkDeploySecrets(repo) {
  const required = [
    "ACR_LOGIN_SERVER",
    "ACR_USERNAME",
    "ACR_PASSWORD",
    "AZURE_CREDENTIALS",
    "AZURE_RESOURCE_GROUP",
    "AZURE_WEBAPP_NAME",
    "DATABASE_URL",
    "PENNY_API_TOKEN",
    "PENNY_CORS_ORIGINS",
    "PENNY_SESSION_SECRET",
  ];
  const optional = ["PENNY_PUBLIC_SMOKE_BASE_URL"];
  const blockers = [];
  const warnings = [];
  const listed = run("gh", ["secret", "list", "--repo", repo]);

  if (listed.status !== 0) {
    blockers.push(`cannot list GitHub deploy secrets for ${repo}: ${listed.stderr || listed.stdout}`);
    return { name: "deploy_secrets", status: "fail", blockers, warnings, details: { repo } };
  }

  const names = new Set(
    listed.stdout
      .split("\n")
      .map((line) => line.split(/\s+/)[0]?.trim())
      .filter(Boolean),
  );
  const missingRequired = required.filter((name) => !names.has(name));
  const missingOptional = optional.filter((name) => !names.has(name));

  for (const name of missingRequired) {
    blockers.push(`missing GitHub deploy secret ${name}`);
  }

  for (const name of missingOptional) {
    warnings.push(`optional GitHub deploy secret ${name} is not set`);
  }

  return {
    name: "deploy_secrets",
    status: blockers.length === 0 ? "pass" : "fail",
    blockers,
    warnings,
    details: { repo, requiredCount: required.length, missingRequired, missingOptional },
  };
}

function checkAzureLogin() {
  const warnings = [];
  const blockers = [];
  const commandCheck = run("az", ["--version"]);

  if (commandCheck.status !== 0) {
    blockers.push("Azure CLI is not available; install az or use another authenticated deployment path");
    return { name: "azure_cli", status: "fail", blockers, warnings, details: { available: false } };
  }

  const account = run("az", ["account", "show", "--output", "json"]);

  if (account.status !== 0) {
    blockers.push("Azure CLI is not logged in; run az login before bootstrap or resource checks");
    return { name: "azure_cli", status: "fail", blockers, warnings, details: { available: true, loggedIn: false } };
  }

  let parsed = null;
  try {
    parsed = JSON.parse(account.stdout);
  } catch {
    warnings.push("Azure account output was not JSON");
  }

  return {
    name: "azure_cli",
    status: blockers.length === 0 ? "pass" : "fail",
    blockers,
    warnings,
    details: { available: true, loggedIn: true, account: parsed ? { id: parsed.id, name: parsed.name, tenantId: parsed.tenantId } : null },
  };
}

function checkPublicMirror(repo) {
  const blockers = [];
  const warnings = [];
  const mirror = run("node", ["scripts/check-public-mirror.mjs", "--repo", repo]);

  if (mirror.status !== 0) {
    blockers.push(`public mirror check failed for ${repo}`);
    return {
      name: "public_mirror",
      status: "fail",
      blockers,
      warnings,
      details: { stdout: mirror.stdout.trim(), stderr: mirror.stderr.trim() },
    };
  }

  let details = null;
  try {
    details = JSON.parse(mirror.stdout);
  } catch {
    warnings.push("public mirror check output was not JSON");
  }

  const privateHead = run("git", ["rev-parse", "HEAD"]);
  if (privateHead.status === 0 && details?.sourceCommit && details.sourceCommit !== privateHead.stdout.trim()) {
    warnings.push(`public mirror source ${details.sourceCommit} is behind private HEAD ${privateHead.stdout.trim()}`);
  }

  return {
    name: "public_mirror",
    status: blockers.length === 0 ? "pass" : "fail",
    blockers,
    warnings,
    details,
  };
}

function printHumanSummary(summary) {
  console.log(`Penny launch readiness: ${summary.status.toUpperCase()}`);

  if (summary.blockers.length > 0) {
    console.log("");
    console.log("Blockers:");
    for (const blocker of summary.blockers) {
      console.log(`- ${blocker}`);
    }
  }

  if (summary.warnings.length > 0) {
    console.log("");
    console.log("Warnings:");
    for (const warning of summary.warnings) {
      console.log(`- ${warning}`);
    }
  }

  console.log("");
  console.log("Checks:");
  for (const check of summary.checks) {
    console.log(`- ${check.name}: ${check.status}`);
  }
}

function ghJson(args) {
  const result = run("gh", args);

  if (result.status !== 0) {
    return { ok: false, error: result.stderr || result.stdout };
  }

  try {
    return { ok: true, value: JSON.parse(result.stdout) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });

  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
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
