function renderDidacticIntro(): string {
  return `
        <h3>Guided Lab</h3>
        <p class="help didactic-intro">
          Work through structured exercises: make a prediction, jump to key events, and compare what you
          expected with what the model actually shows.
        </p>
        <p id="didLessonSummary" class="help"></p>
        <p id="didLessonMeta" class="help mono"></p>
        <p id="didProgress" class="lesson-progress">Phase progress</p>
        <h4 id="didPhaseTitle" tabindex="-1"></h4>
        <p id="didPhasePrompt" class="help"></p>
        <p id="didAnnouncement" class="sr-only" role="status" aria-live="polite" aria-atomic="true"></p>
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
  `;
}

import {
  renderComparisonControls,
  renderDidacticControls,
  renderDidacticNavigation,
} from "./sidebarDidacticsControls";

export function renderDidacticSection(): string {
  return `
      <section class="panel" data-product-mode="lab">
        ${renderDidacticIntro()}
        ${renderDidacticControls()}
        ${renderDidacticNavigation()}
        ${renderComparisonControls()}
      </section>
  `;
}
