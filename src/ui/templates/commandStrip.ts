/**
 * Command strip: scenario context, workspace document actions, status pill, and runtime controls.
 * Quiet Observatory IA — single row under the thin identity header.
 */
import { renderWorkspaceActions } from "./header";
import { renderRuntimeControls } from "./sidebarRuntime";

/** Context selectors (parameter depth, lab/scenario, catalog) + meta descriptions. */
export function renderCommandContext(): string {
  return `
      <div class="command-strip__context">
        <label class="inline" for="uiModeSelect" data-product-mode="simulation">
          Parameter depth
          <select id="uiModeSelect" aria-label="Control level">
            <option value="normal" selected>Essential</option>
            <option value="expert">Advanced</option>
          </select>
        </label>

        <label class="inline" for="simModeSelect" data-product-mode="lab">
          Lab system
          <select id="simModeSelect" aria-label="Select lab system"></select>
        </label>

        <label class="inline" for="presetSelect" data-product-mode="simulation">
          Teaching scenario
          <select id="presetSelect" aria-label="Select preset"></select>
        </label>

        <label class="inline" for="realSystemSelect" data-product-mode="simulation">
          Catalog system
          <select id="realSystemSelect" aria-label="Select real system"></select>
        </label>

        <p id="presetDesc" class="context-description" data-product-mode="simulation"></p>
        <p id="realSystemMeta" class="context-description mono" data-product-mode="simulation"></p>
        <p class="context-description" data-product-mode="lab">
          Choose a planet, exomoon, or binary-star system; predict, observe, test, and export evidence.
        </p>
      </div>
  `;
}

/** Compact status pill host — same stable IDs, no full-width banner above main. */
export function renderStatusPill(): string {
  return `
      <div id="appStatus" class="app-status status-pill" role="status" aria-live="polite" aria-atomic="true">
        <span id="appStatusMessage">Ready. Choose a scenario, then start the simulation or open a guided lab.</span>
        <button id="appRetryBtn" type="button" hidden>Retry last scenario</button>
      </div>
  `;
}

/**
 * Full command strip: left context + workspace document actions, right status + runtime.
 * Uses command-strip as primary class; keeps context-toolbar for gradual CSS migration.
 */
export function renderCommandStrip(): string {
  return `
    <section
      class="command-strip context-toolbar"
      aria-label="Scenario and runtime controls"
      data-product-profile="education"
    >
      <div class="command-strip__left">
        ${renderCommandContext()}
        ${renderWorkspaceActions()}
      </div>
      <div class="command-strip__right runtime-toolbar" aria-label="Runtime">
        ${renderStatusPill()}
        ${renderRuntimeControls()}
      </div>
    </section>
  `;
}
