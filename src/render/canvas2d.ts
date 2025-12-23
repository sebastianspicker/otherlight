// src/render/canvas2d.ts

import type { SystemParams, StepResult } from "../core/types";
import { clamp } from "../core/units";
import { sampleOrbitSky, sampleMoonOrbitSkyAbsolute } from "../sim/sim";
import type { Vec3 } from "../physics/vec3";

type SizeInfo = {
  dpr: number;
  cssW: number;
  cssH: number;
  pxW: number;
  pxH: number;
};

function getObserverDir(params: SystemParams): Vec3 {
  return params.observer?.dir ?? { x: 0, y: 0, z: 1 };
}

function getCanvasSizeInfo(canvas: HTMLCanvasElement): SizeInfo {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  // CSS pixel size (layout)
  const cssW = Math.max(0, rect.width);
  const cssH = Math.max(0, rect.height);

  // Backing store size (device pixels)
  const pxW = Math.max(1, Math.floor(cssW * dpr));
  const pxH = Math.max(1, Math.floor(cssH * dpr));

  return { dpr, cssW, cssH, pxW, pxH };
}

function ensureHiDPICanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  prev?: SizeInfo
): SizeInfo {
  const next = getCanvasSizeInfo(canvas);

  // If canvas is not visible yet, avoid resizing loops; keep current backing size.
  if (next.cssW === 0 || next.cssH === 0) {
    return prev ?? { dpr: 1, cssW: canvas.width, cssH: canvas.height, pxW: canvas.width, pxH: canvas.height };
  }

  const needResize =
    !prev ||
    prev.dpr !== next.dpr ||
    prev.pxW !== next.pxW ||
    prev.pxH !== next.pxH;

  if (needResize) {
    canvas.width = next.pxW;
    canvas.height = next.pxH;

    // Normalize drawing coordinates to CSS pixels.
    ctx.setTransform(next.dpr, 0, 0, next.dpr, 0, 0);
  }

  return next;
}

export class Canvas2DRenderer {
  private ctx: CanvasRenderingContext2D;
  private size?: SizeInfo;

  // world -> CSS pixels
  public pixelsPerUnit = 1.2;

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
    ctx.beginPath();
    ctx.moveTo(0, cssH * 0.5);
    ctx.lineTo(cssW, cssH * 0.5);
    ctx.moveTo(cssW * 0.5, 0);
    ctx.lineTo(cssW * 0.5, cssH);
    ctx.stroke();

    const observerDir = getObserverDir(params);

    // orbit paths (sky-projected, same observerDir as stepSystem)
    this.drawOrbit(sampleOrbitSky(params.planet.orbit, t, 360, observerDir), "rgba(255,255,255,0.18)");

    if (params.moon) {
      const moonPath = sampleMoonOrbitSkyAbsolute(params, t, 240);
      this.drawOrbit(moonPath, "rgba(255,255,255,0.12)");
    }

    // star
    const starPx = this.toPx(0, 0);
    ctx.beginPath();
    ctx.arc(starPx.x, starPx.y, params.star.r * this.pixelsPerUnit, 0, Math.PI * 2);
    ctx.fillStyle = "#ffd27d";
    ctx.fill();

    // planet & moon (visual depth cue only)
    this.drawBody(step.planetSky.x, step.planetSky.y, params.planet.r, step.planetSky.z, "#4cc9f0");

    if (params.moon && step.moonSky) {
      this.drawBody(step.moonSky.x, step.moonSky.y, params.moon.r, step.moonSky.z, "#b8c0cc");
    }

    // overlay text
    ctx.fillStyle = "rgba(255,255,255,0.78)";
    ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
    ctx.fillText(`Observer dir = (${observerDir.x.toFixed(2)}, ${observerDir.y.toFixed(2)}, ${observerDir.z.toFixed(2)})`, 10, 18);
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

    // purely visual depth cue (not radiative transfer)
    const shade = clamp(0.35 + 0.65 * (1 / (1 + Math.abs(z) * 0.002)), 0.25, 1.0);

    ctx.save();
    ctx.globalAlpha = shade;

    ctx.beginPath();
    ctx.arc(p.x, p.y, r * this.pixelsPerUnit, 0, Math.PI * 2);
    ctx.fillStyle = baseColor;
    ctx.fill();

    ctx.restore();
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

    // compute min/max without spreading (safer, avoids huge-arg calls)
    let minF = Number.POSITIVE_INFINITY;
    let maxF = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < this.data.length; i++) {
      const v = this.data[i];
      if (v < minF) minF = v;
      if (v > maxF) maxF = v;
    }

    // autoscale around 1.0, but never collapse
    const span = Math.max(1e-8, maxF - minF);
    const pad = Math.max(1e-6, span * 0.15);
    const lo = Math.min(1.0 - 1e-4, minF - pad);
    const hi = Math.max(1.0 + 1e-4, maxF + pad);

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
    for (let i = 1; i < n; i++) {
      ctx.lineTo(xOf(i), yOf(this.data[i]));
    }
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2;
    ctx.stroke();

    // labels
    ctx.fillStyle = "rgba(0,0,0,0.75)";
    ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
    ctx.fillText(`Flux (normalized): [${lo.toFixed(6)} .. ${hi.toFixed(6)}]`, 10, 16);
  }
}
