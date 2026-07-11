// src/app/visualizationScene.ts
//
// Scene-view didactic overlay builder — constructs geometric annotations
// (chord lines, contact points, badges) for the transit scene canvas.

import type { SystemParams } from "../core/types";
import type { SimulationStepV3 } from "../sim/v3/types";
import type { LightCurveBadge } from "../render/lightCurvePlotTypes";
import type { SceneDidacticOverlayState, SceneGhostGeometry } from "../render/sceneTypes";
import {
  sceneChordContactPoints,
  sceneChordLines,
  sceneFeatureBadges,
  sceneMutualOverlapBadges,
  sceneOccultedPatchBadges,
  sceneBarycenterPoint,
  scenePhysicsBadges,
  sceneTimingBadges,
  sceneVisibilityBadges,
} from "./visualizationSceneHelpers";

export function buildSceneDidacticOverlay(args: {
  params: SystemParams;
  step: SimulationStepV3;
  tSec: number;
  ghosts?: SceneGhostGeometry[];
  extraBadges?: LightCurveBadge[];
}): SceneDidacticOverlayState {
  const { params, step, tSec, ghosts = [], extraBadges = [] } = args;
  const overlay: SceneDidacticOverlayState = { lines: [], points: [], badges: [], ghosts };
  const planet = step.renderSignals.occulterGeometry.find((item) => item.body === "planet");
  const moon = step.renderSignals.occulterGeometry.find((item) => item.body === "moon");

  const chords = sceneChordLines(params, planet, moon);
  overlay.lines?.push(...chords.lines);
  overlay.points?.push(...sceneChordContactPoints(chords));
  overlay.badges?.push(...sceneOccultedPatchBadges(params, planet));
  overlay.badges?.push(...sceneVisibilityBadges(step));
  overlay.badges?.push(...sceneFeatureBadges(params));

  const barycenterPoint = sceneBarycenterPoint(params, planet, moon);
  if (barycenterPoint) overlay.points?.push(barycenterPoint);

  overlay.badges?.push(...sceneTimingBadges(step));
  overlay.badges?.push(...sceneMutualOverlapBadges(planet, moon));
  overlay.badges?.push(...scenePhysicsBadges(step));
  for (const badge of extraBadges) overlay.badges?.push({ label: badge.label, color: badge.color });
  overlay.badges?.push({ label: `t=${tSec.toFixed(0)} s`, color: "#adb5bd" });
  return overlay;
}

export function createGhostGeometry(
  label: string,
  step: SimulationStepV3,
  color: string,
): SceneGhostGeometry {
  return {
    label,
    color,
    geometry: step.renderSignals.occulterGeometry.map((item) => ({ ...item })),
  };
}
