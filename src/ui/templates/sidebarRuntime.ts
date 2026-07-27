/**
 * Owns sidebar Runtime support within the ui layer. Keeps DOM-facing behavior separate from application orchestration.
 */

/** Runtime action buttons, speed, calculation mode, and expert view controls. */
export function renderRuntimeControls(): string {
  return `
      <div class="runtime-actions">
        <button id="btnStart" type="button">Start</button>
        <button id="btnReset" type="button">Reset time</button>
        <button id="btnClearLC" type="button">Clear light curve</button>
        <button id="btnUndoClearLC" type="button" hidden>Undo clear</button>
      </div>

      <div class="runtime-fields">
        <label class="inline" for="timeSpeed">
          Time speed
          <input id="timeSpeed" type="range" min="0" max="2500" step="10" value="800" aria-label="Time speed" />
          <span id="timeSpeedVal" class="mono">800</span><span aria-hidden="true">×</span>
        </label>
        <label class="inline" for="timeSpeedMultiplier">
          Speed boost
          <select id="timeSpeedMultiplier" aria-label="Select time speed multiplier">
            <option value="1" selected>1x</option>
            <option value="2">2x</option>
            <option value="4">4x</option>
            <option value="8">8x</option>
            <option value="16">16x</option>
          </select>
        </label>
        <label class="inline" for="runtimeModeSelect" data-ui-tier="expert" data-product-mode="simulation">
          Calculation mode
          <select id="runtimeModeSelect" aria-label="Calculation mode">
            <option value="realtime" selected>Interactive</option>
            <option value="reference">Reference (deterministic)</option>
          </select>
        </label>
      </div>

      <details class="runtime-view" data-ui-tier="expert">
        <summary>View controls</summary>
        <div class="row">
        <label class="inline" for="viewZoomEnabled"><input id="viewZoomEnabled" type="checkbox" /> Enable manual zoom</label>
        <button id="btnZoomOut" type="button" disabled>Zoom out</button>
        <button id="btnZoomIn" type="button" disabled>Zoom in</button>
        <button id="btnZoomReset" type="button" disabled>Reset zoom</button>
        <span class="mono">zoom <span id="zoomVal">1.0x</span></span>
        </div>
        <div class="row">
        <label class="inline" for="viewAutoFit"><input id="viewAutoFit" type="checkbox" /> Auto-fit zoom</label>
        </div>
      </details>
  `;
}

/**
 * Standalone runtime toolbar (legacy export for imports/tests).
 * Prefer {@link renderCommandStrip} from commandStrip.ts for Quiet Observatory IA.
 */
export function renderRuntimeToolbar(): string {
  return `
    <section class="runtime-toolbar" aria-labelledby="runtimeToolbarTitle">
      <h2 id="runtimeToolbarTitle">Runtime</h2>
      ${renderRuntimeControls()}
    </section>
  `;
}

export function renderReadouts(): string {
  return `
      <div class="runtime-readouts" aria-label="Current simulation state">
        <span><span class="readout-label">Time</span> <span class="mono"><span id="tVal">0.0</span> s</span></span>
        <span><span class="readout-label">Flux</span> <span id="fluxVal" class="mono">1.000000</span></span>
        <span><span class="readout-label">Occulters</span> <span id="nOccultersVal" class="mono"></span></span>
        <span><span class="readout-label">Planet visible</span> <span id="vPlanetVal" class="mono"></span></span>
        <span><span class="readout-label">Moon visible</span> <span id="vMoonVal" class="mono"></span></span>
        <span><span class="readout-label">O-C</span> <span id="timingHistoryVal" class="mono"></span></span>
        <span><span class="readout-label">Series</span> <span id="plotModeVal" class="mono"></span></span>
        <span id="warnVal" class="runtime-warning" role="status" aria-live="polite" aria-atomic="true"></span>
      </div>
  `;
}

export function renderPlotControls(): string {
  return `
      <div class="row">
        <label class="inline" for="plotMode">
          Plot mode
          <select id="plotMode">
            <option value="physical" selected>physical</option>
            <option value="measured">measured</option>
          </select>
        </label>

        <label class="inline" for="plotTrackingMode">
          Plot tracking
          <select id="plotTrackingMode" aria-label="Select light curve tracking mode">
            <option value="fixed">fixed</option>
            <option value="dynamic" selected>dynamic</option>
            <option value="live">live</option>
          </select>
        </label>

        <label
          class="inline"
          for="clampSmearedFlux"
          data-ui-tier="expert"
          data-tooltip="Warning: clamping to [0, 1] is only valid for normalised transit signals. With additive models (phase curves, stellar variability), flux can exceed 1.0; clamping would produce unphysical truncation."
        >
          Clamp smeared flux
          <input id="clampSmearedFlux" type="checkbox" />
        </label>
      </div>
  `;
}

export function renderOcSection(): string {
  return `
      <section class="panel" id="ocSection" data-ui-tier="expert">
        <h3>O-C history</h3>
        <div class="row">
          <label class="inline">
            Body
            <select id="ocBodySelect" aria-label="O-C body">
              <option value="planet" selected>planet</option>
              <option value="moon">moon</option>
            </select>
          </label>
          <label class="inline">
            Unit
            <select id="ocUnitSelect" aria-label="O-C unit">
              <option value="s" selected>s</option>
              <option value="ms">ms</option>
            </select>
          </label>
          <label class="inline">
            Trend
            <select id="ocTrendModeSelect" aria-label="O-C trend mode">
              <option value="raw" selected>raw</option>
              <option value="fit">fit overlay</option>
              <option value="detrended">detrended</option>
            </select>
          </label>
          <button id="ocExportBtn" type="button">Export CSV</button>
          <button id="ocClearBtn" type="button">Clear history</button>
          <button id="ocUndoClearBtn" type="button" hidden>Undo clear</button>
        </div>
        <figure class="scientific-figure scientific-figure--compact">
          <canvas id="ocCanvas" width="960" height="220" role="img" aria-label="O-C history plot" aria-describedby="ocStatsVal ocFitVal"></canvas>
          <figcaption>
            <p id="ocStatsVal" class="help mono">No timing events recorded yet.</p>
            <p id="ocFitVal" class="help mono"></p>
          </figcaption>
        </figure>
      </section>
  `;
}
