/**
 * Scenario selection, workspace document actions, and readable status feedback.
 * Playback controls live beside the evidence in the main workspace.
 */
import { renderScenarioSource } from "../../scenario/templates/scenarioSource";

/** Context selectors (parameter depth, lab/scenario, catalog) + meta descriptions. */
function renderCommandContext(): string {
  return `
      <div class="command-strip__context">
        <div class="command-strip__source" data-product-mode="simulation">
          ${renderScenarioSource()}
        </div>
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

        <p class="context-description" data-product-mode="lab">
          Choose a planet, exomoon, or binary-star system; predict, observe, test, and export evidence.
        </p>
      </div>
  `;
}

/** Persistent live feedback preserves complete messages and recovery actions. */
function renderStatus(): string {
  return `
      <div id="appStatus" class="app-status" role="status" aria-live="polite" aria-atomic="true">
        <span id="appStatusMessage">Ready. Choose a scenario, then start the simulation or open a guided lab.</span>
        <button id="appRetryBtn" type="button" hidden>Retry last scenario</button>
      </div>
  `;
}

/**
 * Scenario and document toolbar with a separate status line.
 */
export function renderCommandStrip(): string {
  return `
    <section
      class="command-strip context-toolbar"
      aria-label="Scenario and workspace controls"
      data-product-profile="education"
    >
      <details class="experiment-tools" id="scenarioTools">
        <summary>More experiments &amp; scenario settings</summary>
      <div class="command-strip__left">
        ${renderCommandContext()}
      </div>
      </details>
      ${renderStatus()}
    </section>
  `;
}
