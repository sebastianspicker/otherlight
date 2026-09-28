/**
 * Renders the sidebar template.
 */
import { renderRadiusComparison } from "../../observatory/templates/observatory";
import { renderDidacticSection } from "../../labs/templates/sidebarDidactics";
import { renderParametersTemplate } from "../../scenario/templates/parameters";
import { renderOcSection, renderPlotControls } from "../../playback/templates/sidebarRuntime";

export function renderSidebarTemplate(): string {
  return [
    `
    <aside id="modelControls" class="sidebar" aria-label="Model and workspace controls" tabindex="-1">
      `,
    renderRadiusComparison(),
    `
      <div class="sidebar-primary" id="experimentTools">
        `,
    renderDidacticSection(),
    `
        <div class="observatory-model-tools">
        <details class="model-tools" id="modelTools"><summary>System parameters &amp; quick controls</summary>
        `,
    renderParametersTemplate(),
    `
        </details>
        <details class="model-tools"><summary>Display, history &amp; model limits</summary>
        <section class="panel display-controls" aria-labelledby="displayControlsTitle">
          <h2 id="displayControlsTitle">Display</h2>
          `,
    renderPlotControls(),
    `
        </section>
        <section class="panel model-boundary" data-product-mode="simulation" aria-labelledby="modelBoundaryTitle">
          <p class="eyebrow">Educational model</p>
          <h2 id="modelBoundaryTitle">Interactive V4 preview</h2>
          <p class="help">Designed for learning and exploration. Scientific execution remains a separate, explicit workspace.</p>
          <a href="https://github.com/sebastianspicker/otherlight/blob/main/docs/physics/model-status.md">
            View model limits
          </a>
        </section>
        <div class="sidebar-events">`,
    renderOcSection(),
    `</div>
        </details>
        </div>
      </div>
    </aside>
  `,
  ].join("");
}
