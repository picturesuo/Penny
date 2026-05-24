#!/usr/bin/env node
import { execFileSync } from "node:child_process";

const requiredSecrets = [
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

const optionalSecrets = ["PENNY_PUBLIC_SMOKE_BASE_URL"];
const repo = readArg("--repo", process.env.PENNY_GITHUB_REPO || "picturesuo/Penny");
const names = new Set(
  execFileSync("gh", ["secret", "list", "--repo", repo], { encoding: "utf8" })
    .split("\n")
    .map((line) => line.split(/\s+/)[0]?.trim())
    .filter(Boolean),
);
const missing = requiredSecrets.filter((name) => !names.has(name));
const optionalMissing = optionalSecrets.filter((name) => !names.has(name));

if (missing.length > 0) {
  console.error(`GitHub deploy secret preflight failed for ${repo}.`);
  console.error("");
  for (const name of missing) {
    console.error(`MISSING ${name}`);
  }

  if (optionalMissing.length > 0) {
    console.error("");
    for (const name of optionalMissing) {
      console.error(`OPTIONAL ${name}`);
    }
  }

  process.exit(1);
}

console.log(`GitHub deploy secret preflight passed for ${repo}.`);
console.log(`Required secrets present: ${requiredSecrets.length}`);

if (optionalMissing.length > 0) {
  console.log(`Optional secrets missing: ${optionalMissing.join(", ")}`);
}

function readArg(name, fallback) {
  const index = process.argv.indexOf(name);

  if (index === -1) {
    return fallback;
  }

  const value = process.argv[index + 1];

  if (!value || value.startsWith("--")) {
    console.error(`${name} requires a value.`);
    process.exit(1);
  }

  return value;
}
