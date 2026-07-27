/**
 * Owns parameter Dynamics support within the ui layer. Keeps DOM-facing behavior separate from application orchestration.
 */
import { renderNBodyFieldset } from "./parameterNBody";
import { renderRelativityFieldset } from "./parameterRelativity";
import { renderDayNightFieldset, renderExomoonTimingFieldset } from "./parameterTiming";

export function renderDynamicsFieldsets(): string {
  return `
      ${renderDayNightFieldset()}
      ${renderExomoonTimingFieldset()}
      ${renderNBodyFieldset()}
      ${renderRelativityFieldset()}
  `;
}
