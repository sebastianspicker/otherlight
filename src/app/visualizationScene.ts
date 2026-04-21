// src/app/visualizationScene.ts
//
// Scene-view didactic overlay builder — constructs geometric annotations
// (chord lines, contact points, badges) for the transit scene canvas.

import type { SystemParams } from "../core/types";
import type { SimulationStepV3, RenderOcculterGeometryV3 } from "../sim/v3/types";
import type { LightCurveBadge } from "../render/lightCurvePlotTypes";
import type { SceneDidacticOverlayState, SceneGhostGeometry } from "../render/sceneTypes";

function detectOccultedPatchLabel(
  params: SystemParams,
  center: { x: number; y: number },
  radius: number,
): string[] {
  const patches = params.star.photometry?.brightnessPatches ?? [];
  const labels: string[] = [];
  for (const patch of patches) {
    if (!Number.isFinite(patch.x) || !Number.isFinite(patch.y)) continue;
    const d = Math.hypot((patch.x as number) - center.x, (patch.y as number) - center.y);
    const patchScale = Number.isFinite(patch.r)
      ? (patch.r as number)
      : Number.isFinite(patch.rx)
        ? Math.max(patch.rx as number, patch.ry ?? 0)
        : 0;
    if (!(d <= radius + Math.max(0, patchScale))) continue;
    const kind =
      Number.isFinite(patch.factor) && (patch.factor as number) < 1 ? "occulted spot" : "occulted facula";
    labels.push(kind);
  }
  return labels;
}

function bodyChordLine(
  geometry: RenderOcculterGeometryV3 | undefined,
  rStar: number,
  label: string,
  color: string,
): NonNullable<SceneDidacticOverlayState["lines"]>[number] | undefined {
  if (!geometry || !Number.isFinite(rStar) || rStar <= 0) return undefined;
  const y = geometry.center.y;
  if (!Number.isFinite(y) || Math.abs(y) >= rStar) return undefined;
  const x = Math.sqrt(Math.max(0, rStar * rStar - y * y));
  return { x1: -x, y1: y, x2: x, y2: y, color, label, dashed: true };
}

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
  const rStar = params.star.r;

  const planetChord = bodyChordLine(planet, rStar, "planet chord", "#8ecae6");
  if (planetChord) overlay.lines?.push(planetChord);
  const moonChord = bodyChordLine(moon, rStar, "moon chord", "#adb5bd");
  if (moonChord) overlay.lines?.push(moonChord);

  if (planetChord) {
    overlay.points?.push({ x: planetChord.x1, y: planetChord.y1, color: "#8ecae6", label: "P contact" });
    overlay.points?.push({ x: planetChord.x2, y: planetChord.y2, color: "#8ecae6" });
  }
  if (moonChord) {
    overlay.points?.push({ x: moonChord.x1, y: moonChord.y1, color: "#adb5bd", label: "M contact" });
    overlay.points?.push({ x: moonChord.x2, y: moonChord.y2, color: "#adb5bd" });
  }

  if (planet && planet.body === "planet") {
    for (const label of detectOccultedPatchLabel(
      params,
      planet.center,
      planet.kind === "circle"
        ? planet.radius
        : planet.kind === "ellipse"
          ? Math.max(planet.rx, planet.ry)
          : planet.outerRadius,
    )) {
      overlay.badges?.push({ label, color: "#f28482" });
    }
  }

  if (
    Number.isFinite(step.renderSignals.visibilityFractions.planet) &&
    (step.renderSignals.visibilityFractions.planet as number) < 0.999
  ) {
    overlay.badges?.push({
      label: `planet visible ${(step.renderSignals.visibilityFractions.planet as number).toFixed(2)}`,
      color: "#8ecae6",
    });
  }
  if (
    Number.isFinite(step.renderSignals.visibilityFractions.moon) &&
    (step.renderSignals.visibilityFractions.moon as number) < 0.999
  ) {
    overlay.badges?.push({
      label: `moon visible ${(step.renderSignals.visibilityFractions.moon as number).toFixed(2)}`,
      color: "#adb5bd",
    });
  }

  if (
    params.planet?.rings &&
    Number.isFinite(params.planet.rings.outerRadius) &&
    params.planet.rings.outerRadius > 0
  ) {
    overlay.badges?.push({ label: "ring orientation active", color: "#ffb703" });
  }
  if (
    params.star.photometry?.atmosphereTransmission?.enabled ||
    params.star.photometry?.atmosphereRT?.enabled
  ) {
    overlay.badges?.push({ label: "transmissive halo", color: "#cdb4db" });
  }

  const planetMass = params.planet?.m;
  const moonMass = params.moon?.m;
  if (
    params.moon &&
    planet &&
    moon &&
    Number.isFinite(planetMass) &&
    Number.isFinite(moonMass) &&
    (planetMass as number) > 0 &&
    (moonMass as number) > 0
  ) {
    const totalMass = (planetMass as number) + (moonMass as number);
    overlay.points?.push({
      x: (planet.center.x * (planetMass as number) + moon.center.x * (moonMass as number)) / totalMass,
      y: (planet.center.y * (planetMass as number) + moon.center.y * (moonMass as number)) / totalMass,
      color: "#ffd166",
      label: "barycenter",
    });
  }

  if (
    Number.isFinite(step.timing?.planetTransitCenterSec) &&
    Number.isFinite(step.timing?.moonTransitCenterSec)
  ) {
    const leadLagSec =
      (step.timing?.moonTransitCenterSec as number) - (step.timing?.planetTransitCenterSec as number);
    if (Math.abs(leadLagSec) > 1) {
      overlay.badges?.push({
        label:
          leadLagSec < 0
            ? `moon leads by ${Math.abs(leadLagSec).toFixed(0)} s`
            : `moon trails by ${Math.abs(leadLagSec).toFixed(0)} s`,
        color: "#ffd166",
      });
    }
  }
  if (planet && moon) {
    const planetRadius =
      planet.kind === "circle"
        ? planet.radius
        : planet.kind === "ellipse"
          ? Math.max(planet.rx, planet.ry)
          : planet.outerRadius;
    const moonRadius =
      moon.kind === "circle"
        ? moon.radius
        : moon.kind === "ellipse"
          ? Math.max(moon.rx, moon.ry)
          : moon.outerRadius;
    const separation = Math.hypot(planet.center.x - moon.center.x, planet.center.y - moon.center.y);
    if (separation < planetRadius + moonRadius) {
      overlay.badges?.push({ label: "mutual overlap", color: "#ffd166" });
    }
  }

  if (Number.isFinite(step.physicsDiagnostics.advancedTiming?.barycentricClockOffsetSec)) {
    overlay.badges?.push({
      label: `clock offset ${(step.physicsDiagnostics.advancedTiming?.barycentricClockOffsetSec as number).toFixed(0)} s`,
      color: "#ffb703",
    });
  }
  const advancedTiming = step.physicsDiagnostics.advancedTiming;
  const einsteinDelaySec = (advancedTiming?.einsteinPlanetSec ?? 0) + (advancedTiming?.einsteinMoonSec ?? 0);
  if (Number.isFinite(einsteinDelaySec) && Math.abs(einsteinDelaySec) > 0) {
    overlay.badges?.push({
      label: `Einstein delay ${einsteinDelaySec.toExponential(1)} s`,
      color: "#ffb703",
    });
  }
  if (step.physicsDiagnostics.closeEncounterFlags.length > 0) {
    overlay.badges?.push({ label: "close encounter warning", color: "#ef476f" });
  }

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
