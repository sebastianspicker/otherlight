/**
 * Owns parameter Star Core support within the ui layer. Keeps DOM-facing behavior separate from application orchestration.
 */
import { MAX_TRANSIT_GRID_RES, MIN_TRANSIT_GRID_RES } from "../../core/transitComputeBudget";

export function renderStarCoreControls(): string {
  return `
        <div class="grid">
          <label for="starR" data-tooltip="Stellar radius. Solar value: 6.957 x 10^8 m."
            >R<sub>*</sub> [m]
            <input id="starR" type="number" min="1e6" max="2e9" step="1e6" value="695700000"
          /></label>
          <label for="baselineFlux" data-tooltip="Out-of-transit normalised flux (typically 1.0)."
            >F<sub>0</sub>
            <input id="baselineFlux" type="number" min="0" step="0.000001" value="1"
          /></label>
          <label
            for="gridRes"
            data-tooltip="Numerical resolution of the stellar disk integration grid. Higher values improve accuracy at the cost of performance."
          >
            Grid resolution
            <input id="gridRes" type="number" min="${MIN_TRANSIT_GRID_RES}" max="${MAX_TRANSIT_GRID_RES}" step="10" value="220" />
          </label>
        </div>

        <label
          class="inline"
          for="ldEnabled"
          data-tooltip="Quadratic limb-darkening law: I(mu)/I(1) = 1 - u1(1-mu) - u2(1-mu)^2"
          >Limb darkening (quadratic) <input id="ldEnabled" type="checkbox" checked
        /></label>
        <div class="grid">
          <label for="ldU1" data-tooltip="Linear limb-darkening coefficient. Typical solar: ~0.40."
            >u<sub>1</sub> <input id="ldU1" type="number" step="0.01" value="0.35"
          /></label>
          <label for="ldU2" data-tooltip="Quadratic limb-darkening coefficient. Typical solar: ~0.25."
            >u<sub>2</sub> <input id="ldU2" type="number" step="0.01" value="0.25"
          /></label>
        </div>
  `;
}

export function renderBandpassControls(): string {
  return `
        <details data-ui-tier="expert">
          <summary>Bandpass / Multi-band LD</summary>
          <div class="grid">
            <label for="ldBandpass">
              bandpass
              <input id="ldBandpass" type="text" list="ldBandpassList" placeholder="e.g. V, g, 550" />
            </label>
            <label for="ldBands" title="Format: band:u1,u2; band2:u1,u2">
              bands (u1,u2)
              <input id="ldBands" type="text" placeholder="g:0.45,0.25; r:0.33,0.24" />
            </label>
          </div>
          <datalist id="ldBandpassList">
            <option value="u"></option>
            <option value="b"></option>
            <option value="v"></option>
            <option value="r"></option>
            <option value="i"></option>
            <option value="g"></option>
            <option value="z"></option>
            <option value="y"></option>
          </datalist>
        </details>
  `;
}
