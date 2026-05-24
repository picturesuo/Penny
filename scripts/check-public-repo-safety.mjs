#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { basename, extname } from "node:path";
import { readFileSync } from "node:fs";

const allowedEnvFiles = new Set([".env.example"]);
const proofMediaExtensions = new Set([".har", ".jpg", ".jpeg", ".mov", ".mp4", ".png", ".trace", ".webm", ".webp", ".zip"]);
const maxTextBytes = 2_000_000;

const secretPatterns = [
  { name: "GitHub personal access token", pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}\b/g },
  { name: "GitHub fine-grained token", pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  { name: "OpenAI-style API key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { name: "Anthropic API key", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { name: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "private key block", pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |)?PRIVATE KEY-----/g },
];

const trackedFiles = execFileSync("git", ["ls-files", "-z"], { encoding: "buffer" })
  .toString("utf8")
  .split("\0")
  .filter(Boolean);

const blockers = [];
const warnings = [];

for (const file of trackedFiles) {
  const fileName = basename(file);

  if (fileName.startsWith(".env") && !allowedEnvFiles.has(fileName)) {
    blockers.push(`${file}: tracked env file would become public`);
    continue;
  }

  const extension = extname(file).toLowerCase();

  if (file.startsWith("docs/proof/") && proofMediaExtensions.has(extension)) {
    warnings.push(`${file}: proof media should be reviewed or removed before publicizing`);
  }

  const buffer = readFileSync(file);

  if (buffer.includes(0) || buffer.length > maxTextBytes) {
    continue;
  }

  const text = buffer.toString("utf8");

  for (const { name, pattern } of secretPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      blockers.push(`${file}: looks like it contains ${name}`);
    }
  }
}

if (blockers.length > 0) {
  console.error("Public repo safety check failed.");
  console.error("");
  for (const blocker of blockers) {
    console.error(`BLOCKER ${blocker}`);
  }
}

if (warnings.length > 0) {
  console.error(blockers.length > 0 ? "" : "Public repo safety warnings:");
  for (const warning of warnings) {
    console.error(`WARN ${warning}`);
  }
}

if (blockers.length > 0) {
  process.exit(1);
}

console.log(`Public repo safety check passed: ${trackedFiles.length} tracked files scanned, ${warnings.length} review warnings.`);
