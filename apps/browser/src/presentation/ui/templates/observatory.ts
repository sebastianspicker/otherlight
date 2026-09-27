/** Semantic experiment surfaces for the minimal observatory workspace. */
export function renderObservatoryHeading(): string {
  return `
    <section class="observatory-heading" aria-labelledby="observatoryTitle">
      <div>
        <h2 id="observatoryTitle">How size becomes a signal</h2>
        <p id="observatorySubtitle">Change the radius. Compare the light.</p>
      </div>
      <nav class="experiment-phases" aria-label="Experiment phases">
        <button type="button" data-observatory-phase="predict">Hypothesis</button>
        <button type="button" data-observatory-phase="observe" aria-current="step">Experiment</button>
        <button type="button" data-observatory-phase="explain">Interpretation</button>
      </nav>
    </section>`;
}

export function renderRadiusComparison(): string {
  return `
    <section class="radius-comparison" aria-labelledby="radiusComparisonTitle">
      <h2 id="radiusComparisonTitle">Planet radius</h2>
      <form id="radiusComparisonForm" novalidate>
        <label class="radius-input-row" for="observatoryRadiusA">
          <span class="trace-a">A <span class="sr-only">Current planet radius</span></span>
          <input id="observatoryRadiusA" type="text" readonly aria-describedby="radiusBaselineHelp" />
          <span>km</span>
        </label>
        <label class="radius-input-row" for="observatoryRadiusB">
          <span class="trace-b">B <span class="sr-only">Comparison planet radius</span></span>
          <input id="observatoryRadiusB" type="number" inputmode="decimal" min="1000" max="200000" step="any" aria-describedby="radiusComparisonHelp radiusComparisonStatus" />
          <span>km</span>
        </label>
        <p id="radiusBaselineHelp" class="help">A is the current model. <a id="observatoryAdjustLink" href="#modelTools">Adjust model</a></p>
        <dl class="radius-conditions">
          <div><dt>Star radius</dt><dd id="observatoryStarRadius">—</dd></div>
          <div><dt>Stellar disk</dt><dd id="observatoryStellarDisk">—</dd></div>
        </dl>
        <button id="observatoryCompareBtn" class="primary-action" type="submit">Compare</button>
        <p id="radiusComparisonStatus" class="comparison-status" role="status" aria-live="polite"></p>
        <button id="observatoryClearComparisonBtn" class="text-action" type="button" hidden>Clear comparison</button>
      </form>
      <details class="radius-assumptions">
        <summary>Model assumptions</summary>
<p id="radiusComparisonHelp" class="help">Only B’s planet radius changes. The comparison stays in this session.</p>
        <p class="help">The radius-ratio estimate assumes an opaque planet fully overlapping a uniform star. Limb darkening, grazing geometry, moons and additive light can change the computed signal. All curves here use the Education model.</p>
      </details>
    </section>`;
}

export function renderRadiusRelationship(): string {
  return `
    <section class="radius-relationship" aria-labelledby="radiusRelationshipTitle">
      <h2 id="radiusRelationshipTitle">Radius → depth</h2>
      <p class="radius-equation" aria-label="Geometric transit depth is approximately planet radius divided by star radius, squared">δ ≈ (R<sub>p</sub> / R<sub>★</sub>)<sup>2</sup></p>
      <table class="radius-results">
        <caption>Geometric depth</caption>
        <thead class="sr-only"><tr><th scope="col">Scenario</th><th scope="col">Depth</th></tr></thead>
        <tbody><tr><th scope="row" class="trace-a">A</th><td id="observatoryDepthA">—</td></tr>
        <tr><th scope="row" class="trace-b">B</th><td id="observatoryDepthB">—</td></tr></tbody>
      </table>
      <p id="observatoryRadiusRatio" class="radius-ratio">Choose a comparison radius.</p>
      <p class="help">Geometric reference: uniform stellar disk, full overlap.</p>
      <p id="observatoryComparisonSummary" class="help">Compare to compute the two Education light curves.</p>
      <button id="observatoryInterpretBtn" class="text-action" type="button">Record interpretation →</button>
    </section>`;
}

export function renderObservatoryFooter(): string {
  return `
    <footer class="observatory-footer">
      <button id="observatoryMoreBtn" type="button">More experiments <span aria-hidden="true">›</span></button>
      <span class="help">Orbits · Limb darkening · Exomoons · Binaries</span>
      <span class="help">Education preview · local-first workspace</span>
    </footer>`;
}
