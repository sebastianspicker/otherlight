/**
 * Owns types support within the sim layer. Keeps simulation state and numerical execution separate from UI coordination.
 */
import type {
  BinaryStarPhotometryParams,
  DidacticSignals,
  DidacticsParams,
  OrbitElements,
  Observer,
  PhotometryParams,
  StepResult,
  BrowserScenarioDraft,
  SystemDynamicsParams,
} from "../../model/types";
import type { Body } from "../../model/types";

export type BinaryLabMode = "detached-binary-lab" | "general-lab";
export type RuntimeModeV4 = "realtime" | "reference";
export type RuntimeExecutionModeV4 = "interactive" | "scientific-browser";

/** Optional didactics integration supplied by the application to a V4 runtime. */
export type ComputeDidacticSignalsFn = (
  system: BrowserScenarioDraft,
  step: StepResult,
) => DidacticSignals | undefined;

export type BinaryLabConfigV4 = {
  enabled?: boolean;
  hideSkyUntilReveal?: boolean;
  requireHypothesis?: boolean;
  lockParamsUntilHypothesis?: boolean;
};

export type RuntimeConfigV4 = {
  mode?: RuntimeModeV4;
  referenceSubsteps?: number;
  executionMode?: RuntimeExecutionModeV4;
};

export type StarBodyV4 = Body &
  BinaryStarPhotometryParams & {
    id: string;
  };

export type PlanetBodyV4 = Body & {
  id: string;
  orbit: OrbitElements;
  parentStarId?: string;
  parentSystem?: "star" | "circumbinary";
};

export type MoonBodyV4 = Body & {
  id: string;
  orbit: OrbitElements;
  parentPlanetId: string;
};

export type HierarchyLinkV4 = {
  childId: string;
  parentId: string;
  relation: "orbits";
};

export type OrbitsV4 = {
  binary: OrbitElements;
  hierarchy: HierarchyLinkV4[];
};

export type BodiesV4 = {
  stars: [StarBodyV4, StarBodyV4];
  planets: PlanetBodyV4[];
  moons: MoonBodyV4[];
};

/**
 * Validated educational scenario accepted by the V4 runtime.
 * The serialized wire marker remains `version: "4"` for workspace compatibility.
 */
export type EducationScenarioV4 = {
  version: "4";
  mode: BinaryLabMode;
  runtime?: RuntimeConfigV4;
  observer?: Observer;
  binaryLab?: BinaryLabConfigV4;
  bodies: BodiesV4;
  orbits: OrbitsV4;
  photometry?: PhotometryParams;
  dynamics?: SystemDynamicsParams;
  didactics?: DidacticsParams;
};
