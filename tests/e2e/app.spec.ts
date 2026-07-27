/** Exercises the complete browser workflow across supported desktop engines. */

import { expect, test, type Page } from "@playwright/test";

async function waitForAppReady(page: Page): Promise<void> {
  await page.goto("/");
  await waitForLoadedApp(page);
}

async function waitForLoadedApp(page: Page): Promise<void> {
  await expect(page.locator("#app")).toBeVisible();
  await expect(page.locator("#presetSelect")).toBeEnabled();
  await expect
    .poll(() => optionCount(page, "#presetSelect"), { message: "preset options are populated" })
    .toBeGreaterThan(1);
  await waitForScenarioIdle(page);
  await expect
    .poll(
      async () => ({
        sky: await canvasHasPaint(page, "#skyCanvas"),
        lightCurve: await canvasHasPaint(page, "#lcCanvas"),
      }),
      { timeout: 20_000 },
    )
    .toEqual({ sky: true, lightCurve: true });
}

async function waitForScenarioIdle(page: Page): Promise<void> {
  await expect(page.locator("#main")).toHaveAttribute("aria-busy", "false");
}

async function optionCount(page: Page, selector: string): Promise<number> {
  return page.locator(selector).evaluate((node) => {
    if (!(node instanceof HTMLSelectElement)) return 0;
    return node.options.length;
  });
}

async function firstSelectValue(page: Page, selector: string): Promise<string> {
  return page.locator(selector).evaluate((node) => {
    if (!(node instanceof HTMLSelectElement)) return "";
    return Array.from(node.options).find((option) => option.value)?.value ?? "";
  });
}

async function readNumericText(page: Page, selector: string): Promise<number> {
  const text = await page.locator(selector).textContent();
  return Number(text);
}

async function canvasHasPaint(page: Page, selector: string): Promise<boolean> {
  return page.locator(selector).evaluate((node) => {
    if (!(node instanceof HTMLCanvasElement)) return false;
    const context = node.getContext("2d");
    if (!context || node.width <= 0 || node.height <= 0) return false;

    const pixels = context.getImageData(0, 0, node.width, node.height).data;
    for (let alphaOffset = 3; alphaOffset < pixels.length; alphaOffset += 4) {
      if (pixels[alphaOffset] !== 0) return true;
    }
    return false;
  });
}

test("loads the shipped simulation and responds to start/reset controls", async ({ page }) => {
  await waitForAppReady(page);

  await page.locator("#btnStart").click();
  await expect(page.locator("#btnStart")).toHaveText("Pause");
  await expect.poll(() => readNumericText(page, "#tVal")).toBeGreaterThan(0);

  await page.locator("#btnReset").click();
  await expect(page.locator("#btnStart")).toHaveText("Start");
  await expect(page.locator("#tVal")).toHaveText("0.0");
});

test("applies a committed real-system snapshot entry without external services", async ({ page }) => {
  await waitForAppReady(page);

  const realSystemId = await firstSelectValue(page, "#realSystemSelect");
  expect(realSystemId).not.toBe("");

  await page.locator("#realSystemSelect").selectOption(realSystemId);
  await waitForScenarioIdle(page);

  await expect(page.locator("#realSystemMeta")).toContainText("Source:");
  await expect(page.locator("#realSystemMeta")).toContainText("Host:");
  await expect(page.locator("#tVal")).toHaveText("0.0");
});

test("keeps Binary Lab black-boxed until the learner commits a hypothesis", async ({ page }) => {
  await waitForAppReady(page);

  await page.locator("#modeLabBtn").click();
  await waitForScenarioIdle(page);
  await expect(page.locator("#simModeSelect option")).toHaveText([
    "Planet and exomoon systems",
    "Binary-star systems",
  ]);
  await page.locator("#simModeSelect").selectOption("binary-lab");
  await waitForScenarioIdle(page);

  await expect(page.locator("#didBinaryControls")).toBeVisible();
  await expect(page.locator("#binaryLabParamNotice")).toBeVisible();
  await expect(page.locator("#paramForm")).toBeHidden();
  await expect(page.locator("#skyBlackboxHint")).toBeVisible();
  await expect(page.locator("#skyCanvas")).toHaveCSS("visibility", "hidden");
  await expect(page.locator("#didRevealSkyBtn")).toBeDisabled();

  await page.locator("#didHypothesisSelect").selectOption("primary-eclipse-deepest");
  await expect(page.locator("#didRevealSkyBtn")).toBeEnabled();

  await page.locator("#didRevealSkyBtn").click();
  await expect(page.locator("#skyCanvas")).toHaveCSS("visibility", "visible");
  await expect(page.locator("#skyBlackboxHint")).toBeHidden();
});

test("rejects invalid advanced education input without replacing it", async ({ page }) => {
  await waitForAppReady(page);
  await page.locator("#uiModeSelect").selectOption("expert");
  const radius = page.locator("#planetR");
  await radius.fill("");
  await page.locator("#btnApplyParams").click();

  await expect(radius).toHaveValue("");
  await expect(radius).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#paramErrorSummary")).toBeVisible();
  await expect(page.locator("#paramErrorSummary")).toContainText("must be fixed");
});

test("switches explicitly between education and fail-closed scientific workspaces", async ({ page }) => {
  await page.route("http://127.0.0.1:8765/v1/capabilities", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({
        schemaVersion: "v5",
        serviceVersion: "0.2.0-alpha.1",
        generatedAt: "2026-07-15T12:00:00Z",
        supportedJobKinds: [],
        supportedOutputs: [],
        supportedSamplers: [],
        unavailableModelIds: ["radial-velocity"],
      }),
    });
  });
  await waitForAppReady(page);
  await page.locator("#btnStart").click();
  await expect(page.locator("#btnStart")).toHaveText("Pause");

  await page.locator("#profileScientificBtn").click();

  await expect(page.locator("#scientificWorkspace")).toBeVisible();
  await expect(page.locator('[data-product-profile="education"]').last()).toBeHidden();
  await expect(page.locator("#btnStart")).toHaveText("Start");
  await expect(page.locator("#scienceCapabilityStatus")).toHaveText(
    "Connected, required capability unavailable",
  );
  await expect(page.locator("#scienceRunBtn")).toBeDisabled();
  await expect(page.locator("#profileScientificBtn")).toHaveAttribute("aria-current", "page");
  await expect(page).toHaveURL(/profile=scientific/);

  await page.locator("#profileEducationBtn").click();
  await expect(page.locator("#scientificWorkspace")).toBeHidden();
  await expect(page.locator('[data-product-profile="education"]').last()).toBeVisible();
  await expect(page.locator("#profileEducationBtn")).toHaveAttribute("aria-current", "page");
  await expect(page).toHaveURL(/profile=education/);
});

test("exposes figures and status as semantic non-canvas equivalents", async ({ page }) => {
  await waitForAppReady(page);

  await expect(page.locator("figure")).toHaveCount(3);
  await expect(page.locator("#skyCanvas")).toHaveAttribute("aria-describedby", "skySummary");
  await expect(page.locator("#lcCanvas")).toHaveAttribute("aria-describedby", "lcSummary");
  await expect(page.locator("#skySummary")).toContainText("seconds");
  await expect(page.locator("#lcSummary")).toContainText("samples");
  await expect(page.locator("#appStatus")).toHaveAttribute("role", "status");
});

test("shares stable context and restores it with browser history", async ({ page }) => {
  await waitForAppReady(page);
  await page.locator("#modeLabBtn").click();
  await waitForScenarioIdle(page);
  await expect(page).toHaveURL(/mode=lab/);
  await expect(page.locator("#modeLabBtn")).toHaveAttribute("aria-current", "page");

  await page.goBack();
  await waitForScenarioIdle(page);
  await expect(page.locator("#modeSimulationBtn")).toHaveAttribute("aria-current", "page");
  await expect(page).toHaveURL(/mode=simulation/);
});

test("repairs invalid shared context and reports the fallback", async ({ page }) => {
  await page.goto("/?mode=bogus&ui=expert&scenario=%3Cbad%3E");
  await waitForLoadedApp(page);

  await expect(page.locator("#modeSimulationBtn")).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#uiModeSelect")).toHaveValue("normal");
  await expect(page.locator("#appStatusMessage")).toContainText("corrected");
  await expect(page).toHaveURL(/mode=simulation/);
  await expect(page).toHaveURL(/ui=essential/);
  await expect(page).toHaveURL(/scenario=default/);
});

test("repairs unknown catalog IDs restored through browser history", async ({ page }) => {
  await waitForAppReady(page);
  await page.locator("#presetSelect").selectOption("kepler-planet-only");
  await waitForScenarioIdle(page);

  await page.evaluate(() => {
    window.history.pushState(
      null,
      "",
      "/?mode=lab&ui=essential&source=preset&scenario=unknown-scenario&lab=preset&lesson=unknown-lesson&runtime=interactive",
    );
    window.dispatchEvent(new PopStateEvent("popstate"));
  });

  await waitForScenarioIdle(page);
  await expect(page.locator("#presetSelect")).toHaveValue("default");
  await expect(page.locator("#didLessonSelect")).not.toHaveValue("unknown-lesson");
  await expect(page.locator("#appStatusMessage")).toContainText("corrections");
  await expect(page).toHaveURL(/scenario=default/);
  await expect(page).not.toHaveURL(/unknown-lesson/);
});

test("moves focus to the phase heading after explicit lab navigation", async ({ page }) => {
  await waitForAppReady(page);
  await page.locator("#modeLabBtn").click();
  await waitForScenarioIdle(page);

  await page.locator("#didNextBtn").click();

  await expect(page.locator("#didPhaseTitle")).toBeFocused();
  await expect(page.locator("#didAnnouncement")).toContainText("Moved to");
});

test("guards unapplied advanced edits before a workspace change", async ({ page }) => {
  await waitForAppReady(page);
  await page.locator("#uiModeSelect").selectOption("expert");
  await page.locator("#planetR").fill("71000000");
  await expect(page.locator("#paramDirtyState")).toBeVisible();

  await page.locator("#modeLabBtn").click();
  await expect(page.locator("#dirtyChangeDialog")).toBeVisible();
  await page.locator("#dirtyKeepEditingBtn").click();
  await expect(page.locator("#modeSimulationBtn")).toHaveAttribute("aria-current", "page");

  await page.locator("#modeLabBtn").click();
  await page.locator("#dirtyDiscardBtn").click();
  await waitForScenarioIdle(page);
  await expect(page.locator("#modeLabBtn")).toHaveAttribute("aria-current", "page");
});

test("restores a cleared light-curve history", async ({ page }) => {
  await waitForAppReady(page);
  await expect(page.locator("#lcSummary")).toContainText("samples");
  await page.locator("#btnClearLC").click();
  await expect(page.locator("#lcSummary")).toContainText("cleared");
  await expect(page.locator("#btnUndoClearLC")).toBeVisible();
  await page.locator("#btnUndoClearLC").click();
  await expect(page.locator("#lcSummary")).toContainText("restored light-curve samples");
});
