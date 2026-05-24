#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const args = process.argv.slice(2);
const snapshotDir = resolve(readArg("--snapshot", "tmp/penny-public-snapshot"));
const repo = readArg("--repo", "picturesuo/penny-public");
const branch = readArg("--branch", "main");
const dryRun = args.includes("--dry-run");
const rootCommit = !args.includes("--append-history");
const skipSafety = args.includes("--skip-safety");

if (args.includes("--help")) {
  console.log(
    [
      "Usage: node scripts/publish-public-snapshot.mjs [options]",
      "",
      "Options:",
      "  --snapshot <dir>     Generated public snapshot directory. Defaults to tmp/penny-public-snapshot.",
      "  --repo <owner/name>   Public GitHub repo to update. Defaults to picturesuo/penny-public.",
      "  --branch <name>      Branch to update. Defaults to main.",
      "  --dry-run            Verify and show the pending diff without updating GitHub.",
      "  --append-history     Create the new commit on top of the current public branch.",
      "  --skip-safety        Skip strict public safety verification.",
      "",
      "Default behavior keeps the public mirror as a one-commit sanitized snapshot.",
    ].join("\n"),
  );
  process.exit(0);
}

if (!existsSync(snapshotDir)) {
  fail(`Snapshot directory does not exist: ${snapshotDir}`);
}

if (!skipSafety) {
  execFileSync("node", ["scripts/check-public-repo-safety.mjs", "--strict"], { cwd: snapshotDir, stdio: "inherit" });
}

const sourceCommit = readSourceCommit(snapshotDir);
const headCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: snapshotDir, encoding: "utf8" }).trim();
const remote = `https://github.com/${repo}.git`;
const base = readRemoteRef(repo, branch);

let changedFiles;
if (base) {
  execFileSync("git", ["fetch", remote, branch, "--depth=1"], { cwd: snapshotDir, stdio: "ignore" });
  changedFiles = readChangedFiles(snapshotDir);
} else {
  changedFiles = readAllTrackedFiles(snapshotDir).map((path) => ({ status: "A", path }));
}

const summary = {
  repo,
  branch,
  snapshotDir,
  sourceCommit,
  snapshotCommit: headCommit,
  currentPublicCommit: base?.commitSha ?? null,
  currentPublicTree: base?.treeSha ?? null,
  rootCommit,
  changedCount: changedFiles.length,
  changedFiles: changedFiles.map((file) => `${file.status} ${file.path}`),
};

if (dryRun || changedFiles.length === 0) {
  console.log(JSON.stringify({ ...summary, dryRun: true, wouldPublish: changedFiles.length > 0 }, null, 2));
  process.exit(0);
}

const treeEntries = [];
for (const file of changedFiles) {
  if (file.status === "D" || !existsSync(resolve(snapshotDir, file.path))) {
    treeEntries.push({
      path: file.path,
      mode: "100644",
      type: "blob",
      sha: null,
    });
    continue;
  }

  treeEntries.push({
    path: file.path,
    mode: gitMode(snapshotDir, file.path),
    type: "blob",
    sha: createBlob(repo, snapshotDir, file.path),
  });
}

const treePayload = {
  ...(base?.treeSha ? { base_tree: base.treeSha } : {}),
  tree: treeEntries,
};
const createdTree = ghJson([`repos/${repo}/git/trees`], treePayload);
const createdCommit = ghJson([`repos/${repo}/git/commits`], {
  message: `Update public Penny snapshot\n\nSource private snapshot commit: ${sourceCommit}`,
  tree: createdTree.sha,
  parents: rootCommit || !base?.commitSha ? [] : [base.commitSha],
});

const ref = base
  ? ghJson([`repos/${repo}/git/refs/heads/${branch}`, "-X", "PATCH"], { sha: createdCommit.sha, force: true })
  : ghJson([`repos/${repo}/git/refs`], { ref: `refs/heads/${branch}`, sha: createdCommit.sha });

console.log(JSON.stringify({ ...summary, dryRun: false, tree: createdTree.sha, commit: createdCommit.sha, ref: ref.object.sha }, null, 2));

function readArg(name, fallback) {
  const index = args.indexOf(name);

  if (index === -1) {
    return fallback;
  }

  const value = args[index + 1];

  if (!value || value.startsWith("--")) {
    fail(`${name} requires a value.`);
  }

  return value;
}

function readSourceCommit(cwd) {
  const snapshotDoc = resolve(cwd, "PUBLIC-SNAPSHOT.md");

  if (existsSync(snapshotDoc)) {
    const match = readFileSync(snapshotDoc, "utf8").match(/Source commit:\s+`([0-9a-f]{40})`/i);

    if (match?.[1]) {
      return match[1];
    }
  }

  return execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();
}

function readRemoteRef(ownerRepo, branchName) {
  const ref = ghJsonMaybe([`repos/${ownerRepo}/git/ref/heads/${branchName}`]);

  if (!ref?.object?.sha) {
    return null;
  }

  const commit = ghJson([`repos/${ownerRepo}/git/commits/${ref.object.sha}`]);

  return {
    commitSha: ref.object.sha,
    treeSha: commit.tree.sha,
  };
}

function readChangedFiles(cwd) {
  const output = execFileSync("git", ["diff", "--name-status", "--no-renames", "FETCH_HEAD..HEAD"], { cwd, encoding: "utf8" }).trim();

  if (!output) {
    return [];
  }

  return output.split("\n").map((line) => {
    const [status, path] = line.split("\t");
    return { status, path };
  });
}

function readAllTrackedFiles(cwd) {
  return execFileSync("git", ["ls-files", "-z"], { cwd, encoding: "buffer" })
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
}

function gitMode(cwd, path) {
  const output = execFileSync("git", ["ls-files", "-s", "--", path], { cwd, encoding: "utf8" }).trim();
  return output.split(/\s+/)[0] || "100644";
}

function createBlob(ownerRepo, cwd, path) {
  const bytes = readFileSync(resolve(cwd, path));
  const payload = looksText(bytes, path)
    ? { content: bytes.toString("utf8"), encoding: "utf-8" }
    : { content: bytes.toString("base64"), encoding: "base64" };

  return ghJson([`repos/${ownerRepo}/git/blobs`], payload).sha;
}

function looksText(buffer, path) {
  if (buffer.includes(0)) {
    return false;
  }

  const textExtensions = new Set([
    ".cjs",
    ".css",
    ".csv",
    ".html",
    ".js",
    ".json",
    ".jsx",
    ".md",
    ".mjs",
    ".sql",
    ".ts",
    ".tsx",
    ".txt",
    ".yml",
    ".yaml",
  ]);
  const extension = path.includes(".") ? path.slice(path.lastIndexOf(".")).toLowerCase() : "";

  if (textExtensions.has(extension)) {
    return true;
  }

  return !isLikelyBinaryName(path) && buffer.length < 2_000_000;
}

function isLikelyBinaryName(path) {
  const name = basename(path).toLowerCase();
  return /\.(gif|har|jpe?g|mov|mp4|pdf|png|trace|webm|webp|zip)$/.test(name);
}

function ghJson(args, payload) {
  const result = runGh(args, payload);

  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.stderr.write(result.stdout);
    process.exit(result.status ?? 1);
  }

  return JSON.parse(result.stdout);
}

function ghJsonMaybe(args) {
  const result = runGh(args);

  if (result.status !== 0) {
    return null;
  }

  return JSON.parse(result.stdout);
}

function runGh(apiArgs, payload) {
  const argsWithInput = payload === undefined ? apiArgs : [...apiArgs, "--input", "-"];

  return spawnSync("gh", ["api", ...argsWithInput], {
    input: payload === undefined ? undefined : JSON.stringify(payload),
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
