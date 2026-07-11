export function renderDidacticControls(): string {
  return `
        <div id="didBinaryControls" class="row">
          <label
            class="inline"
            data-tooltip="In black-box mode, the sky view is hidden. Form your hypothesis about the system geometry based on the light curve alone, then reveal the sky to test it."
          >
            Hypothesis
            <select id="didHypothesisSelect" aria-label="Choose hypothesis">
              <option value="" selected>-- select a hypothesis --</option>
              <option value="primary-eclipse-deepest">Primary eclipse is deepest</option>
              <option value="secondary-eclipse-dominates">Secondary eclipse dominates</option>
              <option value="eccentricity-shifts-eclipse-spacing">Eccentricity shifts eclipse spacing</option>
            </select>
          </label>
          <button id="didRevealSkyBtn" type="button">Reveal sky</button>
        </div>
        <div class="row">
          <label
            class="inline"
            data-tooltip="Select a guided lesson with step-by-step checks. Each step verifies quantitative criteria against your simulation state."
          >
            Lesson
            <select id="didLessonSelect" aria-label="Select lesson"></select>
          </label>
          <label class="inline" for="didHintLevelSelect">
            Guidance level
            <select id="didHintLevelSelect" aria-label="Select guidance level">
              <option value="L1">L1 · nudge</option>
              <option value="L2">L2 · explanation</option>
              <option value="L3">L3 · full hint</option>
            </select>
          </label>
          <label class="inline" for="didAutoAssess" data-tooltip="Automatically evaluate check criteria on each simulation frame.">
            Auto assess
            <input id="didAutoAssess" type="checkbox" checked />
          </label>
        </div>
  `;
}

export function renderDidacticNavigation(): string {
  return `
        <div class="row">
          <button id="didPrevBtn" type="button">Previous</button>
          <button id="didHintLessBtn" type="button">Less guidance</button>
          <button id="didHintMoreBtn" type="button">More guidance</button>
          <button id="didCheckBtn" type="button">Check step</button>
          <button id="didNextBtn" type="button">Next phase</button>
          <button id="didExportBtn" type="button">Export report</button>
        </div>
        <div class="row">
          <label class="inline" for="didEventTargetSelect">
            Jump to event
            <select id="didEventTargetSelect" aria-label="Select lesson event"></select>
          </label>
          <button id="didJumpEventBtn" type="button">Jump to event</button>
        </div>
        <p id="didLessonStatus" class="help"></p>
        <div id="didFocusList" class="help"></div>
        <div id="didHintList" class="help"></div>
        <div id="didMisconceptionList" class="help"></div>
        <div id="didCheckList" class="help"></div>
        <div id="didFormulaList" class="help mono"></div>
  `;
}

export function renderComparisonControls(): string {
  return `
        <details class="help" data-ui-tier="normal expert">
          <summary>Compare scenarios</summary>
          <p class="help" style="margin-bottom: 6px">
            Compare the current parameter set (A) against a preset (B) at a given time to isolate which
            parameter changes drive the observed flux difference.
          </p>
          <div class="row">
            <label class="inline">
              Preset B
              <select id="didComparePreset"></select>
            </label>
            <label class="inline" for="didCompareTime">
              t [s]
              <input id="didCompareTime" type="number" step="1" value="0" />
            </label>
            <button id="didCompareBtn" type="button">Compare scenarios</button>
          </div>
          <pre id="didCompareOut" class="help mono"></pre>
        </details>
  `;
}
