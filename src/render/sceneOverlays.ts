import type { SystemParams } from "../core/types";
import type { RenderOcculterGeometryV3, SimulationStepV3 } from "../sim/v3/types";

import { bodyColor, drawBodyWithOcclusionHint, drawEllipseBodyWithOcclusionHint } from "./sceneBodies";
import { atmosphereHaloStyle, drawAtmosphereHalo, drawRingAnnulus, ringColor } from "./sceneAtmosphereRings";
import { drawStarGeometry } from "./sceneStars";
import type { DebugOverlayDataV3 } from "./overlays";
import type { SceneDidacticOverlayState, ScratchPoint, SceneGhostGeometry, ToPxInto } from "./sceneTypes";
import type { StarDiskCache } from "./starDisk";

const MONO_FONT = "11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

type EventMarker = SimulationStepV3["renderSignals"]["eventMarkers"][number];
type TimingMarker = NonNullable<SimulationStepV3["renderSignals"]["timingMarkers"]>[number];
type DidacticLine = NonNullable<SceneDidacticOverlayState["lines"]>[number];
type DidacticPoint = NonNullable<SceneDidacticOverlayState["points"]>[number];
type DidacticBadge = NonNullable<SceneDidacticOverlayState["badges"]>[number];

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
  overlayData.nOcculters = overlayDefault(step.debug?.nOcculters, step.renderSignals.occulterGeometry.length);
  overlayData.bPlanet = step.debug?.bPlanet;
  overlayData.bMoon = step.debug?.bMoon;
  overlayData.tdvRatio = step.debug?.tdvRatio;
  overlayData.vPlanetSky = step.debug?.vPlanetSky;
  overlayData.vPlanetSkyRef = step.debug?.vPlanetSkyRef;
  overlayData.baselineFluxUsed = overlayDefault(step.debug?.baselineFluxUsed, step.flux.stellarPreTransit);
  overlayData.displayFluxValue = overlayDefault(step.debug?.displayFluxValue, step.flux.total);
  overlayData.stellarVariabilityFlux = overlayDefault(
    step.debug?.stellarVariabilityFlux,
    step.flux.stellarVariability,
  );
  overlayData.fluxTransitFactor = step.flux.transitFactor;
  overlayData.fluxTotal = step.flux.total;
  return overlayData;
}

const overlayDefault = <T>(value: T | undefined, fallback: T): T => {
  return value ?? fallback;
};

export function drawEventMarkers(args: {
  ctx: CanvasRenderingContext2D;
  cssH: number;
  markers: SimulationStepV3["renderSignals"]["eventMarkers"];
  timingMarkers?: SimulationStepV3["renderSignals"]["timingMarkers"];
}): void {
  const { ctx, cssH, markers, timingMarkers = [] } = args;
  const activeCount = activeEventMarkerCount(markers);
  const timingCount = finiteTimingMarkerCount(timingMarkers);
  if (activeCount === 0 && timingCount === 0) return;

  const x0 = 10;
  let y = Math.max(20, cssH - 20 - (activeCount + timingCount) * 18);

  ctx.save();
  ctx.font = MONO_FONT;
  for (const marker of markers) {
    if (marker.active) y = drawEventMarkerRow(ctx, marker, x0, y);
  }
  for (const marker of timingMarkers) {
    if (Number.isFinite(marker.seconds)) y = drawTimingMarkerRow(ctx, marker, x0, y);
  }
  ctx.restore();
}

const activeEventMarkerCount = (markers: EventMarker[]): number => {
  let activeCount = 0;
  for (const marker of markers) {
    if (marker.active) activeCount++;
  }
  return activeCount;
};

const finiteTimingMarkerCount = (markers: TimingMarker[]): number => {
  let timingCount = 0;
  for (const marker of markers) {
    if (Number.isFinite(marker.seconds)) timingCount++;
  }
  return timingCount;
};

const drawEventMarkerRow = (
  ctx: CanvasRenderingContext2D,
  marker: EventMarker,
  x0: number,
  y: number,
): number => {
  drawMarkerRow(ctx, `event: ${marker.label}`, "rgba(255,255,255,0.90)", x0, y);
  return y + 16;
};

const drawTimingMarkerRow = (
  ctx: CanvasRenderingContext2D,
  marker: TimingMarker,
  x0: number,
  y: number,
): number => {
  drawMarkerRow(
    ctx,
    `${marker.id}: ${(marker.seconds as number).toFixed(0)} s`,
    "rgba(255,214,102,0.92)",
    x0,
    y,
  );
  return y + 16;
};

const drawMarkerRow = (
  ctx: CanvasRenderingContext2D,
  text: string,
  color: string,
  x0: number,
  y: number,
): void => {
  ctx.fillStyle = "rgba(20,20,20,0.65)";
  ctx.fillRect(x0 - 4, y - 10, ctx.measureText(text).width + 12, 14);
  ctx.fillStyle = color;
  ctx.fillText(text, x0, y);
};

const drawGhostGeometry = (args: {
  ctx: CanvasRenderingContext2D;
  toPxInto: ToPxInto;
  scratchPoint: ScratchPoint;
  pixelsPerUnit: number;
  ghost: SceneGhostGeometry;
}): void => {
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
      const q = Math.max(
        0.05,
        Math.abs(Math.cos(Number.isFinite(geometry.inclination) ? geometry.inclination : 0)),
      );
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
};

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

  drawDidacticGhosts({ ctx, toPxInto, scratchPoint, pixelsPerUnit, overlay });
  drawDidacticLines({ ctx, toPxInto, scratchPoint, overlay });
  drawDidacticPoints({ ctx, toPxInto, scratchPoint, overlay });
  drawDidacticBadges(ctx, overlay, cssW);
}

const drawDidacticGhosts = (args: {
  ctx: CanvasRenderingContext2D;
  toPxInto: ToPxInto;
  scratchPoint: ScratchPoint;
  pixelsPerUnit: number;
  overlay: SceneDidacticOverlayState;
}): void => {
  const { ctx, toPxInto, scratchPoint, pixelsPerUnit, overlay } = args;
  for (const ghost of overlay.ghosts ?? []) {
    drawGhostGeometry({ ctx, toPxInto, scratchPoint, pixelsPerUnit, ghost });
  }
};

const drawDidacticLines = (args: {
  ctx: CanvasRenderingContext2D;
  toPxInto: ToPxInto;
  scratchPoint: ScratchPoint;
  overlay: SceneDidacticOverlayState;
}): void => {
  const { ctx, toPxInto, scratchPoint, overlay } = args;
  for (const line of overlay.lines ?? []) {
    drawDidacticLine(ctx, toPxInto, scratchPoint, line);
  }
};

const drawDidacticLine = (
  ctx: CanvasRenderingContext2D,
  toPxInto: ToPxInto,
  scratchPoint: ScratchPoint,
  line: DidacticLine,
): void => {
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
  if (line.label) drawDidacticLineLabel(ctx, line, p0, p1);
  ctx.restore();
};

const drawDidacticLineLabel = (
  ctx: CanvasRenderingContext2D,
  line: DidacticLine,
  p0: ScratchPoint,
  p1: ScratchPoint,
): void => {
  ctx.fillStyle = line.color ?? "rgba(255,255,255,0.9)";
  ctx.font = MONO_FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(line.label as string, 0.5 * (p0.x + p1.x), Math.min(p0.y, p1.y) - 4);
};

const drawDidacticPoints = (args: {
  ctx: CanvasRenderingContext2D;
  toPxInto: ToPxInto;
  scratchPoint: ScratchPoint;
  overlay: SceneDidacticOverlayState;
}): void => {
  const { ctx, toPxInto, scratchPoint, overlay } = args;
  for (const point of overlay.points ?? []) {
    drawDidacticPoint(ctx, toPxInto, scratchPoint, point);
  }
};

const drawDidacticPoint = (
  ctx: CanvasRenderingContext2D,
  toPxInto: ToPxInto,
  scratchPoint: ScratchPoint,
  point: DidacticPoint,
): void => {
  const p = toPxInto(point.x, point.y, scratchPoint);
  ctx.save();
  ctx.fillStyle = point.color ?? "rgba(255,214,102,0.95)";
  ctx.beginPath();
  ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
  ctx.fill();
  if (point.label) drawDidacticPointLabel(ctx, point, p);
  ctx.restore();
};

const drawDidacticPointLabel = (
  ctx: CanvasRenderingContext2D,
  point: DidacticPoint,
  p: ScratchPoint,
): void => {
  ctx.font = MONO_FONT;
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.fillText(point.label as string, p.x + 5, p.y - 4);
};

const drawDidacticBadges = (
  ctx: CanvasRenderingContext2D,
  overlay: SceneDidacticOverlayState,
  cssW: number,
): void => {
  const badges = overlay.badges ?? [];
  if (badges.length === 0) return;

  let x = didacticBadgeRowStart(cssW);
  let y = 12;
  ctx.save();
  ctx.font = MONO_FONT;
  for (const badge of badges) {
    const next = drawDidacticBadge(ctx, badge, x, y, cssW);
    x = next.x;
    y = next.y;
  }
  ctx.restore();
};

const drawDidacticBadge = (
  ctx: CanvasRenderingContext2D,
  badge: DidacticBadge,
  x: number,
  y: number,
  cssW: number,
): { x: number; y: number } => {
  const width = ctx.measureText(badge.label).width + 16;
  const pos = didacticBadgePosition(x, y, width, cssW);
  ctx.fillStyle = "rgba(20,20,20,0.68)";
  ctx.fillRect(pos.x, pos.y, width, 14);
  ctx.fillStyle = badge.color ?? "rgba(255,255,255,0.92)";
  ctx.fillText(badge.label, pos.x + 8, pos.y + 11);
  return { x: pos.x + width + 6, y: pos.y };
};

const didacticBadgePosition = (
  x: number,
  y: number,
  width: number,
  cssW: number,
): { x: number; y: number } => {
  if (x + width <= cssW - 12) return { x, y };
  return { x: didacticBadgeRowStart(cssW), y: y + 18 };
};

const didacticBadgeRowStart = (cssW: number): number => {
  return Math.max(12, cssW - 320);
};

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
