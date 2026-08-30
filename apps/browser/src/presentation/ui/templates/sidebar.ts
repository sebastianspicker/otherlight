/**
 * Owns sidebar support within the ui layer. Keeps DOM-facing behavior separate from application orchestration.
 */
import { renderDidacticSection } from "./sidebarDidactics";
import { renderParametersTemplate } from "./parameters";
import { renderOcSection, renderPlotControls } from "./sidebarRuntime";

export function renderSidebarTemplate(): string {
  return `
    <aside class="sidebar" aria-label="Model and workspace controls">
      <div class="sidebar-primary">
        ${renderDidacticSection()}
        ${renderParametersTemplate()}
        <section class="panel display-controls" aria-labelledby="displayControlsTitle">
          <h2 id="displayControlsTitle">Display</h2>
          ${renderPlotControls()}
        </section>
        <section class="panel model-boundary" data-product-mode="simulation" aria-labelledby="modelBoundaryTitle">
          <p class="eyebrow">Educational model</p>
          <h2 id="modelBoundaryTitle">Interactive V4 preview</h2>
          <p class="help">Designed for learning and exploration. Scientific execution remains a separate, explicit workspace.</p>
          <a href="https://github.com/sebastianspicker/otherlight/blob/main/docs/physics/model-status.md">
            View model limits
          </a>
        </section>
      </div>
      <div class="sidebar-events">
        ${renderOcSection()}
      </div>
    </aside>
  `;
}
