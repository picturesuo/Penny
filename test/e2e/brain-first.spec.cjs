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
test.setTimeout(90_000);

test("Brain-first loop reaches Create, Learn, and export", async ({ page }, testInfo) => {
  const baseUrl = process.env.PENNY_BASE_URL || "http://localhost:3007";
  const scopeId = `brain-first-${testInfo.workerIndex}-${Date.now()}`;

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
  await captureProof(page, testInfo, "01-landing");
  await page.getByRole("button", { name: "Start with your Brain" }).click();
  await expect(page.locator(".brain-workspace-shell")).toBeVisible({ timeout: 15_000 });

  await page.getByPlaceholder("Write a quick note.").fill("Brain-first test quick note for Create memory.");
  await page.getByRole("button", { name: "Send quick note" }).click();
  await expect(page.locator(".brain-quick-list .brain-quick-note").first()).toContainText("Brain-first test quick note", {
    timeout: 10_000,
  });
  await page.locator(".brain-quick-list .brain-quick-note .quick-note-open").first().click();
  await page.getByRole("button", { name: "Save to Brain" }).click();
  await expect(page.getByText("Quick note added to Brain")).toBeVisible({ timeout: 10_000 });
  await captureProof(page, testInfo, "02-quick-note-saved");
  await page.getByRole("button", { name: "All notes" }).click();

  await page.getByRole("button", { name: "New Document" }).click();
  await expect(page.locator(".brain-workspace-shell")).toBeVisible();
  await expect(page.locator("#brainDocumentSeed")).toBeFocused();
  await page.locator("#brainDocumentSeed").fill("A controllable AI thinking instrument should turn vague ideas into durable build specs.");
  await page.getByLabel("Brain document library").getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("region", { name: "Brain document" })).toBeVisible({ timeout: 30_000 });
  await captureProof(page, testInfo, "03-document-created");
  await page.getByRole("button", { name: "All docs" }).click();
  await expect(page.getByLabel("Brain document library")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Add Folder is not in this demo yet" })).toBeDisabled();

  await page.getByLabel("Source label").fill("Brain-first imported context");
  await page.getByPlaceholder(/Paste notes/).fill(
    "I prefer Penny to be a controllable thinking instrument with memory, explicit judgment, and buildable exports.",
  );
  await page.getByRole("button", { name: /Import to Brain/ }).click();
  await expect(page.getByText("Last import completed")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Use this Brain to create something" })).toBeVisible();
  await captureProof(page, testInfo, "04-imported-brain-profile");
  await page.getByRole("button", { name: "Use this Brain to create something" }).click();

  await expect(page.getByTestId("create-workspace")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("create-brain-context")).toHaveAttribute("data-create-context", "using-brain");
  await expect(page.getByTestId("yc-demo-canvas")).toContainText("Brain-first imported context");
  await page.getByRole("textbox", { name: "Rough idea" }).fill("Use my Brain context to design Penny's real Create loop.");
  await page.getByRole("button", { name: "Show 5 directions" }).click();
  await expect(page.getByTestId("create-option-card")).toHaveCount(5, { timeout: 20_000 });
  await captureProof(page, testInfo, "05-create-directions");
  await page.locator('[data-testid="create-option-card"][data-create-lens="Personal"] .create-option-select-button').click();
  await page.locator('[data-testid="create-option-card"][data-create-lens="Critical"] .create-option-select-button').click();
  await expect(page.getByTestId("yc-demo-canvas")).toContainText("Selected Personal + Critical");
  await page.locator('[data-testid="create-option-card"][data-create-lens="Personal"] [data-testid="create-option-details-button"]').click();
  await expect(page.getByTestId("create-evidence-drawer")).toContainText(/Memories used|Sources used|Evidence used/);
  await page.locator(".create-judgment-panel textarea").fill("Keep the artifact source-grounded and practical.");
  await captureProof(page, testInfo, "06-selections-evidence-comment");
  await page.getByRole("button", { name: /Update artifact|Update Idea Spec/ }).click();
  await expect(page.getByTestId("create-artifact-panel")).toContainText(/source-grounded|Personal|Critical/i, {
    timeout: 20_000,
  });
  await captureProof(page, testInfo, "07-artifact");

  await page.getByTestId("create-learn-this-button").click();
  await expect(page.getByRole("heading", { name: "Explain simply" })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /3 Show how this applies to my artifact|3 Apply to my artifact/ }).click();
  await expect(page.getByRole("heading", { name: /Show how this applies to my artifact|Apply to my artifact/ })).toBeVisible();
  await captureProof(page, testInfo, "08-learn-applies");
  await page.getByTestId("learn-back-to-create").click();
  await expect(page.locator('[data-testid="create-option-card"][data-create-lens="Personal"]')).toHaveClass(/is-selected/);
  await expect(page.locator(".create-judgment-panel textarea")).toHaveValue(/source-grounded/);
  await captureProof(page, testInfo, "09-back-to-create");

  await page.getByTestId("create-export-panel").scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "Export prompt" }).click();
  await expect(page.getByTestId("create-export-prompt")).toHaveValue(/## Personal Context Used|## Product Goal/i, {
    timeout: 15_000,
  });
  await expect(page.getByTestId("yc-demo-canvas")).toContainText(/(?:Artifact\/export|Export).*\.md/s);
  await captureProof(page, testInfo, "10-export");

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("create-workspace")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("create-brain-context")).toHaveAttribute("data-create-context", "using-brain");
  await expect(page.getByRole("textbox", { name: "Rough idea" })).toHaveValue(
    "Use my Brain context to design Penny's real Create loop.",
  );
  await expect(page.getByTestId("yc-demo-canvas")).toContainText("Brain-first imported context");
  await expect(page.getByTestId("yc-demo-canvas")).toContainText("Selected Personal + Critical");
  await expect(page.locator('[data-testid="create-option-card"][data-create-lens="Personal"]')).toHaveClass(/is-selected/);
  await expect(page.locator('[data-testid="create-option-card"][data-create-lens="Critical"]')).toHaveClass(/is-selected/);
  await expect(page.locator(".create-judgment-panel textarea")).toHaveValue(/source-grounded/);
  await expect(page.getByTestId("create-artifact-panel")).toContainText(/source-grounded|Personal|Critical/i);
  await expect(page.getByTestId("create-export-prompt")).toHaveValue(/## Personal Context Used|## Product Goal/i);
  await expect(page.getByTestId("yc-demo-canvas")).toContainText(/(?:Artifact\/export|Export).*\.md/s);
  await captureProof(page, testInfo, "11-refresh-restored");
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
