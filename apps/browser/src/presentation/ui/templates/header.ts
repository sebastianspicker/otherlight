/**
 * Owns header support within the ui layer. Keeps DOM-facing behavior separate from application orchestration.
 */

/** Browser file-picker compatibility: the current extension, legacy extension, and plain JSON. */
export const WORKSPACE_FILE_ACCEPT = ".otherlight,.transitlab,application/json";

/**
 * Thin identity band: brand, calculation profile, and education mode tabs only.
 * Workspace open/save and scenario/runtime controls live in the command strip.
 */
export function renderHeaderTemplate(): string {
  return `
    <header class="app-header">
      <div class="product-heading">
        <div class="brand-lockup">
          <img class="brand-mark" src="/brand/otherlight-signal-eclipse.svg" alt="" aria-hidden="true" />
          <div>
            <h1>Otherlight</h1>
            <p class="brand-descriptor">Exoplanet learning &amp; scientific modeling</p>
          </div>
        </div>
        <p class="brand-tagline">Exoplanet learning &amp; scientific modeling</p>
      </div>

      <nav class="profile-nav" aria-label="Calculation profile">
        <button id="profileEducationBtn" class="profile-nav__item" type="button" data-profile="education" aria-current="page">
          Education
        </button>
        <button id="profileScientificBtn" class="profile-nav__item" type="button" data-profile="scientific" aria-current="false">
          Scientific
        </button>
        <label class="sr-only" for="productProfileSelect">Calculation profile</label>
        <select id="productProfileSelect" class="sr-only" aria-hidden="true" tabindex="-1">
          <option value="education" selected>Education</option>
          <option value="scientific">Scientific</option>
        </select>
      </nav>

      <nav class="mode-nav" aria-label="Education workspace" data-product-profile="education">
        <button id="modeSimulationBtn" class="mode-nav__item" type="button" data-mode="simulation" aria-current="page">
          Simulation
        </button>
        <button id="modeLabBtn" class="mode-nav__item" type="button" data-mode="lab">
          Guided Labs
        </button>
        <label class="sr-only" for="productModeSelect">Workspace</label>
        <select id="productModeSelect" class="sr-only" aria-hidden="true" tabindex="-1">
            <option value="simulation" selected>Simulation</option>
            <option value="lab">Guided Labs</option>
        </select>
      </nav>
    </header>
  `;
}

/**
 * Compact workspace open/save controls.
 * Placed in the command strip (not the identity band) so the header stays thin.
 */
export function renderWorkspaceActions(): string {
  return `
      <div class="workspace-actions" data-product-profile="education">
        <button id="workspaceOpenBtn" type="button" aria-controls="workspaceFileInput">Open workspace</button>
        <button id="workspaceSaveBtn" type="button">Save workspace</button>
        <input id="workspaceFileInput" type="file" accept="${WORKSPACE_FILE_ACCEPT}" hidden />
      </div>
  `;
}
