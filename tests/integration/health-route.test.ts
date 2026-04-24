import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { GET } from "../../apps/web/app/health/route.ts";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("GET /health returns an unauthenticated backend health response", async () => {
  const response = GET();

  assert.equal(response.status, 200);
  const body = (await response.json()) as { ok?: unknown; service?: unknown; timestamp?: unknown };

  assert.equal(body.ok, true);
  assert.equal(body.service, "penny");
  assert.equal(typeof body.timestamp, "string");
  assert.doesNotThrow(() => new Date(body.timestamp as string).toISOString());
});

test("backend MVP tests use the existing node:test plus tsx setup", () => {
  const packageJson = JSON.parse(readFileSync(resolve(projectRoot, "package.json"), "utf8")) as {
    packageManager?: string;
    scripts?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  assert.match(packageJson.packageManager ?? "", /^pnpm@/);

  for (const scriptName of ["test:integration", "test:mvp", "test:mvp-verification"]) {
    const script = packageJson.scripts?.[scriptName];
    assert.equal(typeof script, "string", `Missing package script: ${scriptName}`);
    assert.match(script, /^tsx --test(?:\s|$)/, `${scriptName} must use the existing tsx node:test runner`);
  }

  assert.equal(packageJson.devDependencies?.vitest, undefined);
  assert.equal(packageJson.devDependencies?.jest, undefined);
});
