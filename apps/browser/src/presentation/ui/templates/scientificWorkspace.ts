/**
 * Owns scientific Workspace support within the ui layer. Keeps DOM-facing behavior separate from application orchestration.
 */
export function renderScientificWorkspaceHeader(): string {
  return `
    <section
      id="scientificWorkspace"
      class="scientific-workspace"
      data-product-profile="scientific"
      aria-labelledby="scientificWorkspaceTitle"
      hidden
    >
      <header class="scientific-workspace__header">
        <div class="scientific-workspace__intro">
          <p class="eyebrow">V5 local execution boundary</p>
          <h2 id="scientificWorkspaceTitle">Scientific workspace</h2>
          <p>
            Runs bounded barycentric Newtonian point-mass calculations through a loopback-only backend
            after validating the input and execution contracts. It never relabels or silently falls back
            to the educational V4 preview.
          </p>
        </div>
        <aside class="scientific-workspace__status" aria-label="Backend availability">
          <span class="readout-label">Backend</span>
          <strong id="scienceCapabilityStatus" role="status" aria-live="polite">Not checked</strong>
          <code class="scientific-workspace__endpoint">http://127.0.0.1:8765</code>
          <p class="scientific-workspace__status-hint help">
            Unavailable stays unavailable — Education preview is never substituted.
          </p>
        </aside>
      </header>
`;
}

export function renderScientificWorkspaceRunAndScope(): string {
  return `
      <div class="scientific-workspace__grid">
        <section class="panel scientific-panel scientific-panel--run" aria-labelledby="scienceRunTitle">
          <div class="scientific-panel__heading">
            <h3 id="scienceRunTitle">Radial-velocity forward run</h3>
            <p class="eyebrow">Capability-gated job</p>
          </div>
          <p id="scienceScenarioSummary" class="help">
            The active education scenario will be converted only if its static SI state satisfies the V5
            mass, Kepler-period, barycentre, epoch, and non-overlap contracts.
          </p>
          <div class="science-run-fields">
            <label class="inline" for="scienceDurationHours">
              Duration
              <span class="science-field">
                <input id="scienceDurationHours" type="number" min="0.01" max="8760" step="0.01" value="24" />
                <span class="science-unit" aria-hidden="true">h</span>
              </span>
            </label>
            <label class="inline" for="scienceCadenceSec">
              Cadence
              <span class="science-field">
                <input id="scienceCadenceSec" type="number" min="0.001" max="31557600" step="1" value="300" />
                <span class="science-unit" aria-hidden="true">s</span>
              </span>
            </label>
            <label class="inline" for="scienceSeed">
              Seed
              <span class="science-field">
                <input id="scienceSeed" type="number" step="1" value="42" />
              </span>
            </label>
          </div>
          <div class="row science-run-actions">
            <button id="scienceRefreshBtn" type="button">Check backend</button>
            <button id="scienceRunBtn" type="button" disabled>Run V5 job</button>
            <button id="scienceCancelBtn" type="button" disabled>Cancel current job</button>
          </div>
          <p id="scienceRunStatus" class="help science-run-status" role="status" aria-live="polite">
            Check the local backend before submitting a job.
          </p>
        </section>

        <section class="panel scientific-panel scientific-panel--scope" aria-labelledby="scienceScopeTitle">
          <div class="scientific-panel__heading">
            <h3 id="scienceScopeTitle">Validated scope</h3>
            <p class="eyebrow">This alpha only</p>
          </div>
          <dl class="science-scope-list">
            <div><dt>Available output</dt><dd>Barycentric radial velocity</dd></div>
            <div><dt>Dynamics</dt><dd>Newtonian point masses, SciPy DOP853</dd></div>
            <div><dt>Coordinates</dt><dd>Barycentric Cartesian SI</dd></div>
            <div><dt>Time</dt><dd>Offsets from a numeric JD TDB epoch</dd></div>
          </dl>
          <p class="help scientific-panel__footnote">
            V5 research photometry, calibrated timing/BJD conversion, relativity output, atmosphere
            retrieval, astrometry artifacts, and inference are unavailable in this alpha. Compatibility
            preview corrections never enter a Scientific result.
          </p>
          <p class="help scientific-panel__footnote">
            <a href="https://github.com/sebastianspicker/otherlight/blob/main/docs/physics/model-status.md">
              Read the repository model-status documentation
            </a>
          </p>
        </section>
      </div>
`;
}

export function renderScientificWorkspaceResult(): string {
  return `
      <section class="panel scientific-panel scientific-panel--result" aria-labelledby="scienceResultTitle">
        <div class="scientific-panel__heading">
          <h3 id="scienceResultTitle">Run provenance</h3>
          <p class="eyebrow">Manifest + artifact</p>
        </div>
        <p class="science-artifact-row">
          <a id="scienceArtifactLink" class="science-artifact-link" href="#" target="_blank" rel="noopener" hidden>
            Open immutable Arrow IPC artifact
          </a>
        </p>
        <pre id="scienceResult" class="science-result">No scientific job has completed.</pre>
      </section>
    </section>
  `;
}

export function renderScientificWorkspace(): string {
  return `${renderScientificWorkspaceHeader()}${renderScientificWorkspaceRunAndScope()}${renderScientificWorkspaceResult()}`;
}
