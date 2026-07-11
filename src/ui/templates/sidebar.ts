import { renderDidacticSection } from "./sidebarDidactics";
import { renderOcSection, renderPlotControls } from "./sidebarRuntime";

export function renderSidebarTemplate(): string {
  return `
    <aside class="panel sidebar">
      <h2>Workspace</h2>
      ${renderPlotControls()}
      ${renderOcSection()}
      ${renderDidacticSection()}
    </aside>
  `;
}
