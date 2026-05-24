#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const repo = readArg("--repo", "picturesuo/penny-public");
const branch = readArg("--branch", "main");
const expectSource = readArg("--expect-source", "");
const allowHistory = args.includes("--allow-history");
const keepClone = args.includes("--keep-clone");

if (args.includes("--help")) {
  console.log(
    [
      "Usage: node scripts/check-public-mirror.mjs [options]",
      "",
      "Options:",
      "  --repo <owner/name>       Public GitHub repo to verify. Defaults to picturesuo/penny-public.",
      "  --branch <name>          Branch to verify. Defaults to main.",
      "  --expect-source <sha>    Require PUBLIC-SNAPSHOT.md to record this private source commit.",
      "  --allow-history          Do not require the public mirror to be a one-commit snapshot.",
      "  --keep-clone             Keep the temporary clone and print its path.",
    ].join("\n"),
  );
  process.exit(0);
}

const tempRoot = mkdtempSync(join(tmpdir(), "penny-public-mirror-"));
const cloneDir = join(tempRoot, "repo");
const remoteUrl = `https://github.com/${repo}.git`;

try {
  execFileSync("git", ["clone", "--depth=1", "--branch", branch, remoteUrl, cloneDir], { stdio: "ignore" });
  const publicCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: cloneDir, encoding: "utf8" }).trim();
  const commitCount = Number(execFileSync("git", ["rev-list", "--count", "HEAD"], { cwd: cloneDir, encoding: "utf8" }).trim());
  const safetyOutput = execFileSync("node", ["scripts/check-public-repo-safety.mjs", "--strict"], { cwd: cloneDir, encoding: "utf8" }).trim();
  const proofFileCount = Number(execFileSync("git", ["ls-files", "docs/proof"], { cwd: cloneDir, encoding: "utf8" }).trim().split("\n").filter(Boolean).length);
  const mediaFiles = execFileSync("git", ["ls-files"], { cwd: cloneDir, encoding: "utf8" })
    .split("\n")
    .filter((file) => /\.(gif|har|jpe?g|mov|mp4|pdf|png|trace|webm|webp|zip)$/i.test(file));
  const sourceCommit = readSnapshotSourceCommit(cloneDir);
  const errors = [];

  if (!allowHistory && commitCount !== 1) {
    errors.push(`expected a one-commit public mirror, found ${commitCount} commits`);
  }

  if (proofFileCount !== 0) {
    errors.push(`expected no docs/proof files, found ${proofFileCount}`);
  }

  const unexpectedMedia = mediaFiles.filter((file) => file !== "docs/assets/yc-demo-recording-path.png");

  if (unexpectedMedia.length > 0) {
    errors.push(`unexpected public media files: ${unexpectedMedia.join(", ")}`);
  }

  if (expectSource && sourceCommit !== expectSource) {
    errors.push(`expected source commit ${expectSource}, found ${sourceCommit || "none"}`);
  }

  const result = {
    repo,
    branch,
    publicCommit,
    sourceCommit,
    commitCount,
    proofFileCount,
    mediaFiles,
    safety: safetyOutput,
    ...(keepClone ? { cloneDir } : {}),
  };

  if (errors.length > 0) {
    console.error("Public mirror check failed.");
    for (const error of errors) {
      console.error(`BLOCKER ${error}`);
    }
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(result, null, 2));
} finally {
  if (!keepClone) {
    rmSync(tempRoot, { recursive: true, force: true });
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

function readSnapshotSourceCommit(cwd) {
  const path = join(cwd, "PUBLIC-SNAPSHOT.md");

  if (!existsSync(path)) {
    return "";
  }

  const match = readFileSync(path, "utf8").match(/Source commit:\s+`([0-9a-f]{40})`/i);
  return match?.[1] ?? "";
}
