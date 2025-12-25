// src/render/canvas2d.ts
//
// Canvas2D renderer for the sky-plane view + a simple light-curve plot.
//
// Notes on correctness / conventions:
// - Visualization layer only: must not mutate simulation state or params.
// - Uses the same observer-direction convention as physics/frames.ts + sim.ts:
//   observerDir points from star to observer; projectToSky.z is depth along that direction.
// - Painter’s algorithm (sort by sky-depth z) is used as an approximate visibility ordering.
// - This is a *visual* depth cue only; physics gating (occultations, mutual events) is handled in sim.ts.
// - "Behind star" visual hint: when sky.z < 0 (behind star) and projected center falls within the star disk,
//   draw a dashed outline to indicate hidden/behind. This must not affect flux or geometry.
//
// Debug overlay toggles:
// - This renderer supports optional toggles for showing meta diagnostics (b, TDV ratio, nOcculters, etc.).
//   It stays compatible with StepResult.meta fields defined in core types and produced by sim.ts.

import type { StepResult, SystemParams } from "../core/types";
import { clamp } from "../core/units";
import type Vec3 from "../physics/vec3";
import { vIsFinite, vNormalizeOrThrow } from "../physics/vec3";
import { sampleMoonOrbitSkyAbsolute, sampleOrbitSky } from "../sim/sim";

type SizeInfo = {
  dpr: number;
  cssW: number;
  cssH: number;
  pxW: number;
  pxH: number;
};

type DrawableKind = "star" | "planet" | "moon";

type Drawable = {
  kind: DrawableKind;
  z: number; // depth along observer direction in sky coordinates (same convention as projectToSky)
};

export type DebugOverlayToggles = {
  enabled?: boolean;

  showObserverDir?: boolean;
  showOcculters?: boolean;

  showImpactParams?: boolean; // b_planet, b_moon
  showTDV?: boolean; // tdvRatio, vPlanetSky, vPlanetSkyRef
  showFluxDecomposition?: boolean; // baselineFluxUsed, stellarVariabilityFlux, etc.
};

function getObserverDirNormalized(params: SystemParams): Vec3 {
  const dir = params.observer?.dir ?? { x: 0, y: 0, z: 1 };
  if (!vIsFinite(dir)) return { x: 0, y: 0, z: 1 };
  try {
    return vNormalizeOrThrow(dir, 1e-15, "observer.dir must be non-zero.");
  } catch {
    return { x: 0, y: 0, z: 1 };
  }
}

function getCanvasSizeInfo(canvas: HTMLCanvasElement): SizeInfo {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  const cssW = Math.max(0, rect.width);
  const cssH = Math.max(0, rect.height);

  const pxW = Math.max(1, Math.floor(cssW * dpr));
  const pxH = Math.max(1, Math.floor(cssH * dpr));

  return { dpr, cssW, cssH, pxW, pxH };
}

function ensureHiDPICanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, prev?: SizeInfo): SizeInfo {
  const next = getCanvasSizeInfo(canvas);

  if (next.cssW === 0 || next.cssH === 0) {
    return (
      prev ?? {
        dpr: 1,
        cssW: canvas.width,
        cssH: canvas.height,
        pxW: canvas.width,
        pxH: canvas.height,
      }
    );
  }

  const needResize = !prev || prev.dpr !== next.dpr || prev.pxW !== next.pxW || prev.pxH !== next.pxH;

  if (needResize) {
    canvas.width = next.pxW;
    canvas.height = next.pxH;
    ctx.setTransform(next.dpr, 0, 0, next.dpr, 0, 0);
  }

  return next;
}

function defaultDebugToggles(): Required<DebugOverlayToggles> {
  return {
    enabled: true,
    showObserverDir: true,
    showOcculters: true,
    showImpactParams: true,
    showTDV: true,
    showFluxDecomposition: false,
  };
}

function resolveDebugToggles(t?: DebugOverlayToggles): Required<DebugOverlayToggles> {
  const d = defaultDebugToggles();
  return {
    enabled: t?.enabled ?? d.enabled,
    showObserverDir: t?.showObserverDir ?? d.showObserverDir,
    showOcculters: t?.showOcculters ?? d.showOcculters,
    showImpactParams: t?.showImpactParams ?? d.showImpactParams,
    showTDV: t?.showTDV ?? d.showTDV,
    showFluxDecomposition: t?.showFluxDecomposition ?? d.showFluxDecomposition,
  };
}

export class Canvas2DRenderer {
  private ctx: CanvasRenderingContext2D;
  private size?: SizeInfo;

  // world -> CSS pixels (in the star/planet "length units" used by the sim)
  public pixelsPerUnit = 1.2;

  // Optional runtime toggles for the debug overlay (visual only).
  public debug: DebugOverlayToggles = defaultDebugToggles();

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas2DRenderer: 2D context unavailable.");
    this.ctx = ctx;
    this.size = ensureHiDPICanvas(this.canvas, this.ctx, this.size);
  }

  private toPx(x: number, y: number): { x: number; y: number } {
    const cssW = this.size?.cssW ?? this.canvas.clientWidth ?? this.canvas.width;
    const cssH = this.size?.cssH ?? this.canvas.clientHeight ?? this.canvas.height;
    const cx = cssW * 0.5;
    const cy = cssH * 0.5;
    return { x: cx + x * this.pixelsPerUnit, y: cy + y * this.pixelsPerUnit };
  }

  drawFrame(params: SystemParams, step: StepResult, t: number) {
    // Do not mutate params or step; renderer is read-only.
    void t;

    this.size = ensureHiDPICanvas(this.canvas, this.ctx, this.size);

    const ctx = this.ctx;
    const cssW = this.size!.cssW;
    const cssH = this.size!.cssH;

    // background
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, cssW, cssH);

    // axes
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, cssH * 0.5);
    ctx.lineTo(cssW, cssH * 0.5);
    ctx.moveTo(cssW * 0.5, 0);
    ctx.lineTo(cssW * 0.5, cssH);
    ctx.stroke();

    const observerDir = getObserverDirNormalized(params);

    // Orbit paths: purely visual guides (sampled from sim functions, no duplicated physics).
    this.drawOrbit(sampleOrbitSky(params.planet.orbit, t, 360, observerDir), "rgba(255,255,255,0.18)");

    if (params.moon) {
      const moonPath = sampleMoonOrbitSkyAbsolute(params, t, 240);
      this.drawOrbit(moonPath, "rgba(255,255,255,0.12)");
    }

    // --- Depth-sorted drawing (Painter's algorithm) ---
    // Convention from sim.ts: larger sky.z means closer to observer.
    const drawList: Drawable[] = [
      { kind: "star", z: 0 },
      { kind: "planet", z: step.planetSky.z },
    ];

    if (params.moon && step.moonSky) drawList.push({ kind: "moon", z: step.moonSky.z });

    // Stable ordering: if equal z, keep deterministic order.
    // We sort back->front: smaller z first, larger z last, so the closer object is drawn on top.
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
      }
    }

    this.drawDebugOverlay(params, step, observerDir);
  }

  private drawDebugOverlay(params: SystemParams, step: StepResult, observerDir: Vec3) {
    const ctx = this.ctx;
    const dbg = resolveDebugToggles(this.debug);
    if (!dbg.enabled) return;

    ctx.fillStyle = "rgba(255,255,255,0.78)";
    ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

    let y = 18;
    const line = (s: string) => {
      ctx.fillText(s, 10, y);
      y += 16;
    };

    if (dbg.showObserverDir) {
      line(`Observer dir = (${observerDir.x.toFixed(2)}, ${observerDir.y.toFixed(2)}, ${observerDir.z.toFixed(2)})`);
    }

    if (dbg.showOcculters) {
      const nOcc = step.meta?.nOcculters;
      if (typeof nOcc === "number" && Number.isFinite(nOcc)) line(`Occulters = ${nOcc}`);
    }

    if (dbg.showImpactParams) {
      const bP = step.meta?.bPlanet;
      const bM = step.meta?.bMoon;
      if (typeof bP === "number" && Number.isFinite(bP)) line(`b_planet = ${bP.toFixed(3)}`);
      if (typeof bM === "number" && Number.isFinite(bM)) line(`b_moon   = ${bM.toFixed(3)}`);
    }

    if (dbg.showTDV) {
      const tdv = step.meta?.tdvRatio;
      const vSky = step.meta?.vPlanetSky;
      const vRef = step.meta?.vPlanetSkyRef;
      if (typeof tdv === "number" && Number.isFinite(tdv)) line(`TDV ratio = ${tdv.toFixed(4)}`);
      if (typeof vSky === "number" && Number.isFinite(vSky)) line(`v_sky(t)  = ${vSky.toFixed(6)}`);
      if (typeof vRef === "number" && Number.isFinite(vRef)) line(`v_sky(ref)= ${vRef.toFixed(6)}`);
    }

    if (dbg.showFluxDecomposition) {
      const baseline = step.meta?.baselineFluxUsed;
      const svar = step.meta?.stellarVariabilityFlux;
      if (typeof baseline === "number" && Number.isFinite(baseline)) line(`baselineFlux = ${baseline.toFixed(6)}`);
      if (typeof svar === "number" && Number.isFinite(svar)) line(`stellarVar   = ${svar.toExponential(3)}`);
      if (typeof step.fluxTransitOnly === "number" && Number.isFinite(step.fluxTransitOnly))
        line(`F_transit    = ${step.fluxTransitOnly.toFixed(6)}`);
      line(`F_total      = ${step.flux.toFixed(6)}`);
    }

    // Defensive note: renderer does not recompute "in front" gating; it only uses provided sky.z for cues.
    void params;
  }

  private drawStar(params: SystemParams) {
    const ctx = this.ctx;
    const starPx = this.toPx(0, 0);
    const R = params.star.r * this.pixelsPerUnit;

    // Purely visual radial gradient for depth cue (NOT limb-darkening physics).
    const g = ctx.createRadialGradient(starPx.x - R * 0.25, starPx.y - R * 0.25, R * 0.2, starPx.x, starPx.y, R);
    g.addColorStop(0, "#ffe1a6");
    g.addColorStop(1, "#f2a33a");

    ctx.beginPath();
    ctx.arc(starPx.x, starPx.y, R, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();

    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  private drawOrbit(pts: Array<{ x: number; y: number }>, stroke: string) {
    const ctx = this.ctx;
    if (pts.length < 2) return;

    ctx.beginPath();
    const p0 = this.toPx(pts[0].x, pts[0].y);
    ctx.moveTo(p0.x, p0.y);

    for (let i = 1; i < pts.length; i++) {
      const p = this.toPx(pts[i].x, pts[i].y);
      ctx.lineTo(p.x, p.y);
    }

    ctx.closePath();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  private drawBody(x: number, y: number, r: number, z: number, baseColor: string) {
    const ctx = this.ctx;
    const p = this.toPx(x, y);

    // Visual depth cue only:
    // Use smooth function of |z| and clamp to avoid extreme alphas.
    const shade = clamp(0.35 + 0.65 * (1 / (1 + Math.abs(z) * 0.002)), 0.25, 1.0);

    ctx.save();
    ctx.globalAlpha = shade;

    ctx.beginPath();
    ctx.arc(p.x, p.y, r * this.pixelsPerUnit, 0, Math.PI * 2);
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
  }) {
    const { x, y, rBody, zBody, rStar, baseColor } = args;

    // Conventions match sim.ts:
    // - behind star if sky.z < 0
    // - purely visual hint; does not gate physics (sim.ts already did that).
    const behindStarPlane = zBody < 0;

    // For a *visual* behind-star cue, require the projected center to be inside the stellar disk.
    // Use rStar (not rStar + rBody) to match the minimal "projected center in star disk" gate used in sim.ts. 
    const centerInsideStarDisk = Math.hypot(x, y) < rStar;

    this.drawBody(x, y, rBody, zBody, baseColor);

    if (behindStarPlane && centerInsideStarDisk) {
      const ctx = this.ctx;
      const p = this.toPx(x, y);
      const R = rBody * this.pixelsPerUnit;

      ctx.save();
      ctx.globalAlpha = 0.60;
      ctx.strokeStyle = "rgba(255,255,255,0.70)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}

export class LightCurvePlot {
  private ctx: CanvasRenderingContext2D;
  private size?: SizeInfo;
  private data: number[] = [];

  constructor(private canvas: HTMLCanvasElement, private capacity = 900) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("LightCurvePlot: 2D context unavailable.");
    this.ctx = ctx;
    this.size = ensureHiDPICanvas(this.canvas, this.ctx, this.size);
  }

  push(flux: number) {
    if (!Number.isFinite(flux)) return;
    this.data.push(flux);
    if (this.data.length > this.capacity) this.data.shift();
  }

  clear() {
    this.data = [];
  }

  draw() {
    this.size = ensureHiDPICanvas(this.canvas, this.ctx, this.size);

    const ctx = this.ctx;
    const w = this.size!.cssW;
    const h = this.size!.cssH;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);

    if (this.data.length < 2) {
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
      ctx.fillText("Flux (normalized)", 10, 16);
      return;
    }

    let minF = Number.POSITIVE_INFINITY;
    let maxF = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < this.data.length; i++) {
      const v = this.data[i];
      if (v < minF) minF = v;
      if (v > maxF) maxF = v;
    }

    // Robust scaling: allow excursions above/below 1 due to additive components.
    const span = Math.max(1e-8, maxF - minF);
    const pad = Math.max(1e-6, span * 0.15);
    const lo = minF - pad;
    const hi = maxF + pad;

    // grid
    ctx.strokeStyle = "rgba(0,0,0,0.10)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= 4; i++) {
      const yy = (i / 4) * h;
      ctx.moveTo(0, yy);
      ctx.lineTo(w, yy);
    }
    ctx.stroke();

    // baseline at 1.0
    const yBaseline = h - ((1.0 - lo) / (hi - lo)) * h;
    if (Number.isFinite(yBaseline)) {
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath();
      ctx.moveTo(0, yBaseline);
      ctx.lineTo(w, yBaseline);
      ctx.stroke();
    }

    const n = this.data.length;
    const xOf = (i: number) => (i / (n - 1)) * w;
    const yOf = (f: number) => h - ((f - lo) / (hi - lo)) * h;

    // curve
    ctx.beginPath();
    ctx.moveTo(xOf(0), yOf(this.data[0]));
    for (let i = 1; i < n; i++) ctx.lineTo(xOf(i), yOf(this.data[i]));
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2;
    ctx.stroke();

    // labels
    ctx.fillStyle = "rgba(0,0,0,0.75)";
    ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
    ctx.fillText(`Flux: [${lo.toFixed(6)} .. ${hi.toFixed(6)}]`, 10, 16);
  }
}
