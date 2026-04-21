export function renderVisualizationTemplate(): string {
  return `
    <section class="panel vizStack">
      <div class="col">
        <h2>Sky-plane</h2>
        <canvas id="skyCanvas" width="960" height="540" role="img" aria-label="Sky-plane visualization"></canvas>
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
      </div>

      <div class="col">
        <h2>Light curve</h2>
        <canvas id="lcCanvas" width="960" height="240" role="img" aria-label="Light curve plot"></canvas>
      </div>
    </section>
  `;
}
