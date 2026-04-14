import { expect, test } from "@playwright/test";
import { installMockMnemoVaultWorkspace } from "./fixtures/mock-file-system";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(installMockMnemoVaultWorkspace);
});

test("captures graph view before and after hiding operational nodes", async ({ page }) => {
  await page.goto("/app");

  await page.getByRole("button", { name: "Graph" }).click();
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByRole("button", { name: "Hide index/log" })).toBeVisible();

  await page.screenshot({
    path: "test-results/graph-default.png",
    fullPage: true,
  });

  await page.getByRole("button", { name: "Hide index/log" }).click();
  await expect(page.getByRole("button", { name: "Show index/log" })).toBeVisible();

  await page.screenshot({
    path: "test-results/graph-hide-operational.png",
    fullPage: true,
  });
});
