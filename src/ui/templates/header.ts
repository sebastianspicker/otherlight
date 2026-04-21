export function renderHeaderTemplate(): string {
  return `
    <header class="app-header">
      <h1>Transit-Exomoon-Lightcurve-Simulator</h1>
      <p class="help">
        Conventions: radii and distances in metres (SI), times in seconds, angles in degrees (UI) / radians
        (internal).
      </p>

      <details class="help">
        <summary>Measurement pipeline (Plot)</summary>
        <p class="help">
          <b>physical</b>: idealised instantaneous flux from geometric occultation.<br />
          <b>measured</b>: optional boxcar smearing (cadence + sub-samples) plus optional instrument noise /
          systematics with persistent state.
        </p>
      </details>

      <div class="help">
        <label class="inline" for="productModeSelect">
          Product mode
          <select id="productModeSelect" aria-label="Select product mode">
            <option value="simulation" selected>Simulation</option>
            <option value="lab">Lab</option>
          </select>
        </label>

        <label class="inline" for="uiModeSelect" data-product-mode="simulation">
          UI mode
          <select id="uiModeSelect" aria-label="Select UI mode">
            <option value="normal" selected>Normal</option>
            <option value="expert">Expert</option>
          </select>
        </label>

        <label class="inline" for="simModeSelect" data-product-mode="lab">
          Lab type
          <select id="simModeSelect" aria-label="Select lab type">
            <option value="preset-lab" selected>Transit / exomoon lab</option>
            <option value="binary-lab">Binary black-box lab</option>
          </select>
        </label>

        <label class="inline" for="runtimeModeSelect" data-ui-tier="expert" data-product-mode="simulation">
          Runtime mode
          <select id="runtimeModeSelect" aria-label="Select runtime mode">
            <option value="realtime" selected>realtime</option>
            <option value="reference">reference (deterministic)</option>
          </select>
        </label>

        <label class="inline" for="presetSelect" data-product-mode="simulation">
          Preset
          <select id="presetSelect" aria-label="Select preset"></select>
        </label>
        <p id="presetDesc" class="help" data-product-mode="simulation"></p>

        <label class="inline" for="realSystemSelect" data-product-mode="simulation">
          Real systems
          <select id="realSystemSelect" aria-label="Select real system"></select>
        </label>
        <p id="realSystemMeta" class="help" data-product-mode="simulation"></p>

        <p class="help" data-product-mode="lab">
          Lab mode focuses on guided lessons and black-box reasoning. Simulation mode is for presets and
          real systems without the didactic scaffolding.
        </p>
      </div>
    </header>
  `;
}
