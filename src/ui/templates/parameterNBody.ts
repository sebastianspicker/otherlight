/**
 * Owns parameter NBody support within the ui layer. Keeps DOM-facing behavior separate from application orchestration.
 */
export function renderNBodyFieldset(): string {
  return `
      <fieldset data-ui-tier="expert">
        <legend>N-body dynamics</legend>
        <label
          class="inline"
          for="nbodyEnabled"
          data-tooltip="Enable full N-body gravitational integration (Leapfrog). Required for transit timing variations (TTV/TDV)."
          >Enabled <input id="nbodyEnabled" type="checkbox"
        /></label>
        <div class="grid">
          <label for="nbodyMuStar" data-tooltip="Standard gravitational parameter of the star: mu = G x M. Sun: 1.327 x 10^20 m^3 s^-2."
            >&mu;<sub>*</sub> [m<sup>3</sup> s<sup>-2</sup>]
            <input id="nbodyMuStar" type="number" min="0" max="1e21" step="1e18" value="1.3271645321e20"
          /></label>
          <label for="nbodyMuPlanet" data-tooltip="Standard gravitational parameter of the planet. Jupiter: 1.267 x 10^17 m^3 s^-2."
            >&mu;<sub>p</sub> [m<sup>3</sup> s<sup>-2</sup>]
            <input id="nbodyMuPlanet" type="number" min="0" max="1e19" step="1e16" value="1.2668689059e17"
          /></label>
          <label for="nbodyMuMoon" data-tooltip="Standard gravitational parameter of the moon. Earth: 3.986 x 10^14 m^3 s^-2."
            >&mu;<sub>m</sub> [m<sup>3</sup> s<sup>-2</sup>]
            <input id="nbodyMuMoon" type="number" min="0" max="1e17" step="1e14" value="3.986025446e14"
          /></label>
          <label for="nbodyDtMax" data-tooltip="Maximum integrator time step. Smaller values improve accuracy but reduce performance."
            >&Delta;t<sub>max</sub> [s] <input id="nbodyDtMax" type="number" min="0.1" max="1e6" step="1" value="60"
          /></label>
          <label for="nbodySoftening" data-tooltip="Gravitational softening length to prevent singularities at close approach. 0 = no softening."
            >&epsilon;<sub>soft</sub> [m] <input id="nbodySoftening" type="number" min="0" max="1e8" step="1e5" value="0"
          /></label>
        </div>

        <details data-ui-tier="expert">
          <summary>Perturbers</summary>
          <label class="inline" for="pert1Enabled">Perturber 1 <input id="pert1Enabled" type="checkbox" /></label>
          <div class="grid">
            <label for="pert1Mu">mu1 (m^3/s^2) <input id="pert1Mu" type="number" min="0" max="1e19" step="1e16" value="0" /></label>
            <label for="pert1A">a1 (m) <input id="pert1A" type="number" min="1e8" max="1e12" step="1e7" value="14959787070" /></label>
            <label for="pert1E">e1 <input id="pert1E" type="number" min="0" max="0.999" step="0.001" value="0" /></label>
            <label for="pert1Inc">inc1 (deg) <input id="pert1Inc" type="number" min="0" max="180" step="0.01" value="0" /></label>
            <label for="pert1Period">period1 (s) <input id="pert1Period" type="number" min="1000" max="1e8" step="100" value="997466.7326" /></label>
          </div>

          <label class="inline" for="pert2Enabled">Perturber 2 <input id="pert2Enabled" type="checkbox" /></label>
          <div class="grid">
            <label for="pert2Mu">mu2 (m^3/s^2) <input id="pert2Mu" type="number" min="0" max="1e19" step="1e16" value="0" /></label>
            <label for="pert2A">a2 (m) <input id="pert2A" type="number" min="1e8" max="1e12" step="1e7" value="2.5e10" /></label>
            <label for="pert2E">e2 <input id="pert2E" type="number" min="0" max="0.999" step="0.001" value="0" /></label>
            <label for="pert2Inc">inc2 (deg) <input id="pert2Inc" type="number" min="0" max="180" step="0.01" value="0" /></label>
            <label for="pert2Period">period2 (s) <input id="pert2Period" type="number" min="1000" max="1e8" step="100" value="1600000" /></label>
          </div>
        </details>
      </fieldset>
  `;
}
