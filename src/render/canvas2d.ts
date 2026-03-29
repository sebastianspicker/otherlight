// src/render/canvas2d.ts
//
// Canvas2D renderer for the sky-plane view.
// This file integrates the modular render helpers:
// - starDisk.ts (limb-darkened stellar disk visualization)
// - orbitPathCache.ts (cached sky-plane orbit paths)
// - overlays.ts (debug HUD + observer gizmo/marker)
// - lightCurvePlot.ts (separate plotter, re-exported for convenience)
//
// Scientific correctness notes (visual layer):
// - Must not mutate simulation state or params.
// - Uses the shared convention: observer.dir points from star to observer;
//   larger sky.z means closer to the observer. (See core/types.ts.)
// - Limb darkening visualization uses the same law resolver/validation as photometry
//   (via starDisk.ts); it is display-only and does not affect flux computations.

import type { SystemParams } from "../core/types";
import { clamp, toFinitePositiveOr } from "../core/units";
import type { Vec3 } from "../physics/vec3";
import type { RenderOcculterGeometryV3, SimulationStepV3 } from "../sim/v3/types";

import { ensureHiDPICanvas, type SizeInfo } from "./canvasUtil";
import { drawStarDisk, StarDiskCache } from "./starDisk";
import { OrbitPathCache, type OrbitPathPoint2D } from "./orbitPathCache";
import {
  defaultDebugOverlayToggles,
  normalizeObserverDirSafe,
  resolveDebugOverlayToggles,
  drawDebugOverlayV3,
  drawObserverMarkerMainView,
  type DebugOverlayDataV3,
  type DebugOverlayToggles,
  type RequiredDebugOverlayToggles,
} from "./overlays";

const MONO_FONT = "11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

// Re-export the other renderers so existing callers can continue to import from canvas2d.ts
// (requested "integration of remaining renderers").
export { LightCurvePlot } from "./lightCurvePlot";
export type { LightCurvePlotOptions, LightCurveSample } from "./lightCurvePlot";

export { OrbitPathCache } from "./orbitPathCache";
export type { OrbitPathCacheOptions, OrbitPathPoint2D } from "./orbitPathCache";

export { drawStarDisk, StarDiskCache, starRadiusPx } from "./starDisk";

export {
  defaultDebugOverlayToggles,
  normalizeObserverDirSafe,
  resolveDebugOverlayToggles,
  drawDebugOverlayV3,
  drawDebugOverlayV3 as drawDebugOverlay,
  drawObserverMarkerMainView,
} from "./overlays";
export type { DebugOverlayDataV3, DebugOverlayToggles } from "./overlays";

type Drawable =
  | {
      kind: "star";
      z: number; // depth along observer direction; larger => closer to observer
    }
  | {
      kind: "occulter";
      z: number;
      geometry: RenderOcculterGeometryV3;
    };

export type Canvas2DRendererOptions = {
  /**
   * Background fill for the main view.
   * Default: "#000".
   */
  background?: string;

  /**
   * If true, draw faint x/y axes through the center.
   * Default: true.
   */
  showAxes?: boolean;

  /**
   * If true, draw orbit guide paths (planet and moon if present).
   * Default: true.
   */
  showOrbits?: boolean;

  /**
   * Optional orbit-path cache tuning.
   */
  orbitPathCache?: ConstructorParameters<typeof OrbitPathCache>[0];
};

export class Canvas2DRenderer {
  private ctx: CanvasRenderingContext2D;
  private size?: SizeInfo;

  /**
   * World -> CSS pixel scale (simulation length units to pixels).
   * Keep this purely visual; it must not be fed back into physics.
   */
  public pixelsPerUnit = 1.2;

  /** Debug overlay toggles (visual-only). */
  public debug: DebugOverlayToggles = defaultDebugOverlayToggles();

  private opts: Required<Canvas2DRendererOptions>;
  private orbitCache: OrbitPathCache;
  private starDiskCache = new StarDiskCache();
  private drawList: Drawable[] = [];
  /** Reusable overlay toggles object with showObserverMarker suppressed (avoids spread per frame). */
  private overlayTogglesNoMarker: RequiredDebugOverlayToggles = {
    ...defaultDebugOverlayToggles(),
    showObserverMarker: false,
  };

  constructor(
    private canvas: HTMLCanvasElement,
    opts: Canvas2DRendererOptions = {},
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas2DRenderer: 2D context unavailable.");
    this.ctx = ctx;

    this.opts = {
      background: opts.background ?? "#000",
      showAxes: opts.showAxes ?? true,
      showOrbits: opts.showOrbits ?? true,
      orbitPathCache: opts.orbitPathCache ?? {},
    };

    this.orbitCache = new OrbitPathCache(this.opts.orbitPathCache);
    this.size = ensureHiDPICanvas(this.canvas, this.ctx, this.size);
  }

  /** Convert sky-plane world coords (x,y) to CSS pixel coords. */
  // TODO: toPx allocates a {x,y} object per call. Inlining would reduce GC pressure
  // in hot loops but would hurt readability — not worth it unless profiling shows impact.
  private toPx(x: number, y: number): { x: number; y: number } {
    const cssW = this.size?.cssW ?? this.canvas.clientWidth ?? this.canvas.width;
    const cssH = this.size?.cssH ?? this.canvas.clientHeight ?? this.canvas.height;
    const cx = cssW * 0.5;
    const cy = cssH * 0.5;

    // Convention: world +y is up; canvas +y is down.
    return { x: cx + x * this.pixelsPerUnit, y: cy - y * this.pixelsPerUnit };
  }

  private drawAxes(): void {
    if (!this.opts.showAxes) return;

    const ctx = this.ctx;
    const cssW = this.size?.cssW ?? 0;
    const cssH = this.size?.cssH ?? 0;
    if (!(cssW > 0 && cssH > 0)) return;

    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, cssH * 0.5);
    ctx.lineTo(cssW, cssH * 0.5);
    ctx.moveTo(cssW * 0.5, 0);
    ctx.lineTo(cssW * 0.5, cssH);
    ctx.stroke();
    ctx.restore();
  }

  private drawOrbit(pts: OrbitPathPoint2D[], strokeStyle: string): void {
    if (pts.length < 2) return;

    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();

    const p0 = this.toPx(pts[0].x, pts[0].y);
    ctx.moveTo(p0.x, p0.y);

    for (let i = 1; i < pts.length; i++) {
      const p = this.toPx(pts[i].x, pts[i].y);
      ctx.lineTo(p.x, p.y);
    }

    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  private drawStar(params: SystemParams): void {
    const ctx = this.ctx;

    // Star center is always at origin in the sky-plane view.
    const centerPx = this.toPx(0, 0);

    drawStarDisk(ctx, params, {
      centerPx,
      pixelsPerUnit: this.pixelsPerUnit,
      useLimbDarkening: true,
      cache: this.starDiskCache,
      showPatches: true,
      drawOutline: true,
    });
  }

  private drawBodyDisk(x: number, y: number, r: number, z: number, baseColor: string): void {
    const ctx = this.ctx;
    const p = this.toPx(x, y);
    const rr = toFinitePositiveOr(r, 1e-6) * this.pixelsPerUnit;

    // Visual-only depth cue; must not affect physics/flux.
    // The 0.002 constant is a world-unit scale factor calibrated to typical star radii
    // (R* ~ 100–500 world units), mapping depth offsets to a perceptible opacity range.
    const shade = clamp(0.35 + 0.65 * (1 / (1 + Math.abs(z) * 0.002)), 0.25, 1.0);

    ctx.save();
    ctx.globalAlpha = shade;
    ctx.beginPath();
    ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
    ctx.fillStyle = baseColor;
    ctx.fill();
    ctx.restore();
  }

  private drawBodyWithOcclusionHint(args: {
    x: number;
    y: number;
    rBody: number;
    zBody: number;
    rStar: number;
    baseColor: string;
  }): void {
    const { x, y, rBody, zBody, rStar, baseColor } = args;

    this.drawBodyDisk(x, y, rBody, zBody, baseColor);

    // Optional didactic hint: dashed outline when a body is behind the star plane
    // while still overlapping the projected stellar disk.
    const behindStarPlane = zBody < 0;
    const centerInsideStarDisk = Math.hypot(x, y) < toFinitePositiveOr(rStar, 1);

    if (behindStarPlane && centerInsideStarDisk) {
      const ctx = this.ctx;
      const p = this.toPx(x, y);
      const R = toFinitePositiveOr(rBody, 1e-6) * this.pixelsPerUnit;

      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = "rgba(255,255,255,0.70)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawEllipseBodyWithOcclusionHint(args: {
    x: number;
    y: number;
    rx: number;
    ry: number;
    angle: number;
    zBody: number;
    rStar: number;
    baseColor: string;
  }): void {
    const { x, y, rx, ry, angle, zBody, rStar, baseColor } = args;
    const ctx = this.ctx;
    const p = this.toPx(x, y);
    const rxPx = toFinitePositiveOr(rx, 1e-6) * this.pixelsPerUnit;
    const ryPx = toFinitePositiveOr(ry, 1e-6) * this.pixelsPerUnit;
    const ang = Number.isFinite(angle) ? angle : 0;

    // Visual-only depth cue; must not affect physics/flux.
    const shade = clamp(0.35 + 0.65 * (1 / (1 + Math.abs(zBody) * 0.002)), 0.25, 1.0);

    ctx.save();
    ctx.globalAlpha = shade;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, rxPx, ryPx, ang, 0, Math.PI * 2);
    ctx.fillStyle = baseColor;
    ctx.fill();
    ctx.restore();

    const behindStarPlane = zBody < 0;
    const centerInsideStarDisk = Math.hypot(x, y) < toFinitePositiveOr(rStar, 1);
    if (behindStarPlane && centerInsideStarDisk) {
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = "rgba(255,255,255,0.70)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, rxPx, ryPx, ang, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawRingAnnulus(args: {
    x: number;
    y: number;
    z: number;
    innerRadius: number;
    outerRadius: number;
    inclination: number;
    angle: number;
    color: string;
  }): void {
    const { x, y, z, innerRadius, outerRadius, inclination, angle, color } = args;
    const ctx = this.ctx;
    const p = this.toPx(x, y);
    const q = Math.max(0.05, Math.abs(Math.cos(Number.isFinite(inclination) ? inclination : 0)));
    const outerRx = toFinitePositiveOr(outerRadius, 1e-6) * this.pixelsPerUnit;
    const innerRx = toFinitePositiveOr(innerRadius, 1e-6) * this.pixelsPerUnit;
    const outerRy = outerRx * q;
    const innerRy = innerRx * q;
    const ang = Number.isFinite(angle) ? angle : 0;

    // Visual-only depth cue; must not affect physics/flux.
    const shade = clamp(0.25 + 0.7 * (1 / (1 + Math.abs(z) * 0.002)), 0.2, 1.0);

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(ang);
    ctx.globalAlpha = shade;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, 0, outerRx, outerRy, 0, 0, Math.PI * 2);
    ctx.ellipse(0, 0, innerRx, innerRy, 0, 0, Math.PI * 2, true);
    ctx.fill("evenodd");

    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, outerRx, outerRy, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, 0, innerRx, innerRy, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private bodyColor(body: "planet" | "moon"): string {
    return body === "planet" ? "#4cc9f0" : "#b8c0cc";
  }

  private ringColor(body: "planet" | "moon"): string {
    return body === "planet" ? "rgba(120, 210, 255, 0.38)" : "rgba(205, 212, 220, 0.32)";
  }

  private resolveOcculterGeometry(params: SystemParams, step: SimulationStepV3): RenderOcculterGeometryV3[] {
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

  private toOverlayData(step: SimulationStepV3): DebugOverlayDataV3 {
    return {
      nOcculters: step.debug?.nOcculters ?? step.renderSignals.occulterGeometry.length,
      bPlanet: step.debug?.bPlanet,
      bMoon: step.debug?.bMoon,
      tdvRatio: step.debug?.tdvRatio,
      vPlanetSky: step.debug?.vPlanetSky,
      vPlanetSkyRef: step.debug?.vPlanetSkyRef,
      baselineFluxUsed: step.debug?.baselineFluxUsed ?? step.flux.stellarPreTransit,
      stellarVariabilityFlux: step.debug?.stellarVariabilityFlux ?? step.flux.stellarVariability,
      fluxTransitFactor: step.flux.transitFactor,
      fluxTotal: step.flux.total,
    };
  }

  private drawEventMarkers(step: SimulationStepV3): void {
    const active = step.renderSignals.eventMarkers.filter((m) => m.active);
    if (active.length === 0) return;

    const ctx = this.ctx;
    const cssH = this.size?.cssH ?? 0;
    const x0 = 10;
    let y = Math.max(20, cssH - 20 - active.length * 18);

    ctx.save();
    ctx.font = MONO_FONT;
    for (const marker of active) {
      ctx.fillStyle = "rgba(20,20,20,0.65)";
      const text = `event: ${marker.label}`;
      const w = ctx.measureText(text).width + 12;
      ctx.fillRect(x0 - 4, y - 10, w, 14);
      ctx.fillStyle = "rgba(255,255,255,0.90)";
      ctx.fillText(text, x0, y);
      y += 16;
    }
    ctx.restore();
  }

  private drawOcculterGeometry(geometry: RenderOcculterGeometryV3, rStar: number): void {
    if (geometry.kind === "circle") {
      this.drawBodyWithOcclusionHint({
        x: geometry.center.x,
        y: geometry.center.y,
        rBody: geometry.radius,
        zBody: geometry.center.z,
        rStar,
        baseColor: this.bodyColor(geometry.body),
      });
      return;
    }
    if (geometry.kind === "ellipse") {
      this.drawEllipseBodyWithOcclusionHint({
        x: geometry.center.x,
        y: geometry.center.y,
        rx: geometry.rx,
        ry: geometry.ry,
        angle: geometry.angle,
        zBody: geometry.center.z,
        rStar,
        baseColor: this.bodyColor(geometry.body),
      });
      return;
    }
    this.drawRingAnnulus({
      x: geometry.center.x,
      y: geometry.center.y,
      z: geometry.center.z,
      innerRadius: geometry.innerRadius,
      outerRadius: geometry.outerRadius,
      inclination: geometry.inclination,
      angle: geometry.angle,
      color: this.ringColor(geometry.body),
    });
  }

  /**
   * Render one frame with Runtime V3 output.
   */
  drawFrameV3(params: SystemParams, step: SimulationStepV3, tSec: number): void {
    // Update HiDPI sizing & ensure CSS-pixel coordinate transform.
    this.size = ensureHiDPICanvas(this.canvas, this.ctx, this.size);

    const ctx = this.ctx;
    const cssW = this.size.cssW;
    const cssH = this.size.cssH;

    // Background
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = this.opts.background;
    ctx.fillRect(0, 0, cssW, cssH);

    this.drawAxes();

    // Observer direction (safe normalization).
    const observerDir: Vec3 = normalizeObserverDirSafe(
      step.renderSignals.orbitFrames.observerDir ?? params.observer?.dir,
    );

    // Resolve debug toggles once per frame.
    const dbg = resolveDebugOverlayToggles(this.debug);

    // Draw observer marker in main view *behind* bodies for readability.
    if (dbg.enabled && dbg.showObserverMarker) {
      drawObserverMarkerMainView(ctx, this.size, observerDir, { label: "Observer" });
    }

    // Orbit paths (visual guide only).
    if (this.opts.showOrbits) {
      const planetPts = this.orbitCache.getPlanetPath(params, tSec, observerDir);
      this.drawOrbit(planetPts, "rgba(255,255,255,0.18)");

      if (params.moon) {
        const moonPts = this.orbitCache.getMoonPath(params, tSec, observerDir);
        this.drawOrbit(moonPts, "rgba(255,255,255,0.12)");
      }
    }

    // Depth-sorted draw order (Painter's algorithm):
    // smaller z first (farther), larger z last (closer).
    const drawList = this.drawList;
    drawList.length = 0;
    drawList.push({ kind: "star", z: 0 });
    for (const geometry of this.resolveOcculterGeometry(params, step)) {
      drawList.push({
        kind: "occulter",
        z: Number.isFinite(geometry.center.z) ? geometry.center.z : 0,
        geometry,
      });
    }

    drawList.sort((a, b) => {
      if (a.z !== b.z) return a.z - b.z;
      if (a.kind === b.kind) {
        // Both are the same kind; if both are occulters, sort rings before disks.
        if (a.kind === "occulter") {
          const rank = (g: RenderOcculterGeometryV3) => (g.kind === "ring" ? 0 : 1);
          return rank(a.geometry) - rank((b as typeof a).geometry);
        }
        return 0;
      }
      return a.kind === "star" ? -1 : 1;
    });

    for (const item of drawList) {
      if (item.kind === "star") {
        this.drawStar(params);
        continue;
      }
      this.drawOcculterGeometry(item.geometry, params.star.r);
    }

    this.drawEventMarkers(step);

    // Draw overlay text/gizmo last.
    // We already drew the main-view observer marker above -> suppress duplicate marker here.
    // Pass the already-resolved toggles to avoid resolving them twice per frame.
    // Reuse a pre-allocated instance to avoid allocating a spread object every frame.
    let overlayToggles: RequiredDebugOverlayToggles;
    if (dbg.enabled && dbg.showObserverMarker) {
      const cached = this.overlayTogglesNoMarker;
      cached.enabled = dbg.enabled;
      cached.showObserverDir = dbg.showObserverDir;
      cached.showObserverMarker = false;
      cached.showOcculters = dbg.showOcculters;
      cached.showImpactParams = dbg.showImpactParams;
      cached.showTDV = dbg.showTDV;
      cached.showFluxDecomposition = dbg.showFluxDecomposition;
      overlayToggles = cached;
    } else {
      overlayToggles = dbg;
    }

    const overlayData = this.toOverlayData(step);
    drawDebugOverlayV3(ctx, this.size, overlayData, observerDir, overlayToggles);
  }
}
