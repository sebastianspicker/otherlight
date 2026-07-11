export function renderPlanetThermalInertiaControls(): string {
  return `
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
  `;
}

export function renderPlanetShapeControls(): string {
  return `
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
  `;
}
