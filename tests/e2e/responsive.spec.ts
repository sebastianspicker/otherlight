import { expect, test } from "@playwright/test";

test("@mobile keeps core navigation and runtime controls operable", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#modeSimulationBtn")).toBeVisible();
  await expect(page.locator("#modeLabBtn")).toBeVisible();
  await expect(page.locator("#btnStart")).toBeVisible();
  await expect(page.locator("#skyCanvas")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("200 percent zoom keeps the runtime workflow reachable", async ({ page }) => {
  // Browser zoom halves the effective CSS viewport. Playwright has no portable
  // page-zoom API, so exercise the equivalent 640px CSS viewport for a 1280px window.
  await page.setViewportSize({ width: 640, height: 900 });
  await page.goto("/");
  await expect(page.locator("#btnStart")).toBeVisible();
  await expect(page.locator("#modeLabBtn")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
