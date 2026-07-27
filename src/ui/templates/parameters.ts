/**
 * Owns parameters support within the ui layer. Keeps DOM-facing behavior separate from application orchestration.
 */
import { renderParameterBodiesTemplate } from "./parameterBodies";
import { renderParameterObserverStarTemplate } from "./parameterObserverStar";
import { renderQuickControlsTemplate } from "./quickControls";

function renderUiRangesTemplate(): string {
  return `
        <fieldset data-ui-tier="expert">
          <legend>UI Ranges</legend>
          <label
            class="inline"
            for="overrideMode"
            title="Allow values outside the scientifically meaningful ranges defined in scenario.default.json."
          >
            Override mode <input id="overrideMode" type="checkbox" />
          </label>
          <p id="overrideHelp" class="help">
            Default: sliders use physically meaningful ranges with clamping. Override mode permits extreme
            scenarios; hard numerical invariants (e.g. P &gt; 0) are still enforced.
          </p>
          <div id="sliderRoot" class="grid"></div>
        </fieldset>
  `;
}

function renderParameterActionsTemplate(): string {
  return `
          <div class="paramActions">
            <div class="row">
              <button id="btnApplyParams" type="submit">Apply parameters</button>
              <button id="btnResetParams" type="button">Reset parameters</button>
              <span id="paramDirtyState" class="param-dirty" role="status" hidden>Unapplied changes</span>
            </div>
            <div id="paramErrorSummary" class="form-error-summary" role="alert" tabindex="-1" hidden></div>
            <p id="paramHelp" class="help">
              Changes take effect after pressing <b>Apply parameters</b>. Eccentricity is capped at e &le; 0.95 for
              numerical stability.
            </p>
          </div>
  `;
}

export function renderParametersTemplate(): string {
  return `
    <section class="panel params" id="paramsSection">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Model controls</p>
          <h2>System parameters</h2>
        </div>
        <span class="panel-heading__status mono">V4</span>
      </div>
      <p id="binaryLabParamNotice" class="help" hidden>
        Binary black-box lab uses a curated detached eclipsing-binary scenario. The generic transit/exomoon
        parameter form is hidden here because its labels do not describe the binary-star contract.
      </p>

      <form id="paramForm" autocomplete="off" novalidate>
        ${renderQuickControlsTemplate()}
        <details class="advanced-parameter-drawer" data-ui-tier="expert" open>
          <summary><span>Advanced parameters</span><span class="mono">full model</span></summary>
          <div class="advanced-parameter-drawer__content">
            ${renderUiRangesTemplate()}
            <div class="paramCols" data-ui-tier="expert">
              ${renderParameterObserverStarTemplate()}
              ${renderParameterBodiesTemplate()}
              ${renderParameterActionsTemplate()}
            </div>
          </div>
        </details>
      </form>
      <dialog id="dirtyChangeDialog" aria-labelledby="dirtyChangeTitle" aria-describedby="dirtyChangeDescription">
        <h2 id="dirtyChangeTitle">Load a different context?</h2>
        <p id="dirtyChangeDescription">Advanced parameter edits have not been applied. Loading another context will discard them.</p>
        <div class="dialog-actions">
          <button id="dirtyKeepEditingBtn" type="button">Keep editing</button>
          <button id="dirtyDiscardBtn" type="button">Discard edits and load</button>
        </div>
      </dialog>
    </section>
  `;
}
