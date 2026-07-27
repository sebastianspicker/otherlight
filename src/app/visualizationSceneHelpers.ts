/**
 * Owns visualization Scene Helpers support within the app layer. Keeps application bootstrap and frame orchestration composable.
 */
import type { BrightnessPatch, SystemParams } from "../core/types";
import type { LightCurveBadge } from "../render/lightCurvePlotTypes";
import type { SceneDidacticOverlayState } from "../render/sceneTypes";
import type { RenderOcculterGeometryV3, SimulationStepV3 } from "../sim/v3/types";

type ScenePoint = NonNullable<SceneDidacticOverlayState["points"]>[number];
type SceneLine = NonNullable<SceneDidacticOverlayState["lines"]>[number];

type SceneChordLines = {
  lines: SceneLine[];
  planetChord?: SceneLine;
  moonChord?: SceneLine;
};

export function detectOccultedPatchLabel(
  params: SystemParams,
  center: { x: number; y: number },
  radius: number,
): string[] {
  const patches = params.star.photometry?.brightnessPatches ?? [];
  const labels: string[] = [];
  for (const patch of patches) {
    if (patchOverlapsOcculter(patch, center, radius)) labels.push(occultedPatchKind(patch));
  }
  return labels;
}

function isFiniteNumber(value: number | undefined): value is number {
  return Number.isFinite(value);
}

function patchOverlapsOcculter(
  patch: BrightnessPatch,
  center: { x: number; y: number },
  radius: number,
): boolean {
  if (!isFiniteNumber(patch.x) || !isFiniteNumber(patch.y)) return false;
  const distance = Math.hypot(patch.x - center.x, patch.y - center.y);
  return distance <= radius + Math.max(0, patchRadiusScale(patch));
}

function patchRadiusScale(patch: BrightnessPatch): number {
  if (isFiniteNumber(patch.r)) return patch.r;
  if (!isFiniteNumber(patch.rx)) return 0;
  return Math.max(patch.rx, isFiniteNumber(patch.ry) ? patch.ry : 0);
}

function occultedPatchKind(patch: BrightnessPatch): string {
  return isFiniteNumber(patch.factor) && patch.factor < 1 ? "occulted spot" : "occulted facula";
}

export function occultingRadius(geometry: RenderOcculterGeometryV3): number {
  if (geometry.kind === "circle") return geometry.radius;
  if (geometry.kind === "ellipse") return Math.max(geometry.rx, geometry.ry);
  return geometry.outerRadius;
}

function bodyChordLine(
  geometry: RenderOcculterGeometryV3 | undefined,
  rStar: number,
  label: string,
  color: string,
): SceneLine | undefined {
  if (!geometry || !Number.isFinite(rStar) || rStar <= 0) return undefined;
  const y = geometry.center.y;
  if (!Number.isFinite(y) || Math.abs(y) >= rStar) return undefined;
  const x = Math.sqrt(Math.max(0, rStar * rStar - y * y));
  return { x1: -x, y1: y, x2: x, y2: y, color, label, dashed: true };
}

export function sceneChordLines(
  params: SystemParams,
  planet: RenderOcculterGeometryV3 | undefined,
  moon: RenderOcculterGeometryV3 | undefined,
): SceneChordLines {
  const planetChord = bodyChordLine(planet, params.star.r, "planet chord", "#8ecae6");
  const moonChord = bodyChordLine(moon, params.star.r, "moon chord", "#adb5bd");
  return {
    lines: [planetChord, moonChord].filter((line): line is SceneLine => Boolean(line)),
    planetChord,
    moonChord,
  };
}

function contactPointsForChord(chord: SceneLine | undefined, label: string, color: string): ScenePoint[] {
  if (!chord) return [];
  return [
    { x: chord.x1, y: chord.y1, color, label },
    { x: chord.x2, y: chord.y2, color },
  ];
}

export function sceneChordContactPoints(chords: SceneChordLines): ScenePoint[] {
  return [
    ...contactPointsForChord(chords.planetChord, "P contact", "#8ecae6"),
    ...contactPointsForChord(chords.moonChord, "M contact", "#adb5bd"),
  ];
}

export function sceneOccultedPatchBadges(
  params: SystemParams,
  planet: RenderOcculterGeometryV3 | undefined,
): LightCurveBadge[] {
  if (!planet || planet.body !== "planet") return [];
  return detectOccultedPatchLabel(params, planet.center, occultingRadius(planet)).map((label) => ({
    label,
    color: "#f28482",
  }));
}

function visibilityBadge(
  label: string,
  value: number | undefined,
  color: string,
): LightCurveBadge | undefined {
  if (!isFiniteNumber(value) || value >= 0.999) return undefined;
  return { label: `${label} visible ${value.toFixed(2)}`, color };
}

export function sceneVisibilityBadges(step: SimulationStepV3): LightCurveBadge[] {
  return [
    visibilityBadge("planet", step.renderSignals.visibilityFractions.planet, "#8ecae6"),
    visibilityBadge("moon", step.renderSignals.visibilityFractions.moon, "#adb5bd"),
  ].filter((badge): badge is LightCurveBadge => Boolean(badge));
}

export function sceneFeatureBadges(params: SystemParams): LightCurveBadge[] {
  const badges: LightCurveBadge[] = [];
  if (
    params.planet?.rings &&
    Number.isFinite(params.planet.rings.outerRadius) &&
    params.planet.rings.outerRadius > 0
  ) {
    badges.push({ label: "ring orientation active", color: "#ffb703" });
  }
  if (
    params.star.photometry?.atmosphereTransmission?.enabled ||
    params.star.photometry?.atmosphereRT?.enabled
  ) {
    badges.push({ label: "transmissive halo", color: "#cdb4db" });
  }
  return badges;
}

function positiveFiniteMass(value: number | undefined): number | undefined {
  return isFiniteNumber(value) && value > 0 ? value : undefined;
}

export function sceneBarycenterPoint(
  params: SystemParams,
  planet: RenderOcculterGeometryV3 | undefined,
  moon: RenderOcculterGeometryV3 | undefined,
): ScenePoint | undefined {
  const planetMass = positiveFiniteMass(params.planet?.m);
  const moonMass = params.moon ? positiveFiniteMass(params.moon.m) : undefined;
  if (!planet || !moon || planetMass === undefined || moonMass === undefined) return undefined;

  const totalMass = planetMass + moonMass;
  return {
    x: (planet.center.x * planetMass + moon.center.x * moonMass) / totalMass,
    y: (planet.center.y * planetMass + moon.center.y * moonMass) / totalMass,
    color: "#ffd166",
    label: "barycenter",
  };
}

function leadLagBadge(leadLagSec: number): LightCurveBadge | undefined {
  if (!(Math.abs(leadLagSec) > 1)) return undefined;
  return {
    label:
      leadLagSec < 0
        ? `moon leads by ${Math.abs(leadLagSec).toFixed(0)} s`
        : `moon trails by ${Math.abs(leadLagSec).toFixed(0)} s`,
    color: "#ffd166",
  };
}

export function sceneTimingBadges(step: SimulationStepV3): LightCurveBadge[] {
  const planetTransitCenterSec = step.timing?.planetTransitCenterSec;
  const moonTransitCenterSec = step.timing?.moonTransitCenterSec;
  if (!isFiniteNumber(planetTransitCenterSec) || !isFiniteNumber(moonTransitCenterSec)) return [];

  const badge = leadLagBadge(moonTransitCenterSec - planetTransitCenterSec);
  return badge ? [badge] : [];
}

export function sceneMutualOverlapBadges(
  planet: RenderOcculterGeometryV3 | undefined,
  moon: RenderOcculterGeometryV3 | undefined,
): LightCurveBadge[] {
  if (!planet || !moon) return [];
  const separation = Math.hypot(planet.center.x - moon.center.x, planet.center.y - moon.center.y);
  return separation < occultingRadius(planet) + occultingRadius(moon)
    ? [{ label: "mutual overlap", color: "#ffd166" }]
    : [];
}

function clockOffsetBadge(step: SimulationStepV3): LightCurveBadge | undefined {
  const offset = step.physicsDiagnostics.advancedTiming?.barycentricClockOffsetSec;
  if (!isFiniteNumber(offset)) return undefined;
  return { label: `clock offset ${offset.toFixed(0)} s`, color: "#ffb703" };
}

function einsteinDelayBadge(step: SimulationStepV3): LightCurveBadge | undefined {
  const advancedTiming = step.physicsDiagnostics.advancedTiming;
  const delaySec = (advancedTiming?.einsteinPlanetSec ?? 0) + (advancedTiming?.einsteinMoonSec ?? 0);
  if (!Number.isFinite(delaySec) || Math.abs(delaySec) <= 0) return undefined;
  return { label: `Einstein delay ${delaySec.toExponential(1)} s`, color: "#ffb703" };
}

function closeEncounterBadge(step: SimulationStepV3): LightCurveBadge | undefined {
  return step.physicsDiagnostics.closeEncounterFlags.length > 0
    ? { label: "close encounter warning", color: "#ef476f" }
    : undefined;
}

export function scenePhysicsBadges(step: SimulationStepV3): LightCurveBadge[] {
  return [clockOffsetBadge(step), einsteinDelayBadge(step), closeEncounterBadge(step)].filter(
    (badge): badge is LightCurveBadge => Boolean(badge),
  );
}
