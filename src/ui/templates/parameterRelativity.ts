/**
 * Owns parameter Relativity support within the ui layer. Keeps DOM-facing behavior separate from application orchestration.
 */
export function renderRelativityFieldset(): string {
  return `
      <fieldset data-ui-tier="expert">
        <legend>Relativistic effects</legend>
        <label
          class="inline"
          for="relEnabled"
          data-tooltip="Enable relativistic corrections: light-travel time (Roemer delay), Shapiro delay, and GR apsidal precession."
          >Enabled <input id="relEnabled" type="checkbox"
        /></label>
        <div class="grid">
          <label class="inline" for="relLTTE"
            >LTTE <input id="relLTTE" type="checkbox" checked
          /></label>
          <label class="inline" for="relShapiro"
            >Shapiro <input id="relShapiro" type="checkbox" checked
          /></label>
          <label class="inline" for="relGR"
            >GR precession <input id="relGR" type="checkbox" checked
          /></label>
          <label for="relC">c [m s<sup>-1</sup>] <input id="relC" type="number" min="1e6" step="1" value="299792458" /></label>
        </div>
        <div class="grid">
          <label for="relPlanetPrec"
            >&Delta;&omega;<sub>p</sub>/orbit [deg] <input id="relPlanetPrec" type="number" step="0.001" value="0"
          /></label>
          <label for="relMoonPrec"
            >&Delta;&omega;<sub>m</sub>/orbit [deg] <input id="relMoonPrec" type="number" step="0.001" value="0"
          /></label>
        </div>
      </fieldset>
  `;
}
