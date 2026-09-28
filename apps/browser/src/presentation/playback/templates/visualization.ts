/**
 * Renders the visualization template.
 */
import { renderReadouts, renderRuntimeToolbar } from "./sidebarRuntime";

export function renderVisualizationTemplate(): string {
  return `
    <section class="panel vizStack" aria-label="Education simulation figures">
      <figure class="scientific-figure sky-figure">
        <div class="figure-heading sr-only">
          <h2>Sky-plane geometry</h2>
          <span class="figure-key">Observer view</span>
        </div>
        <div class="plate">
          <p class="plate__label" aria-hidden="true"><span>Plate 1</span><span>Sky plane · observer view</span></p>
          <canvas id="skyCanvas" width="960" height="540" role="img" aria-label="Sky-plane geometry" aria-describedby="skySummary"></canvas>
        </div>
        <figcaption id="skySummary">The star is centered. Geometry details will appear when the scenario is ready.</figcaption>
        ${renderRuntimeToolbar()}
        <details class="figure-diagnostics"><summary>Simulation details</summary>
        ${renderReadouts()}
        <p id="skyBlackboxHint" class="help" hidden>
          Black-box mode active: only the light curve is visible. Select a hypothesis and click “Reveal sky”
          to see the orbital geometry.
        </p>

        <details class="help" data-ui-tier="expert">
          <summary>Debug overlay</summary>
          <div class="grid">
            <label class="inline" for="dbgEnabled">Enabled <input id="dbgEnabled" type="checkbox" /></label>
            <label class="inline" for="dbgShowObserverDir"
              >Observer dir <input id="dbgShowObserverDir" type="checkbox" checked
            /></label>
            <label class="inline" for="dbgShowOcculters"
              >Occulters <input id="dbgShowOcculters" type="checkbox" checked
            /></label>
            <label class="inline" for="dbgShowImpactParams"
              >Impact params <input id="dbgShowImpactParams" type="checkbox" checked
            /></label>
            <label class="inline" for="dbgShowTDV"
              >TDV diagnostics <input id="dbgShowTDV" type="checkbox" checked
            /></label>
            <label class="inline" for="dbgShowFluxDecomposition"
              >Flux decomposition <input id="dbgShowFluxDecomposition" type="checkbox"
            /></label>
          </div>

          <p class="help">
            Note: the debug overlay is purely visual and does not affect the physics or photometry calculations.
          </p>
        </details>
        </details>
      </figure>

      <figure class="scientific-figure light-curve-figure">
        <div class="figure-heading">
          <p class="figure-number" aria-hidden="true">Figure 2</p>
          <h2>Relative starlight</h2>
          <span class="figure-key">flux against time</span>
          <button id="lcExportBtn" type="button">Export CSV<span class="sr-only"> of the light curve</span></button>
        </div>
        <canvas id="lcCanvas" width="960" height="240" role="img" aria-label="Light curve plot" aria-describedby="lcSummary"></canvas>
        <figcaption id="lcSummary">No plotted samples yet. Start the simulation or jump to an event.</figcaption>
      </figure>
      <p id="warnVal" class="runtime-warning" role="status" aria-live="polite" aria-atomic="true"></p>
    </section>
  `;
}
