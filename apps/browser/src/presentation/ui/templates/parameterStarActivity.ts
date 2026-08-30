/**
 * Owns parameter Star Activity support within the ui layer. Keeps DOM-facing behavior separate from application orchestration.
 */
export function renderBrightnessPatchControls(): string {
  return `
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
  `;
}

export function renderSpotEvolutionControls(): string {
  return `
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
  `;
}
