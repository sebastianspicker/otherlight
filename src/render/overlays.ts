// src/render/overlays.ts
//
// Canvas2D overlay helpers (debug HUD, observer gizmo, marker).
//
// Design goals:
// - Visualization only: never mutate simulation state.
// - Robust against NaN/Infinity / near-zero vectors.
// - Keep conventions consistent with core/types.ts and render/canvas2d.ts:
//   observer.dir points from star to observer; larger sky.z means closer to observer. [file:100][file:119]

import { clamp, toFinitePositiveOr } from "../core/units";
import type { Vec3 } from "../physics/vec3";
import { vIsFinite, vNormalizeOrThrow } from "../physics/vec3";
import type { SizeInfo } from "./canvasUtil";

export type DebugOverlayToggles = {
  enabled?: boolean;

  /** Draw inset gizmo + textual observer direction readout. */
  showObserverDir?: boolean;

  /** Draw observer marker + line-of-sight indicator in the main view. */
  showObserverMarker?: boolean;

  /** Show number of occulters currently considered (from step.meta.nOcculters). */
  showOcculters?: boolean;

  /** Show front-of-star projected impact parameters b = sqrt(x^2 + y^2) / R*. */
  showImpactParams?: boolean;

  /** Show TDV-related diagnostics (from step.meta.*). */
  showTDV?: boolean;

  /** Show flux decomposition diagnostics (fluxTransitFactor, fluxTotal, baselineFluxUsed, ...). */
  showFluxDecomposition?: boolean;
};

export type RequiredDebugOverlayToggles = Required<DebugOverlayToggles>;

export type OverlayTheme = {
  textColor: string;
  panelFill: string;
  panelStroke: string;
  accent: string;
  warn: string;
  font: string;
  fontSmall: string;
};

export type DebugOverlayOptions = {
  theme?: Partial<OverlayTheme>;

  /**
   * If true, observerDirRaw is assumed to already be normalized and finite.
   * Default: false.
   */
  observerDirNormalized?: boolean;

  /** Left padding for debug text. Default: 10. */
  textX?: number;

  /** First line baseline y in CSS pixels. Default: 18. */
  textY0?: number;

  /** Line spacing in CSS pixels. Default: 16. */
  lineHeight?: number;
};

export type ObserverMarkerOptions = {
  /** Marker label text. Default: "Observer". */
  label?: string;

  /** Outer radius placement factor relative to min(cssW,cssH). Default: 0.48. */
  radiusFactor?: number;

  /** Minimum radius in pixels. Default: 30. */
  radiusMinPx?: number;

  /** Marker fill color. Default: theme.accent. */
  markerFill?: string;

  /** Marker outline color. Default: rgba(0,0,0,0.45). */
  markerStroke?: string;
};

export type DebugOverlayDataV3 = {
  nOcculters?: number;
  bPlanet?: number;
  bMoon?: number;
  tdvRatio?: number;
  vPlanetSky?: number;
  vPlanetSkyRef?: number;
  baselineFluxUsed?: number;
  displayFluxValue?: number;
  stellarVariabilityFlux?: number;
  fluxTransitFactor?: number;
  fluxTotal?: number;
};

const DEFAULT_THEME: OverlayTheme = {
  textColor: "rgba(255,255,255,0.78)",
  panelFill: "rgba(0,0,0,0.55)",
  panelStroke: "rgba(255,255,255,0.18)",
  accent: "rgba(76,201,240,0.95)",
  warn: "rgba(255,120,120,0.95)",
  font: "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSmall: "11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
};

export function defaultDebugOverlayToggles(): RequiredDebugOverlayToggles {
  return {
    enabled: true,
    showObserverDir: true,
    showObserverMarker: false,
    showOcculters: true,
    showImpactParams: true,
    showTDV: true,
    showFluxDecomposition: false,
  };
}

export function resolveDebugOverlayToggles(t?: DebugOverlayToggles): RequiredDebugOverlayToggles {
  const d = defaultDebugOverlayToggles();
  return {
    enabled: t?.enabled ?? d.enabled,
    showObserverDir: t?.showObserverDir ?? d.showObserverDir,
    showObserverMarker: t?.showObserverMarker ?? d.showObserverMarker,
    showOcculters: t?.showOcculters ?? d.showOcculters,
    showImpactParams: t?.showImpactParams ?? d.showImpactParams,
    showTDV: t?.showTDV ?? d.showTDV,
    showFluxDecomposition: t?.showFluxDecomposition ?? d.showFluxDecomposition,
  };
}

export function normalizeObserverDirSafe(dir: Vec3 | undefined): Vec3 {
  const fallback: Vec3 = { x: 0, y: 0, z: 1 };
  const d = dir ?? fallback;
  if (!vIsFinite(d)) return fallback;

  try {
    return vNormalizeOrThrow(d, 1e-15, "observer.dir must be non-zero.");
  } catch {
    // Fail-open: degenerate observer direction; fall back to default +Z view direction.
    return fallback;
  }
}

function themeResolved(theme?: Partial<OverlayTheme>): OverlayTheme {
  if (!theme || Object.keys(theme).length === 0) return DEFAULT_THEME;
  return { ...DEFAULT_THEME, ...theme };
}

function canvasSizeValid(size: SizeInfo): boolean {
  return Number.isFinite(size.cssW) && Number.isFinite(size.cssH) && size.cssW >= 1 && size.cssH >= 1;
}

/** Cross-browser rounded rectangle path helper. */
function pathRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) * 0.5));
  if ("roundRect" in ctx && typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, rr);
    return;
  }

  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
}

/**
 * Draw a didactic observer marker in the main view (purely visual).
 * The marker placement uses the azimuth in the inertial x/y plane (atan2(y,x)),
 * matching the convention used in the existing renderer code. [file:119]
 */
export function drawObserverMarkerMainView(
  ctx: CanvasRenderingContext2D,
  size: SizeInfo,
  observerDirRaw: Vec3,
  opts: ObserverMarkerOptions = {},
): void {
  if (!canvasSizeValid(size) || size.cssW < 40 || size.cssH < 40) return;

  const observerDir = normalizeObserverDirSafe(observerDirRaw);

  const cx = size.cssW * 0.5;
  const cy = size.cssH * 0.5;

  const dx = Number.isFinite(observerDir.x) ? observerDir.x : 0;
  const dy = Number.isFinite(observerDir.y) ? observerDir.y : 0;
  const ang = Math.atan2(dy, dx);

  const radiusMinPx = toFinitePositiveOr(opts.radiusMinPx, 30);
  const radiusFactor = clamp(typeof opts.radiusFactor === "number" ? opts.radiusFactor : 0.48, 0.05, 0.95);
  const radius = Math.max(radiusMinPx, Math.min(size.cssW, size.cssH) * radiusFactor);

  const ox = cx + Math.cos(ang) * radius;
  const oy = cy - Math.sin(ang) * radius; // canvas y down

  const theme = themeResolved();

  // line of sight (dashed)
  ctx.save();
  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(ox, oy);
  ctx.lineTo(cx, cy);
  ctx.stroke();
  ctx.restore();

  // marker
  ctx.save();
  ctx.fillStyle = opts.markerFill ?? theme.accent;
  ctx.strokeStyle = opts.markerStroke ?? "rgba(0,0,0,0.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(ox, oy, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = DEFAULT_THEME.font;
  ctx.fillText(opts.label ?? "Observer", ox + 10, oy - 10);
  ctx.restore();
}

/**
 * Draw an inset observer-direction gizmo (panel with eye + sphere marker).
 * This is a visualization aid only and does not influence physics. [file:119]
 */
function drawObserverGizmoInsetResolved(
  ctx: CanvasRenderingContext2D,
  size: SizeInfo,
  observerDir: Vec3,
  th: OverlayTheme,
): void {
  if (!canvasSizeValid(size) || size.cssW < 40 || size.cssH < 40) return;

  const pad = 12;
  const boxW = Math.max(160, Math.min(250, size.cssW - 2 * pad));
  const boxH = Math.max(64, Math.min(84, size.cssH - 2 * pad));
  const x0 = Math.max(pad, size.cssW - pad - boxW);
  const y0 = pad;

  // Normalize for angles.
  const dx = Number.isFinite(observerDir.x) ? observerDir.x : 0;
  const dyWorld = Number.isFinite(observerDir.y) ? observerDir.y : 0;
  const dz = Number.isFinite(observerDir.z) ? observerDir.z : 1;
  const r3 = Math.hypot(dx, dyWorld, dz) || 1;
  const xN = dx / r3;
  const yN = dyWorld / r3;
  const zN = dz / r3;

  // azimuth in xy plane and tilt from +z
  const phiDeg = (Math.atan2(yN, xN) * 180) / Math.PI;
  const thetaDeg = (Math.acos(clamp(zN, -1, 1)) * 180) / Math.PI;

  ctx.save();
  ctx.translate(x0, y0);

  // panel background
  pathRoundRect(ctx, 0, 0, boxW, boxH, 10);
  ctx.fillStyle = th.panelFill;
  ctx.fill();
  ctx.strokeStyle = th.panelStroke;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Eye (left)
  const eyeCx = 30;
  const eyeCy = boxH * 0.5;
  ctx.save();
  ctx.translate(eyeCx, eyeCy);
  ctx.beginPath();
  ctx.ellipse(0, 0, 16, 9, 0, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.80)";
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
  ctx.fillStyle = th.accent;
  ctx.fill();
  ctx.restore();

  // Sphere widget (right): indicates direction; zN<0 is marked with an X.
  const sphCx = boxW - 70;
  const sphCy = eyeCy;
  const sphR = 22;

  ctx.beginPath();
  ctx.arc(sphCx, sphCy, sphR, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = th.fontSmall;
  ctx.fillText("+x", sphCx + sphR + 4, sphCy + 3);
  ctx.fillText("-x", sphCx - sphR - 20, sphCy + 3);
  ctx.fillText("+y", sphCx - 7, sphCy - sphR - 4);
  ctx.fillText("-y", sphCx - 7, sphCy + sphR + 12);

  const px = sphCx + xN * sphR;
  const py = sphCy + -yN * sphR; // canvas y down

  if (zN >= 0) {
    ctx.beginPath();
    ctx.arc(px, py, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = th.accent;
    ctx.fill();
  } else {
    ctx.strokeStyle = th.warn;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px - 4, py - 4);
    ctx.lineTo(px + 4, py + 4);
    ctx.moveTo(px + 4, py - 4);
    ctx.lineTo(px - 4, py + 4);
    ctx.stroke();
  }

  // Labels
  ctx.fillStyle = "rgba(255,255,255,0.80)";
  ctx.font = th.font;
  ctx.fillText("Viewing direction", 56, 18);
  ctx.font = th.fontSmall;
  ctx.fillText("line of sight: star → observer", 56, boxH - 36);
  ctx.fillText(`azimuth φ = ${phiDeg.toFixed(0)}°`, 56, boxH - 22);
  ctx.fillText(`tilt θ = ${thetaDeg.toFixed(0)}°`, 56, boxH - 8);

  ctx.restore();
}

export function drawDebugOverlayV3(
  ctx: CanvasRenderingContext2D,
  size: SizeInfo,
  data: DebugOverlayDataV3,
  observerDirRaw: Vec3,
  toggles?: DebugOverlayToggles,
  opts: DebugOverlayOptions = {},
): void {
  const dbg = resolveDebugOverlayToggles(toggles);
  if (!dbg.enabled) return;
  if (!canvasSizeValid(size)) return;

  const th = themeResolved(opts.theme);
  const observerDir = opts.observerDirNormalized ? observerDirRaw : normalizeObserverDirSafe(observerDirRaw);

  // Optional inset gizmo first (top-right).
  if (dbg.showObserverDir) {
    drawObserverGizmoInsetResolved(ctx, size, observerDir, th);
  }

  const x0 = typeof opts.textX === "number" ? opts.textX : 10;
  const yStart = typeof opts.textY0 === "number" ? opts.textY0 : 18;
  const lineH = toFinitePositiveOr(opts.lineHeight, 16);

  ctx.save();
  ctx.fillStyle = th.textColor;
  ctx.font = th.font;

  let y = yStart;
  const line = (s: string) => {
    ctx.fillText(s, x0, y);
    y += lineH;
  };

  if (dbg.showObserverDir) {
    line(
      `Observer dir = (${observerDir.x.toFixed(2)}, ${observerDir.y.toFixed(2)}, ${observerDir.z.toFixed(2)})`,
    );
  }

  if (dbg.showOcculters) {
    const nOcc = data.nOcculters;
    if (typeof nOcc === "number" && Number.isFinite(nOcc)) line(`Occulters = ${nOcc}`);
  }

  if (dbg.showImpactParams) {
    const bP = data.bPlanet;
    const bM = data.bMoon;
    if (typeof bP === "number" && Number.isFinite(bP)) line(`b_planet(front) = ${bP.toFixed(3)}`);
    if (typeof bM === "number" && Number.isFinite(bM)) line(`b_moon(front)   = ${bM.toFixed(3)}`);
  }

  if (dbg.showTDV) {
    const tdv = data.tdvRatio;
    const vSky = data.vPlanetSky;
    const vRef = data.vPlanetSkyRef;
    if (typeof tdv === "number" && Number.isFinite(tdv)) line(`TDV ratio = ${tdv.toFixed(4)}`);
    if (typeof vSky === "number" && Number.isFinite(vSky)) line(`v_sky(t)   = ${vSky.toFixed(6)}`);
    if (typeof vRef === "number" && Number.isFinite(vRef)) line(`v_sky(ref) = ${vRef.toFixed(6)}`);
  }

  if (dbg.showFluxDecomposition) {
    const baseline = data.baselineFluxUsed;
    const svar = data.stellarVariabilityFlux;

    if (typeof baseline === "number" && Number.isFinite(baseline))
      line(`baselineFlux = ${baseline.toFixed(6)}`);
    if (typeof svar === "number" && Number.isFinite(svar)) line(`stellarVar   = ${svar.toExponential(3)}`);

    const ft = data.fluxTransitFactor;
    if (typeof ft === "number" && Number.isFinite(ft)) line(`F_transit    = ${ft.toFixed(6)}`);

    const f = data.fluxTotal;
    if (typeof f === "number" && Number.isFinite(f)) line(`F_total      = ${f.toFixed(6)}`);

    const fDisplay = data.displayFluxValue;
    if (typeof fDisplay === "number" && Number.isFinite(fDisplay))
      line(`F_display    = ${fDisplay.toFixed(6)}`);
  }

  ctx.restore();
}
