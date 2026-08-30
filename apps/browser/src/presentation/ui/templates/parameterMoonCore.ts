/**
 * Owns parameter Moon Core support within the ui layer. Keeps DOM-facing behavior separate from application orchestration.
 */
export function renderMoonCoreControls(): string {
  return `
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
  `;
}

export function renderMoonPhaseControls(): string {
  return `
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
  `;
}
