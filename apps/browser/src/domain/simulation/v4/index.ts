/** Defines the supported V4 simulation import surface for application consumers. */
export type {
  BinaryLabConfigV4,
  BinaryLabMode,
  ComputeDidacticSignalsFn,
  EducationScenarioV4,
  RuntimeExecutionModeV4,
  RuntimeConfigV4,
  RuntimeModeV4,
  BodiesV4,
  HierarchyLinkV4,
  MoonBodyV4,
  OrbitsV4,
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
export { createReferenceSimulationV4 } from "./referenceRuntime";
export { sanitizeStaticOrbit, defaultBinaryOrbit } from "./orbitSanitizer";
export {
  ScientificBrowserRuntimeError,
  createScientificBrowserRuntimeError,
  isScientificBrowserRuntimeError,
} from "./scientificErrors";
