/**
 * Owns visualization support within the ui layer. Keeps DOM-facing behavior separate from application orchestration.
 */
export function renderVisualizationTemplate(): string {
  return `
    <section class="panel vizStack" aria-label="Scientific figures">
      <figure class="scientific-figure">
        <div class="figure-heading">
          <h2>Sky-plane geometry</h2>
          <span class="figure-key">Observer view</span>
        </div>
        <canvas id="skyCanvas" width="960" height="540" role="img" aria-label="Sky-plane geometry" aria-describedby="skySummary"></canvas>
        <figcaption id="skySummary">The star is centered. Geometry details will appear when the scenario is ready.</figcaption>
        <p id="skyBlackboxHint" class="help" hidden>
          Black-box mode active: only the light curve is visible. Select a hypothesis and click “Reveal sky”
          to see the orbital geometry.
        </p>

        <details class="help" data-ui-tier="expert">
          <summary>Debug overlay</summary>
          <div class="grid">
            <label class="inline" for="dbgEnabled">Enabled <input id="dbgEnabled" type="checkbox" checked /></label>
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
      </figure>

      <figure class="scientific-figure">
        <div class="figure-heading">
          <h2>Light curve</h2>
          <span class="figure-key">Flux vs time</span>
          <button id="lcExportBtn" type="button">Export light-curve CSV</button>
        </div>
        <canvas id="lcCanvas" width="960" height="240" role="img" aria-label="Light curve plot" aria-describedby="lcSummary"></canvas>
        <figcaption id="lcSummary">No plotted samples yet. Start the simulation or jump to an event.</figcaption>
      </figure>
    </section>
  `;
}
