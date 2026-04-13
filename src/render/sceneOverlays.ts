import type { SystemParams } from "../core/types";
import type { RenderOcculterGeometryV3, SimulationStepV3 } from "../sim/v3/types";

import { bodyColor, drawBodyWithOcclusionHint, drawEllipseBodyWithOcclusionHint } from "./sceneBodies";
import { atmosphereHaloStyle, drawAtmosphereHalo, drawRingAnnulus, ringColor } from "./sceneAtmosphereRings";
import { drawStarGeometry } from "./sceneStars";
import type { DebugOverlayDataV3 } from "./overlays";
import type {
  SceneDidacticOverlayState,
  ScratchPoint,
  SceneGhostGeometry,
  ToPxInto,
} from "./sceneTypes";
import type { StarDiskCache } from "./starDisk";

const MONO_FONT = "11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

export function resolveOcculterGeometry(
  params: SystemParams,
  step: SimulationStepV3,
): RenderOcculterGeometryV3[] {
  const fromSignals = step.renderSignals?.occulterGeometry ?? [];
  if (fromSignals.length > 0) return fromSignals;

  const fallback: RenderOcculterGeometryV3[] = [
    {
      body: "planet",
      kind: "circle",
      center: step.kinematics.planetSky,
      radius: params.planet.r,
    },
  ];
  if (params.moon && step.kinematics.moonSky) {
    fallback.push({
      body: "moon",
      kind: "circle",
      center: step.kinematics.moonSky,
      radius: params.moon.r,
    });
  }
  return fallback;
}

export function fillOverlayData(overlayData: DebugOverlayDataV3, step: SimulationStepV3): DebugOverlayDataV3 {
  overlayData.nOcculters = step.debug?.nOcculters ?? step.renderSignals.occulterGeometry.length;
  overlayData.bPlanet = step.debug?.bPlanet;
  overlayData.bMoon = step.debug?.bMoon;
  overlayData.tdvRatio = step.debug?.tdvRatio;
  overlayData.vPlanetSky = step.debug?.vPlanetSky;
  overlayData.vPlanetSkyRef = step.debug?.vPlanetSkyRef;
  overlayData.baselineFluxUsed = step.debug?.baselineFluxUsed ?? step.flux.stellarPreTransit;
  overlayData.displayFluxValue = step.debug?.displayFluxValue ?? step.flux.total;
  overlayData.stellarVariabilityFlux = step.debug?.stellarVariabilityFlux ?? step.flux.stellarVariability;
  overlayData.fluxTransitFactor = step.flux.transitFactor;
  overlayData.fluxTotal = step.flux.total;
  return overlayData;
}

export function drawEventMarkers(args: {
  ctx: CanvasRenderingContext2D;
  cssH: number;
  markers: SimulationStepV3["renderSignals"]["eventMarkers"];
  timingMarkers?: SimulationStepV3["renderSignals"]["timingMarkers"];
}): void {
  const { ctx, cssH, markers, timingMarkers = [] } = args;
  let activeCount = 0;
  for (const marker of markers) {
    if (marker.active) activeCount++;
  }
  const timingCount = timingMarkers.filter((marker) => Number.isFinite(marker.seconds)).length;
  if (activeCount === 0 && timingCount === 0) return;

  const x0 = 10;
  let y = Math.max(20, cssH - 20 - (activeCount + timingCount) * 18);

  ctx.save();
  ctx.font = MONO_FONT;
  for (const marker of markers) {
    if (!marker.active) continue;
    ctx.fillStyle = "rgba(20,20,20,0.65)";
    const text = `event: ${marker.label}`;
    const width = ctx.measureText(text).width + 12;
    ctx.fillRect(x0 - 4, y - 10, width, 14);
    ctx.fillStyle = "rgba(255,255,255,0.90)";
    ctx.fillText(text, x0, y);
    y += 16;
  }
  for (const marker of timingMarkers) {
    if (!Number.isFinite(marker.seconds)) continue;
    ctx.fillStyle = "rgba(20,20,20,0.65)";
    const text = `${marker.id}: ${(marker.seconds as number).toFixed(0)} s`;
    const width = ctx.measureText(text).width + 12;
    ctx.fillRect(x0 - 4, y - 10, width, 14);
    ctx.fillStyle = "rgba(255,214,102,0.92)";
    ctx.fillText(text, x0, y);
    y += 16;
  }
  ctx.restore();
}

function drawGhostGeometry(args: {
  ctx: CanvasRenderingContext2D;
  toPxInto: ToPxInto;
  scratchPoint: ScratchPoint;
  pixelsPerUnit: number;
  ghost: SceneGhostGeometry;
}): void {
  const { ctx, toPxInto, scratchPoint, pixelsPerUnit, ghost } = args;
  const color = ghost.color ?? "rgba(255,255,255,0.28)";
  for (const geometry of ghost.geometry) {
    const p = toPxInto(geometry.center.x, geometry.center.y, scratchPoint);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.25;
    ctx.setLineDash([5, 4]);
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    if (geometry.kind === "circle") {
      ctx.arc(p.x, p.y, geometry.radius * pixelsPerUnit, 0, Math.PI * 2);
    } else if (geometry.kind === "ellipse") {
      ctx.ellipse(
        p.x,
        p.y,
        geometry.rx * pixelsPerUnit,
        geometry.ry * pixelsPerUnit,
        geometry.angle,
        0,
        Math.PI * 2,
      );
    } else {
      const q = Math.max(0.05, Math.abs(Math.cos(Number.isFinite(geometry.inclination) ? geometry.inclination : 0)));
      ctx.ellipse(
        p.x,
        p.y,
        geometry.outerRadius * pixelsPerUnit,
        geometry.outerRadius * pixelsPerUnit * q,
        geometry.angle,
        0,
        Math.PI * 2,
      );
      ctx.moveTo(p.x + geometry.innerRadius * pixelsPerUnit, p.y);
      ctx.ellipse(
        p.x,
        p.y,
        geometry.innerRadius * pixelsPerUnit,
        geometry.innerRadius * pixelsPerUnit * q,
        geometry.angle,
        0,
        Math.PI * 2,
      );
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.font = MONO_FONT;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(ghost.label, p.x + 8, p.y - 6);
    ctx.restore();
  }
}

export function drawDidacticOverlay(args: {
  ctx: CanvasRenderingContext2D;
  toPxInto: ToPxInto;
  scratchPoint: ScratchPoint;
  pixelsPerUnit: number;
  cssW: number;
  overlay?: SceneDidacticOverlayState;
}): void {
  const { ctx, toPxInto, scratchPoint, pixelsPerUnit, cssW, overlay } = args;
  if (!overlay) return;

  for (const ghost of overlay.ghosts ?? []) {
    drawGhostGeometry({ ctx, toPxInto, scratchPoint, pixelsPerUnit, ghost });
  }

  for (const line of overlay.lines ?? []) {
    const p0 = toPxInto(line.x1, line.y1, scratchPoint);
    const p1 = toPxInto(line.x2, line.y2, scratchPoint);
    ctx.save();
    ctx.strokeStyle = line.color ?? "rgba(255,255,255,0.55)";
    ctx.lineWidth = 1.2;
    if (line.dashed) ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
    ctx.setLineDash([]);
    if (line.label) {
      ctx.fillStyle = line.color ?? "rgba(255,255,255,0.9)";
      ctx.font = MONO_FONT;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(line.label, 0.5 * (p0.x + p1.x), Math.min(p0.y, p1.y) - 4);
    }
    ctx.restore();
  }

  for (const point of overlay.points ?? []) {
    const p = toPxInto(point.x, point.y, scratchPoint);
    ctx.save();
    ctx.fillStyle = point.color ?? "rgba(255,214,102,0.95)";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
    if (point.label) {
      ctx.font = MONO_FONT;
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText(point.label, p.x + 5, p.y - 4);
    }
    ctx.restore();
  }

  const badges = overlay.badges ?? [];
  if (badges.length > 0) {
    let x = Math.max(12, cssW - 320);
    let y = 12;
    ctx.save();
    ctx.font = MONO_FONT;
    for (const badge of badges) {
      const width = ctx.measureText(badge.label).width + 16;
      if (x + width > cssW - 12) {
        x = Math.max(12, cssW - 320);
        y += 18;
      }
      ctx.fillStyle = "rgba(20,20,20,0.68)";
      ctx.fillRect(x, y, width, 14);
      ctx.fillStyle = badge.color ?? "rgba(255,255,255,0.92)";
      ctx.fillText(badge.label, x + 8, y + 11);
      x += width + 6;
    }
    ctx.restore();
  }
}

export function drawOcculterGeometry(args: {
  ctx: CanvasRenderingContext2D;
  toPxInto: ToPxInto;
  scratchPoint: ScratchPoint;
  pixelsPerUnit: number;
  starDiskCache: StarDiskCache;
  secondaryStarParamsScratch: SystemParams;
  params: SystemParams;
  geometry: RenderOcculterGeometryV3;
  rStar: number;
  resolveSecondaryStarParams: (r: number) => SystemParams;
}): void {
  const {
    ctx,
    toPxInto,
    scratchPoint,
    pixelsPerUnit,
    starDiskCache,
    secondaryStarParamsScratch,
    params,
    geometry,
    rStar,
    resolveSecondaryStarParams,
  } = args;

  if (geometry.body === "star" && geometry.kind === "circle") {
    drawStarGeometry({
      ctx,
      toPxInto,
      scratchPoint,
      pixelsPerUnit,
      starDiskCache,
      params: secondaryStarParamsScratch,
      x: geometry.center.x,
      y: geometry.center.y,
      r: geometry.radius,
      z: geometry.center.z,
      variant: "secondary",
      resolveSecondaryStarParams,
    });
    return;
  }

  if (geometry.kind === "circle") {
    const halo =
      geometry.body === "planet" || geometry.body === "moon"
        ? atmosphereHaloStyle(params, geometry.body, geometry.radius)
        : null;
    if (halo) {
      drawAtmosphereHalo({
        ctx,
        toPxInto,
        scratchPoint,
        pixelsPerUnit,
        x: geometry.center.x,
        y: geometry.center.y,
        innerRadius: geometry.radius,
        outerRadius: halo.outerRadius,
        zBody: geometry.center.z,
        innerColor: halo.innerColor,
        outerColor: halo.outerColor,
        alphaScale: halo.alphaScale,
      });
    }
    drawBodyWithOcclusionHint({
      ctx,
      toPxInto,
      scratchPoint,
      pixelsPerUnit,
      x: geometry.center.x,
      y: geometry.center.y,
      rBody: geometry.radius,
      zBody: geometry.center.z,
      rStar,
      baseColor: bodyColor(geometry.body),
    });
    return;
  }

  if (geometry.kind === "ellipse") {
    drawEllipseBodyWithOcclusionHint({
      ctx,
      toPxInto,
      scratchPoint,
      pixelsPerUnit,
      x: geometry.center.x,
      y: geometry.center.y,
      rx: geometry.rx,
      ry: geometry.ry,
      angle: geometry.angle,
      zBody: geometry.center.z,
      rStar,
      baseColor: bodyColor(geometry.body),
    });
    return;
  }

  drawRingAnnulus({
    ctx,
    toPxInto,
    scratchPoint,
    pixelsPerUnit,
    x: geometry.center.x,
    y: geometry.center.y,
    z: geometry.center.z,
    innerRadius: geometry.innerRadius,
    outerRadius: geometry.outerRadius,
    inclination: geometry.inclination,
    angle: geometry.angle,
    color: ringColor(geometry.body),
  });
}
