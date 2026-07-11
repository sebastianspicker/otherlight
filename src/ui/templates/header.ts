export function renderHeaderTemplate(): string {
  return `
    <header class="app-header">
      <div class="product-heading">
        <h1>Transit Light-Curve Lab</h1>
        <p>Explore how orbital geometry becomes measured light.</p>
      </div>

      <nav class="mode-nav" aria-label="Primary workspace">
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

      <section class="context-toolbar" aria-label="Current context">
        <label class="inline" for="uiModeSelect" data-product-mode="simulation">
          Controls
          <select id="uiModeSelect" aria-label="Control level">
            <option value="normal" selected>Essential</option>
            <option value="expert">Advanced</option>
          </select>
        </label>

        <label class="inline" for="simModeSelect" data-product-mode="lab">
          Lab type
          <select id="simModeSelect" aria-label="Select lab type">
            <option value="preset-lab" selected>Transit / exomoon lab</option>
            <option value="binary-lab">Binary eclipse lab</option>
          </select>
        </label>

        <label class="inline" for="presetSelect" data-product-mode="simulation">
          Preset scenario
          <select id="presetSelect" aria-label="Select preset"></select>
        </label>

        <label class="inline" for="realSystemSelect" data-product-mode="simulation">
          Committed real system
          <select id="realSystemSelect" aria-label="Select real system"></select>
        </label>
        <p id="presetDesc" class="context-description" data-product-mode="simulation"></p>
        <p id="realSystemMeta" class="context-description mono" data-product-mode="simulation"></p>
        <p class="context-description" data-product-mode="lab">
          Predict, observe, test a hypothesis, and export your evidence.
        </p>
      </section>
    </header>
  `;
}
