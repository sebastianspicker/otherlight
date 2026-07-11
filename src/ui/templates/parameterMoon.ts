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
