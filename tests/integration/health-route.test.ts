import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { GET } from "../../apps/web/app/health/route.ts";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function readPackageJson() {
  return JSON.parse(readFileSync(resolve(projectRoot, "package.json"), "utf8")) as {
    packageManager?: string;
    scripts?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
}

function getScriptTestFiles(script: string) {
  return script
    .split(/\s+/)
    .filter((part) => part.startsWith("tests/") && part.endsWith(".test.ts"));
}

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
  const packageJson = readPackageJson();

  assert.match(packageJson.packageManager ?? "", /^pnpm@/);

  for (const scriptName of ["test:integration", "test:mvp", "test:mvp-verification"]) {
    const script = packageJson.scripts?.[scriptName];
    assert.equal(typeof script, "string", `Missing package script: ${scriptName}`);
    assert.match(script, /^tsx --test(?:\s|$)/, `${scriptName} must use the existing tsx node:test runner`);
  }

  assert.equal(packageJson.devDependencies?.vitest, undefined);
  assert.equal(packageJson.devDependencies?.jest, undefined);
});

test("backend MVP tests isolate data and do not require OPENAI_API_KEY", () => {
  const packageJson = readPackageJson();
  const mvpScript = packageJson.scripts?.["test:mvp"];
  assert.equal(typeof mvpScript, "string", "Missing package script: test:mvp");

  const testFiles = getScriptTestFiles(mvpScript);
  assert.ok(testFiles.length > 0, "test:mvp must list explicit test files");

  for (const testFile of testFiles) {
    if (testFile === "tests/integration/health-route.test.ts") {
      continue;
    }

    const source = readFileSync(resolve(projectRoot, testFile), "utf8");
    const usesDatabase = /process\.env\.DATABASE_(?:DIRECT_)?URL|DATABASE_URL:\s*databaseUrl/.test(source);

    if (usesDatabase) {
      assert.match(source, /mkdtempSync\(join\(tmpdir\(\), "penny-pgdata-/, `${testFile} must use a temp PGDATA dir`);
      assert.match(source, /run\("initdb"/, `${testFile} must initialize its own Postgres cluster`);
      assert.match(source, /run\("pnpm", \["db:migrate"\]/, `${testFile} must migrate its isolated database`);
      assert.match(source, /rmSync\(PGDATA_DIR, \{ recursive: true, force: true \}\)/, `${testFile} must clean up PGDATA`);
    }

    if (source.includes("OPENAI_API_KEY")) {
      assert.match(source, /delete process\.env\.OPENAI_API_KEY/, `${testFile} must prove it can run without OPENAI_API_KEY`);
    }
  }
});
