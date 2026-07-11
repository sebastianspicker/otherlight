import { renderBrightnessPatchControls, renderSpotEvolutionControls } from "./parameterStarActivity";
import { renderBandpassControls, renderStarCoreControls } from "./parameterStarCore";

export function renderStarFieldset(): string {
  return `
      <fieldset data-ui-tier="expert">
        <legend>Star</legend>
        ${renderStarCoreControls()}
        ${renderBandpassControls()}
        ${renderBrightnessPatchControls()}
        ${renderSpotEvolutionControls()}
      </fieldset>
  `;
}
