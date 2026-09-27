/** Renders non-physical scene overlays separately from celestial-body drawing. */
//
// Canvas2D overlay helpers (debug HUD, observer gizmo, marker).
//
// Design goals:
// - Visualization only: never mutate simulation state.
// - Robust against NaN/Infinity / near-zero vectors.
// - Keep conventions consistent with core/types.ts and render/canvas2d.ts:
//   observer.dir points from star to observer; larger sky.z means closer to observer. [file:100][file:119]

import { toFinitePositiveOr } from "../../../domain/model/units";
import type { Vec3 } from "../../../domain/orbits/vec3";
import { vIsFinite, vNormalizeOrThrow } from "../../../domain/orbits/vec3";
import type { SizeInfo } from "../canvas/canvasUtil";
import { drawObserverGizmoInsetResolved } from "./observerGizmoInset";
import type { OverlayTheme } from "./overlayTypes";

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

export type DebugOverlayData = {
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

type DebugLineWriter = (s: string) => void;

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

function resolveDebugOverlayToggles(t?: DebugOverlayToggles): RequiredDebugOverlayToggles {
  const d = defaultDebugOverlayToggles();
  return {
    enabled: overlayDefault(t?.enabled, d.enabled),
    showObserverDir: overlayDefault(t?.showObserverDir, d.showObserverDir),
    showObserverMarker: overlayDefault(t?.showObserverMarker, d.showObserverMarker),
    showOcculters: overlayDefault(t?.showOcculters, d.showOcculters),
    showImpactParams: overlayDefault(t?.showImpactParams, d.showImpactParams),
    showTDV: overlayDefault(t?.showTDV, d.showTDV),
    showFluxDecomposition: overlayDefault(t?.showFluxDecomposition, d.showFluxDecomposition),
  };
}

function overlayDefault<T>(value: T | undefined, fallback: T): T {
  return value ?? fallback;
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

export function drawDebugOverlay(
  ctx: CanvasRenderingContext2D,
  size: SizeInfo,
  data: DebugOverlayData,
  observerDirRaw: Vec3,
  toggles?: DebugOverlayToggles,
  opts: DebugOverlayOptions = {},
): void {
  const dbg = resolveDebugOverlayToggles(toggles);
  if (!debugOverlayReady(dbg, size)) return;

  const th = themeResolved(opts.theme);
  const observerDir = resolvedOverlayObserverDir(observerDirRaw, opts);
  drawObserverGizmoIfEnabled(ctx, size, observerDir, th, dbg);
  drawDebugTextBlock({ ctx, data, observerDir, dbg, theme: th, opts });
}

function debugOverlayReady(dbg: RequiredDebugOverlayToggles, size: SizeInfo): boolean {
  return dbg.enabled && canvasSizeValid(size);
}

function resolvedOverlayObserverDir(observerDirRaw: Vec3, opts: DebugOverlayOptions): Vec3 {
  return opts.observerDirNormalized ? observerDirRaw : normalizeObserverDirSafe(observerDirRaw);
}

function drawObserverGizmoIfEnabled(
  ctx: CanvasRenderingContext2D,
  size: SizeInfo,
  observerDir: Vec3,
  th: OverlayTheme,
  dbg: RequiredDebugOverlayToggles,
): void {
  if (dbg.showObserverDir) drawObserverGizmoInsetResolved(ctx, size, observerDir, th);
}

function drawDebugTextBlock(args: {
  ctx: CanvasRenderingContext2D;
  data: DebugOverlayData;
  observerDir: Vec3;
  dbg: RequiredDebugOverlayToggles;
  theme: OverlayTheme;
  opts: DebugOverlayOptions;
}): void {
  const { ctx, data, observerDir, dbg, theme, opts } = args;
  ctx.save();
  ctx.fillStyle = theme.textColor;
  ctx.font = theme.font;
  const line = debugLineWriter(ctx, opts);
  writeObserverDirectionLine(dbg, observerDir, line);
  writeOcculterLine(dbg, data, line);
  writeImpactParamLines(dbg, data, line);
  writeTdvLines(dbg, data, line);
  writeFluxDecompositionLines(dbg, data, line);
  ctx.restore();
}

function debugLineWriter(ctx: CanvasRenderingContext2D, opts: DebugOverlayOptions): DebugLineWriter {
  const x0 = typeof opts.textX === "number" ? opts.textX : 10;
  const lineH = toFinitePositiveOr(opts.lineHeight, 16);
  let y = typeof opts.textY0 === "number" ? opts.textY0 : 18;
  return (s: string) => {
    ctx.fillText(s, x0, y);
    y += lineH;
  };
}

function writeObserverDirectionLine(
  dbg: RequiredDebugOverlayToggles,
  observerDir: Vec3,
  line: DebugLineWriter,
): void {
  if (!dbg.showObserverDir) return;
  line(
    `Observer dir = (${observerDir.x.toFixed(2)}, ${observerDir.y.toFixed(2)}, ${observerDir.z.toFixed(2)})`,
  );
}

function writeOcculterLine(
  dbg: RequiredDebugOverlayToggles,
  data: DebugOverlayData,
  line: DebugLineWriter,
): void {
  if (!dbg.showOcculters) return;
  writeFiniteDebugNumber(data.nOcculters, line, (nOcc) => `Occulters = ${nOcc}`);
}

function writeImpactParamLines(
  dbg: RequiredDebugOverlayToggles,
  data: DebugOverlayData,
  line: DebugLineWriter,
): void {
  if (!dbg.showImpactParams) return;
  writeFiniteDebugNumber(data.bPlanet, line, (bP) => `b_planet(front) = ${bP.toFixed(3)}`);
  writeFiniteDebugNumber(data.bMoon, line, (bM) => `b_moon(front)   = ${bM.toFixed(3)}`);
}

function writeTdvLines(
  dbg: RequiredDebugOverlayToggles,
  data: DebugOverlayData,
  line: DebugLineWriter,
): void {
  if (!dbg.showTDV) return;
  writeFiniteDebugNumber(data.tdvRatio, line, (tdv) => `TDV ratio = ${tdv.toFixed(4)}`);
  writeFiniteDebugNumber(data.vPlanetSky, line, (vSky) => `v_sky(t)   = ${vSky.toFixed(6)}`);
  writeFiniteDebugNumber(data.vPlanetSkyRef, line, (vRef) => `v_sky(ref) = ${vRef.toFixed(6)}`);
}

function writeFluxDecompositionLines(
  dbg: RequiredDebugOverlayToggles,
  data: DebugOverlayData,
  line: DebugLineWriter,
): void {
  if (!dbg.showFluxDecomposition) return;
  writeFiniteDebugNumber(data.baselineFluxUsed, line, (baseline) => `baselineFlux = ${baseline.toFixed(6)}`);
  writeFiniteDebugNumber(
    data.stellarVariabilityFlux,
    line,
    (svar) => `stellarVar   = ${svar.toExponential(3)}`,
  );
  writeFiniteDebugNumber(data.fluxTransitFactor, line, (ft) => `F_transit    = ${ft.toFixed(6)}`);
  writeFiniteDebugNumber(data.fluxTotal, line, (f) => `F_total      = ${f.toFixed(6)}`);
  writeFiniteDebugNumber(data.displayFluxValue, line, (fDisplay) => `F_display    = ${fDisplay.toFixed(6)}`);
}

function writeFiniteDebugNumber(
  value: number | undefined,
  line: DebugLineWriter,
  format: (value: number) => string,
): void {
  if (typeof value === "number" && Number.isFinite(value)) line(format(value));
}
