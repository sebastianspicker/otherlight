export function renderParameterObserverStarTemplate(): string {
  return `
    <div class="paramCol">
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

      <fieldset data-ui-tier="expert">
        <legend>Star</legend>
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
            <input id="gridRes" type="number" min="10" max="5000" step="10" value="220" />
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

        <label class="inline" for="patchesEnabled"
          >Brightness patches <input id="patchesEnabled" type="checkbox" checked
        /></label>

        <details data-ui-tier="expert">
          <summary>Patch 1 (circle)</summary>
          <div class="grid">
            <label for="p1x">x <input id="p1x" type="number" step="1000000" value="-195000000" /></label>
            <label for="p1y">y <input id="p1y" type="number" step="1000000" value="153000000" /></label>
            <label for="p1r">r <input id="p1r" type="number" min="0" step="1000000" value="111000000" /></label>
            <label for="p1f">factor <input id="p1f" type="number" min="0" step="0.01" value="0.75" /></label>
          </div>
        </details>

        <details data-ui-tier="expert">
          <summary>Patch 2 (ellipse)</summary>
          <div class="grid">
            <label for="p2x">x <input id="p2x" type="number" step="1000000" value="230000000" /></label>
            <label for="p2y">y <input id="p2y" type="number" step="1000000" value="-118000000" /></label>
            <label for="p2rx">rx <input id="p2rx" type="number" min="0" step="1000000" value="146000000" /></label>
            <label for="p2ry">ry <input id="p2ry" type="number" min="0" step="1000000" value="63000000" /></label>
            <label for="p2angle">angle <input id="p2angle" type="number" step="0.01" value="0.6" /></label>
            <label for="p2f">factor <input id="p2f" type="number" min="0" step="0.01" value="1.12" /></label>
          </div>
        </details>

        <details data-ui-tier="expert">
          <summary>Starspot evolution (rotation)</summary>
          <label
            class="inline"
            for="spotEvolutionEnabled"
            data-tooltip="Simulate starspot rotation across the visible disk, producing quasi-periodic flux modulation."
            >Enabled <input id="spotEvolutionEnabled" type="checkbox"
          /></label>
          <div class="grid">
            <label for="spotRotationPeriod" data-tooltip="Stellar rotation period. The Sun: ~2.16 x 10^6 s (25 days)."
              >P<sub>rot</sub> [s]
              <input id="spotRotationPeriod" type="number" min="1" step="1" value="20000"
            /></label>
            <label for="spotCoverage"
              >coverage (0..1) <input id="spotCoverage" type="number" min="0" max="1" step="0.05" value="1"
            /></label>
            <label for="spotLifetime"
              >lifetime (s) <input id="spotLifetime" type="number" min="0" step="10" value="0"
            /></label>
            <label for="spotDriftRate"
              >driftRate (rad/s) <input id="spotDriftRate" type="number" step="0.000001" value="0"
            /></label>
          </div>
        </details>
      </fieldset>

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
            data-tooltip="Number of sub-exposures averaged per cadence. More sub-samples improve accuracy of the smeared light curve."
            >N<sub>sub</sub> <input id="nSubsamples" type="number" min="1" max="4096" step="1" value="9"
          /></label>
        </div>
      </fieldset>

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
    </div>
  `;
}
