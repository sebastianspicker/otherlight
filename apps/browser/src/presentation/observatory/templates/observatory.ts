/** Semantic experiment surfaces for the Plate & Figure observatory workspace. */
export function renderObservatoryHeading(): string {
  return `
    <section class="observatory-heading" aria-labelledby="observatoryTitle">
      <div class="observatory-heading__title">
        <p class="kicker">Transit experiment</p>
        <h2 id="observatoryTitle">How size becomes a signal</h2>
        <p id="observatorySubtitle">Change the radius. Compare the light.</p>
      </div>
      <nav class="experiment-phases" aria-label="Experiment phases">
        <button type="button" data-observatory-phase="predict"><span class="phase-index" aria-hidden="true">1</span>Hypothesis</button>
        <button type="button" data-observatory-phase="observe" aria-current="step"><span class="phase-index" aria-hidden="true">2</span>Experiment</button>
        <button type="button" data-observatory-phase="explain"><span class="phase-index" aria-hidden="true">3</span>Interpretation</button>
      </nav>
    </section>`;
}

export function renderRadiusComparison(): string {
  return `
    <section class="radius-comparison" aria-labelledby="radiusComparisonTitle">
      <h2 id="radiusComparisonTitle">Planet radius</h2>
      <form id="radiusComparisonForm" novalidate>
        <label class="radius-input-row" for="observatoryRadiusA">
          <span class="trace-key trace-a"><span class="trace-key__line" aria-hidden="true"></span>A <span class="sr-only">Current planet radius</span></span>
          <input id="observatoryRadiusA" type="text" readonly aria-describedby="radiusBaselineHelp" />
          <span class="unit">km</span>
        </label>
        <label class="radius-input-row" for="observatoryRadiusB">
          <span class="trace-key trace-b"><span class="trace-key__line" aria-hidden="true"></span>B <span class="sr-only">Comparison planet radius</span></span>
          <input id="observatoryRadiusB" type="number" inputmode="decimal" min="1000" max="200000" step="any" aria-describedby="radiusComparisonHelp radiusComparisonStatus" />
          <span class="unit">km</span>
        </label>
        <p id="radiusBaselineHelp" class="help">A is the accepted model and stays fixed. <a id="observatoryAdjustLink" href="#modelTools">Adjust model</a></p>
        <dl class="radius-conditions">
          <div><dt>Star radius</dt><dd id="observatoryStarRadius">—</dd></div>
          <div><dt>Stellar disk</dt><dd id="observatoryStellarDisk">—</dd></div>
        </dl>
        <button id="observatoryCompareBtn" class="primary-action" type="submit">Compare A and B</button>
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
      <p class="radius-equation" aria-label="Geometric transit depth is approximately planet radius divided by star radius, squared"><i>δ</i> ≈ (<i>R</i><sub>p</sub> / <i>R</i><sub>★</sub>)<sup>2</sup></p>
      <table class="radius-results">
        <caption>Geometric depth</caption>
        <thead class="sr-only"><tr><th scope="col">Scenario</th><th scope="col">Depth</th></tr></thead>
        <tbody><tr><th scope="row" class="trace-key trace-a"><span class="trace-key__line" aria-hidden="true"></span>A</th><td id="observatoryDepthA">—</td></tr>
        <tr><th scope="row" class="trace-key trace-b"><span class="trace-key__line" aria-hidden="true"></span>B</th><td id="observatoryDepthB">—</td></tr></tbody>
      </table>
      <p id="observatoryRadiusRatio" class="radius-ratio">Choose a comparison radius.</p>
      <p class="help">Geometric reference: uniform stellar disk, full overlap.</p>
      <p id="observatoryComparisonSummary" class="help">Compare to compute the two Education light curves.</p>
      <button id="observatoryInterpretBtn" class="text-action text-action--forward" type="button">Record interpretation</button>
    </section>`;
}

export function renderObservatoryFooter(): string {
  return `
    <footer class="observatory-footer">
      <button id="observatoryMoreBtn" type="button">More experiments</button>
      <p class="observatory-footer__topics">Orbits · Limb darkening · Exomoons · Binaries</p>
      <p class="observatory-footer__imprint">Otherlight · Education preview · local-first, no account, no upload</p>
    </footer>`;
}
