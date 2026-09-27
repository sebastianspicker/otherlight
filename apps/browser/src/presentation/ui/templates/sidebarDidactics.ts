/**
 * Renders the didactics sidebar section.
 */
import {
  renderComparisonControls,
  renderDidacticControls,
  renderDidacticNavigation,
} from "./sidebarDidacticsControls";

/**
 * Guided Lab phase chrome: progress, one current phase, response, evidence, navigation.
 * Stable IDs preserved for didactics wiring and tests.
 */
function renderDidacticPhaseChrome(): string {
  return `
        <header class="lab-rail__header">
          <p class="eyebrow">Guided Lab</p>
          <h3 id="labRailTitle" class="sr-only">Lesson workspace</h3>
        </header>

        <div class="lab-rail__setup">
          ${renderDidacticControls()}
        </div>

        <section class="lab-phase" aria-labelledby="didPhaseTitle">
          <div class="lab-phase__progress">
            <p id="didProgress" class="lesson-progress">Phase progress</p>
          </div>
          <h4 id="didPhaseTitle" class="lab-phase__title" tabindex="-1"></h4>
          <p id="didPhasePrompt" class="help lab-phase__prompt"></p>
          <p id="didAnnouncement" class="sr-only" role="status" aria-live="polite" aria-atomic="true"></p>
          <div id="didWorkedExample" class="help lab-phase__example" hidden></div>

          <div id="didResponseComposer" class="lab-phase__response">
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
        </section>

        <div class="lab-rail__actions">
          ${renderDidacticNavigation()}
        </div>

        <details class="lesson-evidence">
          <summary>Observations, hints &amp; checks</summary>
        <div class="lab-rail__evidence" aria-label="Hints and checks">
          <p id="didInterpretation" class="help lab-phase__result"></p>
          <div id="didObservationList" class="help lab-phase__observations"></div>
          <p id="didLessonStatus" class="help lab-rail__status"></p>
          <div id="didFocusList" class="help lab-evidence-block"></div>
          <div id="didHintList" class="help lab-evidence-block"></div>
          <div id="didMisconceptionList" class="help lab-evidence-block"></div>
          <div id="didCheckList" class="help lab-evidence-block"></div>
          <div id="didFormulaList" class="help mono lab-evidence-block"></div>
        </div>

        </details>

        <div class="lab-rail__compare">
          ${renderComparisonControls()}
        </div>
  `;
}

export function renderDidacticSection(): string {
  return `
      <section class="panel lab-rail" data-product-mode="lab" aria-labelledby="labRailTitle">
        ${renderDidacticPhaseChrome()}
      </section>
  `;
}
