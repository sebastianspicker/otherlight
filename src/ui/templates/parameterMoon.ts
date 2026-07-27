/**
 * Owns parameter Moon support within the ui layer. Keeps DOM-facing behavior separate from application orchestration.
 */
import { renderMoonCoreControls, renderMoonPhaseControls } from "./parameterMoonCore";
import { renderMoonShapeControls, renderMoonThermalInertiaControls } from "./parameterMoonShape";

export function renderMoonFieldset(): string {
  return `
      <fieldset>
        <legend>Moon (Exomoon)</legend>
        ${renderMoonCoreControls()}
        ${renderMoonPhaseControls()}
        ${renderMoonThermalInertiaControls()}
        ${renderMoonShapeControls()}
      </fieldset>
  `;
}
