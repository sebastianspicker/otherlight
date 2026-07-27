/**
 * Owns parameter Observer Star support within the ui layer. Keeps DOM-facing behavior separate from application orchestration.
 */
import { renderStarFieldset } from "./parameterStar";

function renderObserverFieldset(): string {
  return `
      <fieldset id="observerFieldset" data-ui-tier="expert">
        <legend>Observer</legend>
        <p class="help">
          Expert-only line-of-sight direction vector in simulation coordinates (internally normalised). Normal
          mode locks the view to the canonical observer looking straight at the centered star.
        </p>
        <div class="grid">
          <label for="observerX">d<sub>x</sub> <input id="observerX" type="number" step="0.1" value="0" /></label>
          <label for="observerY">d<sub>y</sub> <input id="observerY" type="number" step="0.1" value="0" /></label>
          <label for="observerZ">d<sub>z</sub> <input id="observerZ" type="number" step="0.1" value="1" /></label>
        </div>
      </fieldset>
  `;
}

function renderMeasurementFieldset(): string {
  return `
      <fieldset data-ui-tier="expert">
        <legend>Measurement / Smearing</legend>
        <label
          class="inline"
          for="smearEnabled"
          data-tooltip="Simulate finite integration time by averaging sub-samples within each cadence window (boxcar smearing)."
          >Enabled <input id="smearEnabled" type="checkbox" checked
        /></label>
        <div class="grid">
          <label
            for="cadenceSec"
            data-tooltip="Integration time per measurement point. Kepler long cadence: ~1800 s; TESS: ~120 s."
            >Cadence [s] <input id="cadenceSec" type="number" min="0" step="1" value="60"
          /></label>
          <label
            for="nSubsamples"
            data-tooltip="Number of sub-exposures averaged per cadence. The live solver applies a combined grid, wavelength, and smearing budget to keep the interface responsive."
            >N<sub>sub</sub> <input id="nSubsamples" type="number" min="1" max="512" step="1" value="9"
          /></label>
        </div>
      </fieldset>
  `;
}

function renderVariabilityFieldset(): string {
  return `
      <fieldset data-ui-tier="expert">
        <legend>Stellar variability</legend>
        <label class="inline" for="varEnabled">Enabled <input id="varEnabled" type="checkbox" checked /></label>
        <div class="grid">
          <label for="beamingAmp"
            >beamingAmp <input id="beamingAmp" type="number" step="0.000001" value="0.00002"
          /></label>
          <label for="ellipsoidalAmp"
            >ellipsoidalAmp <input id="ellipsoidalAmp" type="number" step="0.000001" value="0.00003"
          /></label>
          <label for="beamingOffset"
            >beamingOffset <input id="beamingOffset" type="number" step="0.001" value="0"
          /></label>
          <label for="ellipsoidalOffset"
            >ellipsoidalOffset <input id="ellipsoidalOffset" type="number" step="0.001" value="0"
          /></label>
          <label for="varConstant"
            >constant <input id="varConstant" type="number" min="0" step="0.000001" value="0"
          /></label>
        </div>
      </fieldset>
  `;
}

export function renderParameterObserverStarTemplate(): string {
  return `
    <div class="paramCol">
      ${renderObserverFieldset()}
      ${renderStarFieldset()}
      ${renderMeasurementFieldset()}
      ${renderVariabilityFieldset()}
    </div>
  `;
}
