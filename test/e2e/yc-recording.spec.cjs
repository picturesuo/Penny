const { test, expect } = require("@playwright/test");

test.use({ channel: process.env.PENNY_PLAYWRIGHT_CHANNEL || "chrome" });
test.setTimeout(60_000);

test("YC recording path: landing fixture to Create, Learn, and export", async ({ page }, testInfo) => {
  const baseUrl = process.env.PENNY_BASE_URL || "http://localhost:3007";
  const scopeId = `yc-e2e-${testInfo.workerIndex}-${testInfo.repeatEachIndex}-${Date.now()}`;

  await page.addInitScript((scope) => {
    window.localStorage.clear();

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
  });

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("landing-build-with-penny")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("landing-build-with-penny").click();

  await expect(page.getByTestId("create-workspace")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("create-brain-context")).toHaveAttribute("data-create-context", "using-brain", {
    timeout: 15_000,
  });
  await expect(page.getByTestId("create-option-card")).toHaveCount(5, { timeout: 30_000 });
  await expect(page.locator('[data-testid="create-option-card"][data-create-lens="Personal"]')).toBeVisible();
  await expect(page.locator('[data-testid="create-option-card"][data-create-lens="Valuable"]')).toBeVisible();
  await expect(page.locator('[data-testid="create-option-card"][data-create-lens="Critical"]')).toBeVisible();

  await page.locator('[data-create-lens="Personal"] [data-testid="create-option-details-button"]').click();
  await expect(page.getByTestId("create-evidence-drawer")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("create-evidence-drawer")).toContainText(/Memories used|Sources used/);

  for (const lens of ["Personal", "Valuable", "Critical"]) {
    await page.locator(`[data-testid="create-option-card"][data-create-lens="${lens}"] .create-option-select-button`).click();
  }

  await page
    .locator(".create-judgment-panel textarea")
    .fill("Keep this founder/builder path: memory-native workbench, human judgment, and buildable specs before coding agents.");
  await page.getByRole("button", { name: "Update artifact" }).click();
  await expect(page.getByTestId("create-artifact-panel")).toContainText(/Personal|Valuable|Critical/, { timeout: 30_000 });
  await expect(page.getByTestId("create-artifact-panel")).toContainText(/founder\/builder path|memory-native workbench/i);

  await page.getByTestId("create-learn-this-button").click();
  await expect(page.getByTestId("learn-back-to-create")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("heading", { name: "Explain simply" })).toBeVisible();
  await expect(page.getByRole("button", { name: "2 Show worked example" })).toBeVisible();
  await expect(page.getByRole("button", { name: "3 Show how this applies to my artifact" })).toBeVisible();

  await page.getByTestId("learn-back-to-create").click();
  await expect(page.getByTestId("create-workspace")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-testid="create-option-card"][data-create-lens="Personal"]')).toHaveClass(/is-selected/);
  await expect(page.locator('[data-testid="create-option-card"][data-create-lens="Valuable"]')).toHaveClass(/is-selected/);
  await expect(page.locator('[data-testid="create-option-card"][data-create-lens="Critical"]')).toHaveClass(/is-selected/);
  await expect(page.locator(".create-judgment-panel textarea")).toHaveValue(/memory-native workbench/);

  await page.getByTestId("create-export-panel").scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "Export prompt" })).toBeEnabled({ timeout: 15_000 });
  await page.getByRole("button", { name: "Export prompt" }).click();
  await expect(page.getByTestId("create-export-prompt")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("create-export-prompt")).toHaveValue(/## Personal Context Used/);
});
