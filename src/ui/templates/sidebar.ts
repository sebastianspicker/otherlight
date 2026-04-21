export function renderSidebarTemplate(): string {
  return `
    <aside class="panel sidebar">
      <h2>Controls</h2>

      <div class="row">
        <button id="btnStart" type="button">Start</button>
        <button id="btnReset" type="button">Reset t0</button>
        <button id="btnClearLC" type="button">Clear light curve</button>
      </div>

      <div class="row">
        <label class="inline" for="timeSpeed">
          Time speed
          <input id="timeSpeed" type="range" min="0" max="2500" step="10" value="800" aria-label="Time speed" />
          <span id="timeSpeedVal" class="mono">800</span>
        </label>
        <label class="inline" for="timeSpeedMultiplier">
          Speed boost
          <select id="timeSpeedMultiplier" aria-label="Select time speed multiplier">
            <option value="1" selected>1x</option>
            <option value="2">2x</option>
            <option value="4">4x</option>
            <option value="8">8x</option>
            <option value="16">16x</option>
          </select>
        </label>
      </div>

      <div class="row">
        <label class="inline" for="viewZoomEnabled"><input id="viewZoomEnabled" type="checkbox" /> Enable manual zoom</label>
        <button id="btnZoomOut" type="button" disabled>Zoom out</button>
        <button id="btnZoomIn" type="button" disabled>Zoom in</button>
        <button id="btnZoomReset" type="button" disabled>Reset zoom</button>
        <span class="mono">zoom <span id="zoomVal">1.0x</span></span>
      </div>

      <div class="row">
        <label class="inline" for="viewAutoFit"><input id="viewAutoFit" type="checkbox" /> Auto-fit zoom</label>
      </div>

      <div class="row readouts">
        <span class="mono">t <span id="tVal">0.0</span> s</span>
        <span class="mono">flux <span id="fluxVal">1.000000</span></span>
        <span class="mono">occulters <span id="nOccultersVal"></span></span>
        <span class="mono">v_planet <span id="vPlanetVal"></span></span>
        <span class="mono">v_moon <span id="vMoonVal"></span></span>
        <span class="mono">O-C <span id="timingHistoryVal"></span></span>
        <span class="mono">mode <span id="plotModeVal"></span></span>
        <span class="mono warn"><span id="warnVal" role="status" aria-live="polite"></span></span>
      </div>

      <div class="row">
        <label class="inline" for="plotMode">
          Plot mode
          <select id="plotMode">
            <option value="physical" selected>physical</option>
            <option value="measured">measured</option>
          </select>
        </label>

        <label class="inline" for="plotTrackingMode">
          Plot tracking
          <select id="plotTrackingMode" aria-label="Select light curve tracking mode">
            <option value="fixed">fixed</option>
            <option value="dynamic" selected>dynamic</option>
            <option value="live">live</option>
          </select>
        </label>

        <label
          class="inline"
          for="clampSmearedFlux"
          data-ui-tier="expert"
          data-tooltip="Warning: clamping to [0, 1] is only valid for normalised transit signals. With additive models (phase curves, stellar variability), flux can exceed 1.0; clamping would produce unphysical truncation."
        >
          Clamp smeared flux
          <input id="clampSmearedFlux" type="checkbox" />
        </label>
      </div>

      <section class="panel" id="ocSection" data-ui-tier="expert">
        <h3>O-C history</h3>
        <div class="row">
          <label class="inline">
            Body
            <select id="ocBodySelect" aria-label="O-C body">
              <option value="planet" selected>planet</option>
              <option value="moon">moon</option>
            </select>
          </label>
          <label class="inline">
            Unit
            <select id="ocUnitSelect" aria-label="O-C unit">
              <option value="s" selected>s</option>
              <option value="ms">ms</option>
            </select>
          </label>
          <label class="inline">
            Trend
            <select id="ocTrendModeSelect" aria-label="O-C trend mode">
              <option value="raw" selected>raw</option>
              <option value="fit">fit overlay</option>
              <option value="detrended">detrended</option>
            </select>
          </label>
          <button id="ocExportBtn" type="button">Export CSV</button>
          <button id="ocClearBtn" type="button">Clear history</button>
        </div>
        <canvas id="ocCanvas" width="960" height="220" role="img" aria-label="O-C history plot"></canvas>
        <p id="ocStatsVal" class="help mono"></p>
        <p id="ocFitVal" class="help mono"></p>
      </section>

      <section class="panel" data-product-mode="lab">
        <h3>Lab</h3>
        <p class="help" style="margin-bottom: 8px">
          Work through structured exercises: make a prediction, jump to key events, and compare what you
          expected with what the model actually shows.
        </p>
        <p id="didLessonSummary" class="help"></p>
        <p id="didLessonMeta" class="help mono"></p>
        <p id="didPhaseTitle" class="help"></p>
        <p id="didPhasePrompt" class="help"></p>
        <p id="didInterpretation" class="help"></p>
        <div id="didWorkedExample" class="help" hidden></div>
        <div id="didObservationList" class="help"></div>
        <div id="didResponseComposer" class="help">
          <label class="inline" for="didPrimaryResponseInput">
            <span id="didPrimaryResponseLabel">Response</span>
            <textarea id="didPrimaryResponseInput" rows="3" placeholder="Write your answer here."></textarea>
          </label>
          <label class="inline" for="didSecondaryResponseInput">
            <span id="didSecondaryResponseLabel">Reason / evidence</span>
            <textarea id="didSecondaryResponseInput" rows="3" placeholder="Explain your reasoning."></textarea>
          </label>
          <p id="didResponseHelp" class="help"></p>
        </div>
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
          <button id="didJumpEventBtn" type="button">Go</button>
        </div>
        <p id="didLessonStatus" class="help"></p>
        <div id="didFocusList" class="help"></div>
        <div id="didHintList" class="help"></div>
        <div id="didMisconceptionList" class="help"></div>
        <div id="didCheckList" class="help"></div>
        <div id="didFormulaList" class="help mono"></div>

        <details class="help" data-ui-tier="normal expert">
          <summary>A/B scenario comparison</summary>
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
            <button id="didCompareBtn" type="button">Compare</button>
          </div>
          <pre id="didCompareOut" class="help mono"></pre>
        </details>
      </section>
    </aside>
  `;
}
