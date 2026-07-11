export function renderDayNightFieldset(): string {
  return `
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
  `;
}

export function renderExomoonTimingFieldset(): string {
  return `
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
  `;
}
