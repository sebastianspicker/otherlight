/** Defines the supported V4 simulation import surface for application consumers. */
export type {
  EducationScenarioV4,
  RuntimeExecutionModeV4,
  RuntimeModeV4,
  MoonBodyV4,
  PlanetBodyV4,
  StarBodyV4,
} from "./types";

export { toBrowserScenarioDraftFromEducationScenarioV4 } from "./adapter";
export { createSimulationV4, type SimulationRuntimeDependenciesV4 } from "./runtime";
export {
  isEducationScenarioV4,
  mapBrowserScenarioDraftToEducationScenarioV4,
  normalizeEducationScenarioV4Input,
} from "./migrate";
export { ScientificBrowserRuntimeError } from "./scientificErrors";
