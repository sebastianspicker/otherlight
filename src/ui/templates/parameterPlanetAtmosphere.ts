export function renderScatteringControls(): string {
  return `
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
  `;
}

export function renderAtmosphereControls(): string {
  return `
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
  `;
}
