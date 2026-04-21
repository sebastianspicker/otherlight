export function renderParameterBodiesTemplate(): string {
  return `
    <div class="paramCol">
      <fieldset>
        <legend>Planet</legend>
        <div class="grid">
          <label for="planetR" data-tooltip="Planetary radius. Jupiter: 6.99 x 10^7 m; Earth: 6.37 x 10^6 m."
            >R<sub>p</sub> [m]
            <input id="planetR" type="number" min="1e6" max="2e8" step="1e6" value="69911000"
          /></label>
          <label for="planetA" data-tooltip="Semi-major axis of the planetary orbit around the star."
            >a<sub>p</sub> [m]
            <input id="planetA" type="number" min="1e8" max="1e12" step="1e7" value="7479893535"
          /></label>
          <label
            for="planetE"
            data-tooltip="Orbital eccentricity (0 = circular, must be < 1). Capped at 0.95 for numerical stability."
            >e<sub>p</sub> <input id="planetE" type="number" min="0" max="0.999" step="0.001" value="0.08"
          /></label>
          <label
            for="planetInc"
            data-tooltip="Orbital inclination. 90 deg = edge-on (maximum transit probability). Related to impact parameter b."
            >i<sub>p</sub> [deg]
            <input id="planetInc" type="number" min="0" max="180" step="0.01" value="89.2"
          /></label>
          <label for="planetPeriod" data-tooltip="Orbital period. Use Kepler's third law: P^2 = (4 pi^2 / G M*) a^3."
            >P<sub>p</sub> [s]
            <input id="planetPeriod" type="number" min="1000" max="1e8" step="100" value="352657.7453"
          /></label>
          <label
            for="planetMass"
            data-tooltip="Planetary mass. Jupiter: 1.898 x 10^27 kg; Earth: 5.972 x 10^24 kg."
            >M<sub>p</sub> [kg]
            <input id="planetMass" type="number" min="0" max="1e30" step="1e24" value="1.89813e27"
          /></label>
        </div>

        <label
          class="inline"
          for="planetPhaseEnabled"
          data-tooltip="Include reflected light and thermal emission phase curves. These produce flux variations as a function of orbital phase."
          >Phase curve <input id="planetPhaseEnabled" type="checkbox" checked
        /></label>
        <div class="grid">
          <label for="planetReflAmp"
            >A<sub>refl</sub> <input id="planetReflAmp" type="number" min="0" step="0.0001" value="0.001"
          /></label>
          <label for="planetThermAmp"
            >A<sub>therm</sub> <input id="planetThermAmp" type="number" min="0" step="0.0001" value="0.0005"
          /></label>
          <label for="planetReflOffset"
            >reflOffset <input id="planetReflOffset" type="number" step="0.01" value="0"
          /></label>
          <label for="planetThermOffset"
            >thermOffset <input id="planetThermOffset" type="number" step="0.01" value="0"
          /></label>
        </div>

        <label class="inline" for="planetLambertian"
          >Lambertian <input id="planetLambertian" type="checkbox" checked
        /></label>
        <label for="planetConstant"
          >constant <input id="planetConstant" type="number" min="0" step="0.0001" value="0"
        /></label>

        <details data-ui-tier="expert">
          <summary>Thermal inertia</summary>
          <label class="inline" for="planetThermalInertiaEnabled"
            >Enabled <input id="planetThermalInertiaEnabled" type="checkbox"
          /></label>
          <div class="grid">
            <label for="planetAlbedo"
              >albedo (0..1) <input id="planetAlbedo" type="number" min="0" max="1" step="0.01" value="0"
            /></label>
            <label for="planetEmissivity"
              >emissivity (0..1)
              <input id="planetEmissivity" type="number" min="0" max="1" step="0.01" value="1"
            /></label>
            <label for="planetThermalTimescale"
              >thermal tau (s)
              <input id="planetThermalTimescale" type="number" min="0" step="10" value="0"
            /></label>
            <label for="planetRedistribution"
              >redistribution (0..1)
              <input id="planetRedistribution" type="number" min="0" max="1" step="0.05" value="0"
            /></label>
          </div>
        </details>

        <details data-ui-tier="expert">
          <summary>Shape / Rings</summary>
          <label class="inline" for="planetOblateEnabled"
            >Oblate <input id="planetOblateEnabled" type="checkbox"
          /></label>
          <div class="grid">
            <label for="planetOblateness"
              >oblateness f
              <input id="planetOblateness" type="number" min="0" max="0.95" step="0.01" value="0"
            /></label>
          </div>

          <label class="inline" for="planetRingsEnabled"
            >Rings <input id="planetRingsEnabled" type="checkbox"
          /></label>
          <div class="grid">
            <label for="planetRingInner"
              >ring inner (m)
              <input id="planetRingInner" type="number" min="0" max="5e8" step="1e6" value="83893200"
            /></label>
            <label for="planetRingOuter"
              >ring outer (m)
              <input id="planetRingOuter" type="number" min="0" max="5e8" step="1e6" value="139822000"
            /></label>
            <label for="planetRingInc"
              >ring inc (deg) <input id="planetRingInc" type="number" min="0" max="90" step="0.5" value="15"
            /></label>
            <label for="planetRingAngle"
              >ring angle (deg) <input id="planetRingAngle" type="number" step="1" value="0"
            /></label>
          </div>
        </details>

        <details data-ui-tier="expert">
          <summary>Forward scattering</summary>
          <p class="help">Adds a narrow pre-/post-transit brightening term to the stellar flux model.</p>
          <label class="inline" for="fsEnabled">Enabled <input id="fsEnabled" type="checkbox" /></label>
          <div class="grid">
            <label for="fsAmp">amp <input id="fsAmp" type="number" min="0" step="0.0001" value="0" /></label>
            <label for="fsG"
              >g <input id="fsG" type="number" min="-0.999" max="0.999" step="0.001" value="0.8"
            /></label>
            <label for="fsSigma"
              >sigmaPhase <input id="fsSigma" type="number" min="0.000001" step="0.001" value="0.12"
            /></label>
            <label for="fsOffset"
              >offset <input id="fsOffset" type="number" step="0.001" value="0"
            /></label>
          </div>
          <label class="inline" for="fsGateBehind"
            >Gate behind star <input id="fsGateBehind" type="checkbox" checked
          /></label>
        </details>

        <details data-ui-tier="expert">
          <summary>Atmosphere transmission</summary>
          <label
            class="inline"
            for="atmEnabled"
            data-tooltip="Simulate wavelength-dependent atmospheric absorption during transit (transmission spectroscopy). The effective transit radius increases at wavelengths with stronger absorption."
            >Enabled <input id="atmEnabled" type="checkbox"
          /></label>
          <div class="grid">
            <label for="atmKind">
              kind
              <select id="atmKind">
                <option value="hard" selected>hard</option>
                <option value="exponential-halo">exp</option>
              </select>
            </label>
            <label for="atmR0">r0 (m) <input id="atmR0" type="number" min="0" max="1e9" step="1e5" value="0" /></label>
            <label for="atmH">H (m) <input id="atmH" type="number" min="0" max="1e8" step="1e4" value="0" /></label>
            <label for="atmTau0"
              >tau0 (optical depth) <input id="atmTau0" type="number" min="0" step="0.01" value="0"
            /></label>
            <label for="atmLambdaNm" title="Comma-separated wavelengths in nm">
              lambdaNm <input id="atmLambdaNm" type="text" placeholder="450, 550, 650" />
            </label>
            <label for="atmTauScale" title="Optional per-lambda tau scale factors">
              tauScale <input id="atmTauScale" type="text" placeholder="1, 0.8, 0.6" />
            </label>
          </div>
        </details>
      </fieldset>

      <fieldset>
        <legend>Moon (Exomoon)</legend>
        <label
          class="inline"
          for="moonEnabled"
          data-tooltip="Enable an exomoon orbiting the planet. Its transit signature appears as additional dips or TTV/TDV signals."
          >Enabled <input id="moonEnabled" type="checkbox" checked
        /></label>
        <div class="grid">
          <label for="moonR" data-tooltip="Moon radius. Earth: 6.37 x 10^6 m; Ganymede: 2.63 x 10^6 m."
            >R<sub>m</sub> [m]
            <input id="moonR" type="number" min="1e5" max="5e7" step="1e5" value="6371000"
          /></label>
          <label for="moonA" data-tooltip="Semi-major axis of the moon's orbit around the planet."
            >a<sub>m</sub> [m]
            <input id="moonA" type="number" min="1e7" max="1e9" step="1e6" value="200000000"
          /></label>
          <label for="moonE" data-tooltip="Orbital eccentricity of the moon (0 = circular)."
            >e<sub>m</sub> <input id="moonE" type="number" min="0" max="0.999" step="0.001" value="0.02"
          /></label>
          <label for="moonInc" data-tooltip="Inclination of the moon's orbit relative to the planet's orbital plane."
            >i<sub>m</sub> [deg]
            <input id="moonInc" type="number" min="0" max="180" step="0.01" value="10"
          /></label>
          <label for="moonPeriod" data-tooltip="Orbital period of the moon around the planet."
            >P<sub>m</sub> [s]
            <input id="moonPeriod" type="number" min="1000" max="1e7" step="100" value="49928.74206"
          /></label>
          <label
            for="moonMass"
            data-tooltip="Moon mass. Earth: 5.972 x 10^24 kg; Ganymede: 1.48 x 10^23 kg."
            >M<sub>m</sub> [kg]
            <input id="moonMass" type="number" min="0" max="1e27" step="1e23" value="5.9722e24"
          /></label>
        </div>

        <label class="inline" for="moonPhaseEnabled"
          >Moon phase curve <input id="moonPhaseEnabled" type="checkbox"
        /></label>
        <div class="grid">
          <label for="moonReflAmp"
            >reflAmp <input id="moonReflAmp" type="number" min="0" step="0.0001" value="0"
          /></label>
          <label for="moonThermAmp"
            >thermAmp <input id="moonThermAmp" type="number" min="0" step="0.0001" value="0"
          /></label>
        </div>
        <label class="inline" for="moonLambertian"
          >Lambertian <input id="moonLambertian" type="checkbox" checked
        /></label>

        <details data-ui-tier="expert">
          <summary>Thermal inertia</summary>
          <label class="inline" for="moonThermalInertiaEnabled"
            >Enabled <input id="moonThermalInertiaEnabled" type="checkbox"
          /></label>
          <div class="grid">
            <label for="moonAlbedo"
              >albedo (0..1) <input id="moonAlbedo" type="number" min="0" max="1" step="0.01" value="0"
            /></label>
            <label for="moonEmissivity"
              >emissivity (0..1) <input id="moonEmissivity" type="number" min="0" max="1" step="0.01" value="1"
            /></label>
            <label for="moonThermalTimescale"
              >thermal tau (s) <input id="moonThermalTimescale" type="number" min="0" step="10" value="0"
            /></label>
            <label for="moonRedistribution"
              >redistribution (0..1)
              <input id="moonRedistribution" type="number" min="0" max="1" step="0.05" value="0"
            /></label>
          </div>
        </details>

        <details data-ui-tier="expert">
          <summary>Shape / Rings</summary>
          <label class="inline" for="moonOblateEnabled"
            >Oblate <input id="moonOblateEnabled" type="checkbox"
          /></label>
          <div class="grid">
            <label for="moonOblateness"
              >oblateness f <input id="moonOblateness" type="number" min="0" max="0.95" step="0.01" value="0"
            /></label>
          </div>

          <label class="inline" for="moonRingsEnabled"
            >Rings <input id="moonRingsEnabled" type="checkbox"
          /></label>
          <div class="grid">
            <label for="moonRingInner"
              >ring inner (m) <input id="moonRingInner" type="number" min="0" max="1e8" step="1e5" value="7500000"
            /></label>
            <label for="moonRingOuter"
              >ring outer (m) <input id="moonRingOuter" type="number" min="0" max="1e8" step="1e5" value="12000000"
            /></label>
            <label for="moonRingInc"
              >ring inc (deg) <input id="moonRingInc" type="number" min="0" max="90" step="0.5" value="10"
            /></label>
            <label for="moonRingAngle"
              >ring angle (deg) <input id="moonRingAngle" type="number" step="1" value="0"
            /></label>
          </div>
        </details>
      </fieldset>

      <fieldset data-ui-tier="expert">
        <legend>Day/Night visibility</legend>
        <label class="inline" for="dnEnabled">Enabled <input id="dnEnabled" type="checkbox" /></label>
        <label class="inline" for="dnClamp">Clamp <input id="dnClamp" type="checkbox" checked /></label>
        <div class="grid">
          <label for="dnReflectedModel">
            Reflected model
            <select id="dnReflectedModel">
              <option value="lambert" selected>lambert</option>
              <option value="cosine">cosine</option>
            </select>
          </label>
          <label for="dnThermalModel">
            Thermal model
            <select id="dnThermalModel">
              <option value="cosine" selected>cosine</option>
              <option value="constant">constant</option>
              <option value="lambert">lambert</option>
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset data-ui-tier="expert">
        <legend>Exomoon timing/shape (Dynamics)</legend>
        <label class="inline" for="exoEnabled">Enabled <input id="exoEnabled" type="checkbox" checked /></label>
        <div class="grid">
          <label for="exoTRef">tRef (s) <input id="exoTRef" type="number" step="0.1" value="0" /></label>
          <label for="exoVelDt"
            >velDt (s) <input id="exoVelDt" type="number" min="0.000001" step="0.1" value="2"
          /></label>
          <label for="exoMoonOmegaDot"
            >moonOmegaDot (rad/s) <input id="exoMoonOmegaDot" type="number" step="0.000001" value="0"
          /></label>
          <label for="exoMoonIncDot"
            >moonIncDot (rad/s) <input id="exoMoonIncDot" type="number" step="0.000001" value="0"
          /></label>
          <label for="exoMoonOmegaSmallDot"
            >moonOmegaSmallDot (rad/s)
            <input id="exoMoonOmegaSmallDot" type="number" step="0.000001" value="0"
          /></label>
          <label for="exoImpactYDot"
            >moonImpactYDot (m/s) <input id="exoImpactYDot" type="number" step="0.000001" value="0"
          /></label>
        </div>
      </fieldset>

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
    </div>
  `;
}
