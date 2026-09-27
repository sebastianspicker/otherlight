/**
 * Renders the planet and moon parameter bodies.
 */
import { renderDynamicsFieldsets } from "./parameterDynamics";
import { renderMoonFieldset } from "./parameterMoon";
import { renderPlanetFieldset } from "./parameterPlanet";

export function renderParameterBodiesTemplate(): string {
  return `
    <div class="paramCol">
      ${renderPlanetFieldset()}
      ${renderMoonFieldset()}
      ${renderDynamicsFieldsets()}
    </div>
  `;
}
