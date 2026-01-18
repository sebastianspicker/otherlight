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

import type { StepResult, SystemParams } from "../core/types";
import type { Vec3 } from "../physics/vec3";

import { ensureHiDPICanvas, type SizeInfo } from "./canvasUtil";
import { drawStarDisk, StarDiskCache } from "./starDisk";
import { OrbitPathCache, type OrbitPathPoint2D } from "./orbitPathCache";
import {
  defaultDebugOverlayToggles,
  normalizeObserverDirSafe,
  resolveDebugOverlayToggles,
  drawDebugOverlay,
  drawObserverMarkerMainView,
  type DebugOverlayToggles,
} from "./overlays";

// Re-export the other renderers so existing callers can continue to import from canvas2d.ts
// (requested “integration of remaining renderers”).
export { LightCurvePlot } from "./lightCurvePlot";
export type { LightCurvePlotOptions, LightCurveSample } from "./lightCurvePlot";

export { OrbitPathCache } from "./orbitPathCache";
export type { OrbitPathCacheOptions, OrbitPathPoint2D } from "./orbitPathCache";

export { drawStarDisk, StarDiskCache, starRadiusPx } from "./starDisk";

export {
  defaultDebugOverlayToggles,
  normalizeObserverDirSafe,
  resolveDebugOverlayToggles,
  drawDebugOverlay,
  drawObserverMarkerMainView,
} from "./overlays";
export type { DebugOverlayToggles } from "./overlays";

type DrawableKind = "star" | "planet" | "moon";

type Drawable = {
  kind: DrawableKind;
  z: number; // depth along observer direction; larger => closer to observer
};

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function finitePositive(n: unknown, fallback: number): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x) || x <= 0) return fallback;
  return x;
}

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

  constructor(private canvas: HTMLCanvasElement, opts: Canvas2DRendererOptions = {}) {
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
    const rr = finitePositive(r, 1e-6) * this.pixelsPerUnit;

    // Visual-only depth cue; must not affect physics/flux.
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
    const centerInsideStarDisk = Math.hypot(x, y) < finitePositive(rStar, 1);

    if (behindStarPlane && centerInsideStarDisk) {
      const ctx = this.ctx;
      const p = this.toPx(x, y);
      const R = finitePositive(rBody, 1e-6) * this.pixelsPerUnit;

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

  /**
   * Render one frame.
   * @param params System parameters (read-only).
   * @param step Simulation step output (positions + flux).
   * @param tSec Simulation time in seconds (used for orbit path sampling keys).
   */
  drawFrame(params: SystemParams, step: StepResult, tSec: number): void {
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
    const observerDir: Vec3 = normalizeObserverDirSafe(params.observer?.dir);

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
    const drawList: Drawable[] = [{ kind: "star", z: 0 }, { kind: "planet", z: step.planetSky.z }];
    if (params.moon && step.moonSky) drawList.push({ kind: "moon", z: step.moonSky.z });

    drawList.sort((a, b) => (a.z === b.z ? a.kind.localeCompare(b.kind) : a.z - b.z));

    for (const item of drawList) {
      if (item.kind === "star") {
        this.drawStar(params);
        continue;
      }

      if (item.kind === "planet") {
        this.drawBodyWithOcclusionHint({
          x: step.planetSky.x,
          y: step.planetSky.y,
          rBody: params.planet.r,
          zBody: step.planetSky.z,
          rStar: params.star.r,
          baseColor: "#4cc9f0",
        });
        continue;
      }

      if (item.kind === "moon" && params.moon && step.moonSky) {
        this.drawBodyWithOcclusionHint({
          x: step.moonSky.x,
          y: step.moonSky.y,
          rBody: params.moon.r,
          zBody: step.moonSky.z,
          rStar: params.star.r,
          baseColor: "#b8c0cc",
        });
        continue;
      }
    }

    // Draw overlay text/gizmo last.
    // We already drew the main-view observer marker above -> suppress duplicate marker here.
    const overlayToggles: DebugOverlayToggles =
      dbg.enabled && dbg.showObserverMarker ? { ...this.debug, showObserverMarker: false } : this.debug;

    drawDebugOverlay(ctx, this.size, params, step, observerDir, overlayToggles);
  }
}
