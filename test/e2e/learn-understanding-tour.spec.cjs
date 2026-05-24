const { test, expect } = require("@playwright/test");
const fs = require("node:fs/promises");
const path = require("node:path");

test.use({ channel: process.env.PENNY_PLAYWRIGHT_CHANNEL || "chrome" });
test.setTimeout(45_000);

test("Learn turns arbitrary source material into a quiet source-to-concept tour", async ({ page }) => {
  const baseUrl = process.env.PENNY_BASE_URL || "http://localhost:3007";

  await page.addInitScript(() => {
    window.localStorage.clear();
  });
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("textbox", { name: /Enter a rough thought for Penny|Ask Penny anything/ })).toBeVisible({
    timeout: 15_000,
  });

  await page.locator(".landing-shortcuts button").filter({ hasText: "Learn" }).click();
  await page
    .getByRole("textbox", { name: /Enter a rough thought for Penny|Ask Penny anything/ })
    .fill(
      "Penny should help founders learn whether a messy pricing memo's customer urgency and product scope are worth saving without turning it into generic advice.",
    );
  await page.getByRole("button", { name: "Send thought" }).click();

  const tour = page.getByTestId("learn-understanding-tour");
  await expect(tour).toBeVisible({ timeout: 30_000 });
  await expect(tour).toContainText("Grounding");
  await expect(tour).toContainText("What changes");
  await expect(tour).toContainText("Can you use it?");
  await expect(tour).toContainText(/current source/i);
  await expect(tour).toContainText(/pricing memo|customer urgency|product scope/i);
  await expect(tour).not.toContainText(/Your turn|Definition|Misconceptions|Good example|Bad example/i);
  await captureProof(page, "learn-understanding-tour");
});

async function captureProof(page, name) {
  const proofDir = process.env.PENNY_PROOF_DIR;

  if (!proofDir) {
    return;
  }

  await fs.mkdir(proofDir, { recursive: true });
  await page.screenshot({ path: path.join(proofDir, `${name}.png`), fullPage: true });
}
