#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";

const args = process.argv.slice(2);
const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const outDir = resolve(repoRoot, readArg("--out", "tmp/penny-public-snapshot"));
const force = args.includes("--force");
const initGit = !args.includes("--no-git");
const mediaExtensions = new Set([".gif", ".har", ".jpg", ".jpeg", ".mov", ".mp4", ".pdf", ".png", ".trace", ".webm", ".webp", ".zip"]);
const publicMediaAllowlist = new Set(["docs/assets/yc-demo-recording-path.png"]);

if (existsSync(outDir)) {
  if (!force) {
    console.error(`Output directory exists: ${relative(repoRoot, outDir)}`);
    console.error("Re-run with --force to replace it.");
    process.exit(1);
  }

  rmSync(outDir, { recursive: true, force: true });
}

mkdirSync(outDir, { recursive: true });

const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
const trackedFiles = execFileSync("git", ["ls-files", "-z"], { cwd: repoRoot, encoding: "buffer" })
  .toString("utf8")
  .split("\0")
  .filter(Boolean);

const included = [];
const excluded = [];

for (const file of trackedFiles) {
  const reason = exclusionReason(file);

  if (reason) {
    excluded.push({ file, reason });
    continue;
  }

  const destination = resolve(outDir, file);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(resolve(repoRoot, file), destination);
  included.push(file);
}

writeFileSync(
  resolve(outDir, "PUBLIC-SNAPSHOT.md"),
  [
    "# Penny Public Snapshot",
    "",
    `Source commit: \`${sourceCommit}\``,
    "",
    "This directory is a sanitized, single-commit publication snapshot generated from the private Penny repository.",
    "",
    "Excluded from this snapshot:",
    "",
    "- `docs/proof/**` screenshots, videos, traces, and local proof outputs.",
    "- Tracked local env files other than `.env.example`.",
    "- Binary/media files unless they are explicitly allowlisted by `scripts/prepare-public-snapshot.mjs`.",
    "",
    "Before pushing this snapshot to a public repository, run the normal tests from inside this directory and review the generated tree.",
    "",
  ].join("\n"),
);

if (initGit) {
  execFileSync("git", ["init", "-b", "main"], { cwd: outDir, stdio: "ignore" });
  execFileSync("git", ["add", "."], { cwd: outDir, stdio: "ignore" });
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Penny Snapshot",
      "-c",
      "user.email=penny-snapshot@example.invalid",
      "commit",
      "-m",
      "Initial public Penny snapshot",
    ],
    { cwd: outDir, stdio: "ignore" },
  );
}

console.log(`Public snapshot prepared at ${relative(repoRoot, outDir)}`);
console.log(`Source commit: ${sourceCommit}`);
console.log(`Included files: ${included.length}`);
console.log(`Excluded files: ${excluded.length}`);

for (const { file, reason } of excluded.slice(0, 20)) {
  console.log(`Excluded ${file}: ${reason}`);
}

if (excluded.length > 20) {
  console.log(`Excluded ${excluded.length - 20} more files.`);
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

function exclusionReason(file) {
  const fileName = basename(file);

  if (file.startsWith("docs/proof/")) {
    return "proof artifacts stay private";
  }

  if (fileName.startsWith(".env") && fileName !== ".env.example") {
    return "local env files stay private";
  }

  if (mediaExtensions.has(fileExtension(file)) && !publicMediaAllowlist.has(file)) {
    return "media file is not public allowlisted";
  }

  return null;
}

function fileExtension(file) {
  const index = file.lastIndexOf(".");

  return index === -1 ? "" : file.slice(index).toLowerCase();
}
