/** Renders the native scenario-source browser while preserving stable selector IDs. */
export function renderScenarioSource(): string {
  return `
    <div class="scenario-source" aria-label="Scenario source">
      <div class="scenario-source__tabs" role="group" aria-label="Browse scenario source">
        <button
          id="scenarioPresetsBtn"
          type="button"
          aria-controls="scenarioPresetsPanel"
          aria-pressed="true"
        >Teaching scenarios</button>
        <button
          id="scenarioCatalogBtn"
          type="button"
          aria-controls="scenarioCatalogPanel"
          aria-pressed="false"
        >Catalog systems</button>
      </div>

      <div id="scenarioPresetsPanel" class="scenario-source__panel">
        <label class="inline" for="presetSelect">
          Teaching scenario
          <select id="presetSelect" aria-label="Select preset"></select>
        </label>
        <p id="presetDesc" class="context-description"></p>
        <p class="scenario-source__caption" data-scenario-source-caption="preset">
          The current model uses a teaching scenario.
        </p>
      </div>

      <div id="scenarioCatalogPanel" class="scenario-source__panel" hidden>
        <label class="inline" for="realSystemSelect">
          Catalog system
          <select id="realSystemSelect" aria-label="Select real system"></select>
        </label>
        <p id="realSystemMeta" class="context-description mono"></p>
        <p class="scenario-source__caption" data-scenario-source-caption="catalog">
          A teaching scenario is active. Choosing a catalog system will replace the current model.
        </p>
      </div>
    </div>
  `;
}
