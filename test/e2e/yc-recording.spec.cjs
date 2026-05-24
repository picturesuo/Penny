const { test, expect } = require("@playwright/test");
const fs = require("node:fs/promises");
const path = require("node:path");

const slowMo = Number.parseInt(process.env.PENNY_PLAYWRIGHT_SLOWMO_MS || "0", 10);
const browserOptions = { channel: process.env.PENNY_PLAYWRIGHT_CHANNEL || "chrome" };

if (Number.isFinite(slowMo) && slowMo > 0) {
  browserOptions.launchOptions = { slowMo };
}

if (process.env.PENNY_PLAYWRIGHT_VIDEO === "on") {
  browserOptions.video = "on";
}

if (process.env.PENNY_PLAYWRIGHT_TRACE === "on") {
  browserOptions.trace = "on";
}

if (process.env.PENNY_PLAYWRIGHT_SCREENSHOT === "on") {
  browserOptions.screenshot = "on";
}

test.use(browserOptions);
test.setTimeout(60_000);

test("YC recording path: landing fixture to Create, Learn, and export", async ({ page }, testInfo) => {
  const baseUrl = process.env.PENNY_BASE_URL || "http://localhost:3007";
  const scopeId = `yc-e2e-${testInfo.workerIndex}-${testInfo.repeatEachIndex}-${Date.now()}`;

  await page.addInitScript((scope) => {
    if (!window.sessionStorage.getItem(scope.storageResetKey)) {
      window.localStorage.clear();
      window.sessionStorage.setItem(scope.storageResetKey, "true");
    }

    const originalFetch = window.fetch.bind(window);

    window.fetch = (input, init = {}) => {
      const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const requestUrl = new URL(rawUrl, window.location.href);

      if (requestUrl.origin !== window.location.origin) {
        return originalFetch(input, init);
      }

      const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
      headers.set("x-user-id", scope.userId);
      headers.set("x-workspace-id", scope.workspaceId);
      headers.set("x-project-id", scope.projectId);
      headers.set("x-sphere-id", scope.sphereId);

      return originalFetch(input, { ...init, headers });
    };
  }, {
    userId: scopeId,
    workspaceId: `${scopeId}-workspace`,
    projectId: `${scopeId}-project`,
    sphereId: `${scopeId}-sphere`,
    storageResetKey: `${scopeId}-storage-reset`,
  });

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  const landingComposer = page.getByRole("textbox", { name: /Ask Penny anything|Enter a rough thought for Penny/ });
  await expect(landingComposer).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Start Create" })).toBeVisible();
  await captureProof(page, testInfo, "01-landing");
  await page.getByRole("button", { name: "Start Create" }).click();

  await expect(page.getByTestId("create-workspace")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("create-brain-context")).toHaveAttribute("data-create-context", "using-brain", {
    timeout: 15_000,
  });
  await expect(page.getByRole("textbox", { name: "Rough idea" })).toHaveValue(/emails, messages, and notes/i);
  await expect(page.getByTestId("yc-fixture-labels")).toContainText("Email fixture, not live Gmail");
  await expect(page.getByTestId("yc-fixture-labels")).toContainText("LinkedIn-style context, not live LinkedIn");
  await expect(page.getByTestId("yc-fixture-labels")).toContainText("Manual messages context for demo");
  await expect(page.getByTestId("yc-fixture-labels")).toContainText("No live WhatsApp, iMessage, SMS, Slack, or social connectors");
  await expect(page.getByTestId("yc-fixture-labels")).toContainText("Founder notes, manual/private");
  await expect(page.getByTestId("yc-fixture-labels")).toContainText("trainingUse=false");
  await expect(page.getByTestId("create-option-card")).toHaveCount(5, { timeout: 30_000 });
  await expect(page.getByTestId("create-option-card")).toContainText([
    "Personal",
    "Practical",
    "Valuable",
    "Critical",
    "Weird",
  ]);
  await expect(page.getByTestId("create-option-board")).toContainText("YC ideation workbench");
  await expect(page.getByTestId("create-option-board")).not.toContainText(/i want to create a yc startup around ideation/i);
  await expect(page.getByRole("region", { name: "Create graph" })).toBeVisible();
  await expect(page.getByTestId("yc-demo-canvas")).toContainText("Penny -> Brain -> Create -> Learn -> Export");
  await expect(page.getByTestId("yc-demo-canvas")).toContainText("Brain");
  await expect(page.getByTestId("yc-demo-canvas")).toContainText("Create");
  await expect(page.getByTestId("yc-demo-canvas")).toContainText("Generated Personal / Practical / Valuable / Critical / Weird");
  await expect(page.getByTestId("yc-demo-canvas")).toContainText("Learn");
  await expect(page.getByTestId("yc-demo-canvas")).toContainText("Export");
  await captureProof(page, testInfo, "02-fixture-create-canvas");

  await page.locator('[data-create-lens="Personal"] [data-testid="create-option-details-button"]').click();
  await expect(page.getByTestId("create-evidence-drawer")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("create-evidence-drawer")).toContainText(/Memories used|Sources used|Evidence used/);
  await expect(page.getByTestId("create-evidence-drawer")).toContainText(/Email fixture|Founder notes|Manual messages context for demo|LinkedIn-style/i);
  await captureProof(page, testInfo, "03-evidence");

  for (const lens of ["Personal", "Valuable", "Critical"]) {
    await page.locator(`[data-testid="create-option-card"][data-create-lens="${lens}"] .create-option-select-button`).click();
  }

  await page
    .locator(".create-judgment-panel textarea")
    .fill(
      "Make this founder/builder focused. Keep the memory-native creativity angle, but make the output concrete enough that I could build it with Codex.",
    );
  await captureProof(page, testInfo, "04-selections-comment");
  await page.getByRole("button", { name: /Update artifact|Update Idea Spec/ }).click();
  await expect(page.getByTestId("create-artifact-panel")).toContainText(/Personal|Valuable|Critical/, { timeout: 30_000 });
  await expect(page.getByTestId("create-artifact-panel")).toContainText(/founder\/builder focused|memory-native creativity/i);
  await expect(page.getByRole("region", { name: "Next best place" })).toContainText(/Learn a fuzzy point or export/);
  await expect(page.getByTestId("yc-artifact-outline")).toContainText("Product thesis");
  await expect(page.getByTestId("yc-artifact-outline")).toContainText("Target user");
  await expect(page.getByTestId("yc-artifact-outline")).toContainText("Problem");
  await expect(page.getByTestId("yc-artifact-outline")).toContainText("Why now");
  await expect(page.getByTestId("yc-artifact-outline")).toContainText("Core loop");
  await expect(page.getByTestId("yc-artifact-outline")).toContainText("Memory layer");
  await expect(page.getByTestId("yc-artifact-outline")).toContainText("Create mode");
  await expect(page.getByTestId("yc-artifact-outline")).toContainText("Learn bridge");
  await expect(page.getByTestId("yc-artifact-outline")).toContainText("Data sources");
  await expect(page.getByTestId("yc-artifact-outline")).toContainText("Moat");
  await expect(page.getByTestId("yc-artifact-outline")).toContainText("Risks");
  await expect(page.getByTestId("yc-artifact-outline")).toContainText("MVP scope");
  await expect(page.getByTestId("yc-artifact-outline")).toContainText("Demo script");
  await expect(page.getByTestId("yc-artifact-outline")).toContainText("Build prompt/export");
  await captureProof(page, testInfo, "05-artifact");

  await page.getByTestId("create-learn-this-button").click();
  await expect(page.getByTestId("learn-back-to-create")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("heading", { name: "Explain simply" })).toBeVisible();
  await expect(page.getByRole("article", { name: "Current learning step" })).toContainText(/selecting cards, writing comments, and rating exports/i);
  await expect(page.getByRole("button", { name: "2 Show worked example" })).toBeVisible();
  await expect(page.getByRole("button", { name: "3 Apply to my artifact" })).toBeVisible();
  await page.getByRole("button", { name: "2 Show worked example" }).click();
  await expect(page.getByRole("heading", { name: "Show worked example" })).toBeVisible();
  await expect(page.getByRole("article", { name: "Current learning step" })).toContainText(/selected option events outrank unselected viewing events/i);
  await page.getByRole("button", { name: "3 Apply to my artifact" }).click();
  await expect(page.getByRole("heading", { name: "Apply to my artifact" })).toBeVisible();
  await expect(page.getByRole("article", { name: "Current learning step" })).toContainText(/future Brain Ranker evidence/i);
  await captureProof(page, testInfo, "06-learn");

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("learn-back-to-create")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Explain simply" })).toBeVisible();
  await expect(page.getByRole("article", { name: "Current learning step" })).toContainText(
    /selecting cards, writing comments, and rating exports/i,
  );
  await captureProof(page, testInfo, "06b-learn-refresh-restored");

  await page.getByTestId("learn-back-to-create").click();
  await expect(page.getByTestId("create-workspace")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-testid="create-option-card"][data-create-lens="Personal"]')).toHaveClass(/is-selected/);
  await expect(page.locator('[data-testid="create-option-card"][data-create-lens="Valuable"]')).toHaveClass(/is-selected/);
  await expect(page.locator('[data-testid="create-option-card"][data-create-lens="Critical"]')).toHaveClass(/is-selected/);
  await expect(page.locator(".create-judgment-panel textarea")).toHaveValue(/build it with Codex/);
  await expect(page.getByTestId("create-evidence-drawer")).toBeVisible();
  await expect(page.getByTestId("yc-artifact-outline")).toContainText(/Product thesis|founder\/builder path/i);
  await captureProof(page, testInfo, "07-return-state");

  await page.getByTestId("create-export-panel").scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Export prompt" })).toBeEnabled({ timeout: 15_000 });
  await page.getByRole("button", { name: "Export prompt" }).click();
  await expect(page.getByTestId("create-export-prompt")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("region", { name: "Next best place" })).toContainText(/Review the exported prompt/);
  await expect(page.getByTestId("create-export-prompt")).toHaveValue(/## Personal Context Used/);
  await expect(page.getByTestId("create-export-prompt")).toHaveValue(/## YC Demo Spec/);
  await expect(page.getByTestId("create-export-prompt")).toHaveValue(/### Product thesis/);
  await expect(page.getByTestId("create-export-prompt")).toHaveValue(/### Data sources/);
  await expect(page.getByTestId("create-export-prompt")).toHaveValue(/## Source \/ Memory Evidence/);
  await expect(page.getByTestId("create-export-prompt")).toHaveValue(/## Selected Option History/);
  await expect(page.getByTestId("create-export-prompt")).toHaveValue(/## Repeated Rejected Directions/);
  await expect(page.getByRole("button", { name: "Copy prompt" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download .md" })).toBeVisible();
  await captureProof(page, testInfo, "08-export");
});

async function captureProof(page, testInfo, name) {
  const proofDir = process.env.PENNY_PROOF_DIR;

  if (!proofDir) {
    return;
  }

  const safeName = `${String(testInfo.repeatEachIndex).padStart(3, "0")}-${name}.png`;
  await fs.mkdir(proofDir, { recursive: true });
  await page.screenshot({ path: path.join(proofDir, safeName), fullPage: true });
}
