/**
 * Renders the dynamics parameter fieldsets.
 */
import { renderDayNightFieldset, renderExomoonTimingFieldset } from "./parameterTiming";

export function renderDynamicsFieldsets(): string {
  return `
      ${renderDayNightFieldset()}
      ${renderExomoonTimingFieldset()}
  `;
}
