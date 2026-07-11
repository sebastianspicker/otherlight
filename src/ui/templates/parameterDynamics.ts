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
