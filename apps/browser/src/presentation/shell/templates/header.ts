/**
 * Renders the header, profile navigation, and workspace actions.
 */
/** Browser file-picker compatibility: the current extension, legacy extension, and plain JSON. */
export const WORKSPACE_FILE_ACCEPT = ".otherlight,.transitlab,application/json";

/**
 * Masthead: identity, the visible profile and mode switch, workspace documents,
 * and a running head that states which kind of evidence is on screen.
 */
export function renderHeaderTemplate(
  _baseUrl = import.meta.env.BASE_URL,
  workspaceActions = renderWorkspaceActions(),
): string {
  return `
    <header class="app-header">
      <div class="masthead">
        <div class="brand-lockup">
          <svg class="brand-mark" viewBox="0 0 40 40" fill="none" aria-hidden="true" focusable="false">
            <circle cx="17" cy="20" r="14" stroke="currentColor" stroke-width="1.5" />
            <circle cx="27" cy="20" r="7" fill="currentColor" />
          </svg>
          <h1>Otherlight</h1>
        </div>

        <div class="workspace-switch">
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
        </div>
        ${workspaceActions}
      </div>

      <p class="running-head">
        <span data-product-profile="education">
          <em>Education preview</em> — a teaching model with stated limits, computed on this device.
        </span>
        <span data-product-profile="scientific" hidden>
          <em>Scientific workspace</em> — a strict V5 boundary for loopback execution or a labelled hosted fixture replay. Never an Education substitute.
        </span>
      </p>
    </header>
  `;
}

/**
 * Compact workspace document controls in the identity band.
 */
export function renderWorkspaceActions(): string {
  return `
      <div class="workspace-actions" data-product-profile="education">
        <button id="workspaceOpenBtn" type="button" aria-controls="workspaceFileInput">Open…</button>
        <button id="workspaceSaveBtn" type="button">Save workspace</button>
        <input id="workspaceFileInput" type="file" accept="${WORKSPACE_FILE_ACCEPT}" hidden />
      </div>
  `;
}
