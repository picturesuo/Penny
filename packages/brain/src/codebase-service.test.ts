import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { buildCodebaseContext, scanTrackedRepo, searchCodebaseIndex } from "./codebase-service.ts";

const execFileAsync = promisify(execFile);

test("scanner excludes generated assets, node_modules, lockfiles, and indexes Penny source/docs", async () => {
  const repo = await createFixtureRepo();

  try {
    const index = await scanTrackedRepo({ repoRoot: repo });
    const paths = index.files.map((file) => file.path);

    assert.ok(paths.includes("packages/brain/src/widget-route.ts"));
    assert.ok(paths.includes("packages/brain/frontend/src/components/WidgetPanel.tsx"));
    assert.ok(paths.includes("docs/widget.md"));
    assert.ok(paths.includes("docs/code-memory/MEMORY.md"));
    assert.ok(paths.includes("drizzle/0033_add_widget.sql"));
    assert.ok(!paths.includes("packages/brain/public/assets/index.js"));
    assert.ok(!paths.includes("node_modules/generated/index.js"));
    assert.ok(!paths.includes("pnpm-lock.yaml"));
    assert.ok(index.excluded.some((entry) => entry.path === "packages/brain/public/assets/index.js"));
    assert.ok(index.excluded.some((entry) => entry.path === "node_modules/generated/index.js"));
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("scanner detects changed files by hash", async () => {
  const repo = await createFixtureRepo();

  try {
    const first = await scanTrackedRepo({ repoRoot: repo });
    const previousHashes = new Map(first.files.map((file) => [file.path, file.hash]));

    await writeFile(
      join(repo, "packages/brain/src/widget-route.ts"),
      `import { loadWidget } from "./services/widget-service.ts";

export async function handleWidgetRequest(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("method", { status: 405 });
  }

  return Response.json({ widget: loadWidget(), changed: true });
}
`,
    );
    await git(repo, "add", "packages/brain/src/widget-route.ts");

    const second = await scanTrackedRepo({ repoRoot: repo, previousHashes });

    assert.ok(second.changedFiles.some((file) => file.path === "packages/brain/src/widget-route.ts"));
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("scanner extracts API routes, components, imports, tests, docs, and memory notes", async () => {
  const repo = await createFixtureRepo();

  try {
    const index = await scanTrackedRepo({ repoRoot: repo });

    assert.ok(index.routes.some((route) => route.routePath === "/api/widgets"));
    assert.ok(index.symbols.some((symbol) => symbol.kind === "component" && symbol.name === "WidgetPanel"));
    assert.ok(index.imports.some((item) => item.path === "packages/brain/src/widget-route.ts" && item.importedPath === "packages/brain/src/services/widget-service.ts"));
    assert.ok(index.tests.some((item) => item.name.includes("returns widgets")));
    assert.ok(index.docs.some((doc) => doc.references.includes("packages/brain/src/widget-route.ts")));
    assert.ok(index.memoryNotes.some((note) => note.path === "docs/code-memory/MEMORY.md" && /Widget route/i.test(note.text)));
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

test("search finds relevant chunks and context stays small with adjacent tests/docs", async () => {
  const repo = await createFixtureRepo();

  try {
    const index = await scanTrackedRepo({ repoRoot: repo });
    const results = searchCodebaseIndex(index, {
      query: "widgets api route",
      limit: 5,
      includeDependencies: true,
    });

    assert.ok(results.length > 0);
    assert.ok(results.some((result) => result.path === "packages/brain/src/server.ts"));
    assert.ok(results.every((result) => result.snippet.length < 800));

    const context = buildCodebaseContext(index, {
      query: "change widgets api route",
      maxChunks: 6,
      maxChars: 8_000,
      includeDependencies: true,
    });

    assert.ok(context.summary.chunkCount <= 6);
    assert.ok(context.files.some((file) => file.path === "packages/brain/src/widget-route.ts"));
    assert.ok(context.tests.some((item) => item.path === "packages/brain/src/widget-route.test.ts"));
    assert.ok(context.docs.some((doc) => doc.path === "docs/widget.md" || doc.path === "docs/code-memory/MEMORY.md"));
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});

async function createFixtureRepo(): Promise<string> {
  const repo = await mkdtemp(join(tmpdir(), "penny-codebase-"));

  await write(repo, ".gitignore", "node_modules\npackages/brain/public\npnpm-lock.yaml\n");
  await write(repo, "package.json", "{\"name\":\"fixture\"}\n");
  await write(repo, "pnpm-lock.yaml", "lockfile noise\n");
  await write(
    repo,
    "packages/brain/src/server.ts",
    `import { handleWidgetRequest } from "./widget-route.ts";

async function writeWebResponse(_response: unknown, _value: Response): Promise<void> {}

export async function route(request: Request, url: URL, outgoing: unknown): Promise<void> {
  if (url.pathname === "/api/widgets") {
    await writeWebResponse(outgoing, await handleWidgetRequest(request));
    return;
  }
}
`,
  );
  await write(
    repo,
    "packages/brain/src/widget-route.ts",
    `import { loadWidget } from "./services/widget-service.ts";

export async function handleWidgetRequest(request: Request): Promise<Response> {
  if (request.method !== "GET") {
    return new Response("method", { status: 405 });
  }

  return Response.json({ widget: loadWidget() });
}
`,
  );
  await write(
    repo,
    "packages/brain/src/services/widget-service.ts",
    `export function loadWidget(): string {
  return "widget-route";
}
`,
  );
  await write(
    repo,
    "packages/brain/src/widget-route.test.ts",
    `import assert from "node:assert/strict";
import test from "node:test";
import { handleWidgetRequest } from "./widget-route.ts";

test("GET /api/widgets returns widgets", async () => {
  const response = await handleWidgetRequest(new Request("http://localhost/api/widgets"));
  assert.equal(response.status, 200);
});
`,
  );
  await write(
    repo,
    "packages/brain/frontend/src/components/WidgetPanel.tsx",
    `import { useState } from "react";

export function WidgetPanel() {
  const [open] = useState(true);
  return <section>{open ? "Widget route" : "Closed"}</section>;
}
`,
  );
  await write(
    repo,
    "docs/widget.md",
    `# Widget Route

The route in packages/brain/src/widget-route.ts is covered by packages/brain/src/widget-route.test.ts.
`,
  );
  await write(
    repo,
    "docs/code-memory/MEMORY.md",
    `# Code Memory

## Widget route

The Widget route is a good fixture for Codebase Brain retrieval.
`,
  );
  await write(repo, "drizzle/0033_add_widget.sql", "CREATE TABLE widget_fixture (id text PRIMARY KEY);\n");
  await write(repo, "packages/brain/public/assets/index.js", "console.log('generated');\n");
  await write(repo, "node_modules/generated/index.js", "console.log('dependency');\n");

  await git(repo, "init");
  await git(repo, "config", "user.email", "codex@example.test");
  await git(repo, "config", "user.name", "Codex Test");
  await git(repo, "add", ".");
  await git(repo, "add", "-f", "packages/brain/public/assets/index.js", "node_modules/generated/index.js");
  await git(repo, "commit", "-m", "fixture");

  return repo;
}

async function write(repo: string, path: string, text: string): Promise<void> {
  const absolutePath = join(repo, path);
  await mkdir(join(absolutePath, ".."), { recursive: true });
  await writeFile(absolutePath, text);
}

async function git(repo: string, ...args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd: repo });
}
