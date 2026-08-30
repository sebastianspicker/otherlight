/** Composes the planet parameter fieldset from focused controls without owning state. */
import { renderAtmosphereControls, renderScatteringControls } from "./parameterPlanetAtmosphere";
import { renderPlanetCoreControls, renderPlanetPhaseControls } from "./parameterPlanetCore";
import { renderPlanetShapeControls, renderPlanetThermalInertiaControls } from "./parameterPlanetShape";

export function renderPlanetFieldset(): string {
  return `
      <fieldset>
        <legend>Planet</legend>
        ${renderPlanetCoreControls()}
        ${renderPlanetPhaseControls()}
        ${renderPlanetThermalInertiaControls()}
        ${renderPlanetShapeControls()}
        ${renderScatteringControls()}
        ${renderAtmosphereControls()}
      </fieldset>
  `;
}
