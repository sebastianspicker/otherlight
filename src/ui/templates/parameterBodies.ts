/**
 * Owns parameter Bodies support within the ui layer. Keeps DOM-facing behavior separate from application orchestration.
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
