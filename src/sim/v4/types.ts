import type {
  DidacticsParams,
  OrbitElements,
  Observer,
  PhotometryParams,
  SystemDynamicsParams,
} from "../../core/types";
import type { Body } from "../../core/types";

export type BinaryLabMode = "detached-binary-lab" | "general-lab";
export type RuntimeModeV4 = "realtime" | "reference";

export type BinaryLabConfigV4 = {
  enabled?: boolean;
  hideSkyUntilReveal?: boolean;
  requireHypothesis?: boolean;
  lockParamsUntilHypothesis?: boolean;
};

export type RuntimeConfigV4 = {
  mode?: RuntimeModeV4;
  referenceSubsteps?: number;
};

export type StarBodyV4 = Body & {
  id: string;
  luminosityScale?: number;
  teffK?: number;
  loggCgs?: number;
  metallicityDex?: number;
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

export type SimulationConfigV4 = {
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

export type SystemParamsV4 = SimulationConfigV4;
