export function renderMoonThermalInertiaControls(): string {
  return `
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
  `;
}

export function renderMoonShapeControls(): string {
  return `
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
  `;
}
