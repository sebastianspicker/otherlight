/**
 * Owns parameter Planet Core support within the ui layer. Keeps DOM-facing behavior separate from application orchestration.
 */
export function renderPlanetCoreControls(): string {
  return `
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
  `;
}

export function renderPlanetPhaseControls(): string {
  return `
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
  `;
}
