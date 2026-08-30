// Canvas2D sky-plane renderer; visual-only contract: do not mutate simulation state and keep the
// shared observer/sky.z convention with display-only limb darkening.

import type { BrowserScenarioDraft } from "../../domain/model/types";
import { toFinitePositiveOr } from "../../domain/model/units";
import type { Vec3 } from "../../domain/orbits/vec3";
import type { RenderOcculterGeometry, SimulationFrame } from "../../domain/simulation/frames";

import { attachCanvasResizeObserver, ensureHiDPICanvas, type SizeInfo } from "./canvasUtil";
import { StarDiskCache } from "./starDisk";
import { compareDrawables, type Drawable } from "./canvas2dOrbitProjector";
import {
  drawDidacticOverlay,
  drawEventMarkers,
  drawOcculterGeometry,
  drawStarGeometry,
  fillOverlayData,
  resolveOcculterGeometry,
} from "./canvas2dScene";
import {
  defaultDebugOverlayToggles,
  normalizeObserverDirSafe,
  drawDebugOverlay,
  type DebugOverlayData,
  type DebugOverlayToggles,
} from "./overlays";
import type { SceneDidacticOverlayState } from "./sceneTypes";

// Re-export the other renderers so existing callers can continue to import from canvas2d.ts.
export { LightCurvePlot } from "./lightCurvePlot";
export type { LightCurvePlotOptions, LightCurveSample } from "./lightCurvePlot";

export { drawStarDisk, StarDiskCache, starRadiusPx } from "./starDisk";

export {
  defaultDebugOverlayToggles,
  normalizeObserverDirSafe,
  resolveDebugOverlayToggles,
  drawDebugOverlay,
  drawObserverMarkerMainView,
} from "./overlays";
export type { DebugOverlayData, DebugOverlayToggles } from "./overlays";

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
   * If true, recompute the scene scale every frame.
   * Default: false (fit once, then keep scale stable until invalidated).
   */
  autoFitScene?: boolean;
};

type ScreenPoint = { x: number; y: number };

function getCanvas2DContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas2DRenderer: 2D context unavailable.");
  return ctx;
}

function resolveCanvas2DRendererOptions(opts: Canvas2DRendererOptions): Required<Canvas2DRendererOptions> {
  return {
    background: rendererOptionDefault(opts.background, "#000"),
    showAxes: rendererOptionDefault(opts.showAxes, true),
    autoFitScene: rendererOptionDefault(opts.autoFitScene, false),
  };
}

function rendererOptionDefault<T>(value: T | undefined, fallback: T): T {
  return value ?? fallback;
}

function rendererCssSize(
  size: SizeInfo | undefined,
  canvas: HTMLCanvasElement,
): { cssW: number; cssH: number } {
  return {
    cssW: rendererOptionDefault(size?.cssW, rendererOptionDefault(canvas.clientWidth, canvas.width)),
    cssH: rendererOptionDefault(size?.cssH, rendererOptionDefault(canvas.clientHeight, canvas.height)),
  };
}

function sceneMaxExtent(params: BrowserScenarioDraft, step: SimulationFrame): number {
  let maxExtent = toFinitePositiveOr(params.star?.r, 1);
  for (const geometry of resolveOcculterGeometry(params, step)) {
    maxExtent = Math.max(maxExtent, geometryMaxExtent(geometry));
  }
  return Math.max(maxExtent, 1e-6);
}

function geometryMaxExtent(geometry: RenderOcculterGeometry): number {
  const x = Math.abs(Number.isFinite(geometry.center.x) ? geometry.center.x : 0);
  const y = Math.abs(Number.isFinite(geometry.center.y) ? geometry.center.y : 0);
  const radii = geometryExtentRadii(geometry);
  return Math.max(x + radii.x, y + radii.y);
}

function geometryExtentRadii(geometry: RenderOcculterGeometry): { x: number; y: number } {
  if (geometry.kind === "circle") {
    const r = toFinitePositiveOr(geometry.radius, 1e-6);
    return { x: r, y: r };
  }
  if (geometry.kind === "ellipse") {
    return {
      x: toFinitePositiveOr(geometry.rx, 1e-6),
      y: toFinitePositiveOr(geometry.ry, 1e-6),
    };
  }
  const r = toFinitePositiveOr(geometry.outerRadius, 1e-6);
  return { x: r, y: r };
}

function sceneScaleForSize(cssW: number, cssH: number, maxExtent: number): number {
  const padFrac = 0.12;
  const usableHalfWidth = Math.max(1, cssW * 0.5 * (1 - padFrac));
  const usableHalfHeight = Math.max(1, cssH * 0.5 * (1 - padFrac));
  return Math.max(1e-12, Math.min(usableHalfWidth, usableHalfHeight) / maxExtent);
}

export class Canvas2DRenderer {
  private ctx: CanvasRenderingContext2D;
  private size?: SizeInfo;
  private scratchPoint0 = { x: 0, y: 0 };
  private viewportCx = 0;
  private viewportCy = 0;
  private overlayDataScratch: DebugOverlayData = {};
  private secondaryStarParamsScratch: BrowserScenarioDraft = {
    observer: { dir: { x: 0, y: 0, z: 1 } },
    star: { r: 1 },
    planet: {
      r: 1,
      orbit: { a: 1, e: 0, inc: 0, Omega: 0, omega: 0, period: 1, t0: 0 },
    },
  };

  /**
   * World -> CSS pixel scale (simulation length units to pixels).
   * Keep this purely visual; it must not be fed back into physics.
   */
  public pixelsPerUnit = 1.2;
  private basePixelsPerUnit = 1.2;
  private zoomMultiplier = 1;

  /** Debug overlay toggles (visual-only). */
  public debug: DebugOverlayToggles = defaultDebugOverlayToggles();

  private opts: Required<Canvas2DRendererOptions>;
  private starDiskCache = new StarDiskCache();
  private drawList: Drawable[] = [];
  private autoFitScene = false;
  private hasSceneScale = false;
  private didacticOverlay?: SceneDidacticOverlayState;
  private detachResizeObserver: () => void = () => {};

  constructor(
    private canvas: HTMLCanvasElement,
    opts: Canvas2DRendererOptions = {},
  ) {
    this.ctx = getCanvas2DContext(canvas);
    this.opts = resolveCanvas2DRendererOptions(opts);
    this.autoFitScene = this.opts.autoFitScene;

    this.detachResizeObserver = attachCanvasResizeObserver(this.canvas);
    this.size = ensureHiDPICanvas(this.canvas, this.ctx, this.size);
    this.updateViewportCenter();
  }

  /** Disconnect the ResizeObserver. Call when the renderer is permanently discarded. */
  public dispose(): void {
    this.detachResizeObserver();
  }

  public setAutoFitScene(enabled: boolean): void {
    this.autoFitScene = enabled;
    if (enabled) this.hasSceneScale = false;
  }

  public invalidateSceneScale(): void {
    this.hasSceneScale = false;
  }

  public setZoomMultiplier(multiplier: number): number {
    const next = Number.isFinite(multiplier) ? Math.min(512, Math.max(0.125, multiplier)) : 1;
    this.zoomMultiplier = next;
    this.pixelsPerUnit = this.basePixelsPerUnit * this.zoomMultiplier;
    return this.zoomMultiplier;
  }

  public getZoomMultiplier(): number {
    return this.zoomMultiplier;
  }

  public resetZoom(): void {
    this.setZoomMultiplier(1);
  }

  public setDidacticOverlay(overlay?: SceneDidacticOverlayState): void {
    this.didacticOverlay = overlay;
  }

  private updateViewportCenter(): void {
    const { cssW, cssH } = rendererCssSize(this.size, this.canvas);
    this.viewportCx = cssW * 0.5;
    this.viewportCy = cssH * 0.5;
  }

  /** Convert sky-plane world coords (x,y) to CSS pixel coords. */
  private toPxInto(x: number, y: number, out: ScreenPoint): ScreenPoint {
    // Convention: world +y is up; canvas +y is down.
    out.x = this.viewportCx + x * this.pixelsPerUnit;
    out.y = this.viewportCy - y * this.pixelsPerUnit;
    return out;
  }

  private fitSceneScale(params: BrowserScenarioDraft, step: SimulationFrame): void {
    const { cssW, cssH } = rendererCssSize(this.size, this.canvas);
    if (!(cssW > 0 && cssH > 0)) return;
    this.basePixelsPerUnit = sceneScaleForSize(cssW, cssH, sceneMaxExtent(params, step));
    this.pixelsPerUnit = this.basePixelsPerUnit * this.zoomMultiplier;
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

  private drawStar(params: BrowserScenarioDraft): void {
    drawStarGeometry({
      ctx: this.ctx,
      toPxInto: this.toPxInto.bind(this),
      scratchPoint: this.scratchPoint0,
      pixelsPerUnit: this.pixelsPerUnit,
      starDiskCache: this.starDiskCache,
      params,
      x: 0,
      y: 0,
      r: params.star.r,
      z: 0,
      variant: "primary",
      resolveSecondaryStarParams: this.resolveSecondaryStarParams.bind(this),
    });
  }

  private resolveSecondaryStarParams(r: number): BrowserScenarioDraft {
    const params = this.secondaryStarParamsScratch;
    params.star.r = r;
    params.star.photometry = undefined;
    return params;
  }

  private toOverlayData(step: SimulationFrame): DebugOverlayData {
    return fillOverlayData(this.overlayDataScratch, step);
  }

  private drawEventMarkers(step: SimulationFrame): void {
    drawEventMarkers({
      ctx: this.ctx,
      cssH: this.size?.cssH ?? 0,
      markers: step.renderSignals.eventMarkers,
      timingMarkers: step.renderSignals.timingMarkers,
    });
  }

  private drawOcculterGeometry(
    params: BrowserScenarioDraft,
    geometry: RenderOcculterGeometry,
    rStar: number,
  ): void {
    drawOcculterGeometry({
      ctx: this.ctx,
      toPxInto: this.toPxInto.bind(this),
      scratchPoint: this.scratchPoint0,
      pixelsPerUnit: this.pixelsPerUnit,
      starDiskCache: this.starDiskCache,
      secondaryStarParamsScratch: this.secondaryStarParamsScratch,
      params,
      geometry,
      rStar,
      resolveSecondaryStarParams: this.resolveSecondaryStarParams.bind(this),
    });
  }

  private prepareFrame(params: BrowserScenarioDraft, step: SimulationFrame): SizeInfo {
    this.size = ensureHiDPICanvas(this.canvas, this.ctx, this.size);
    this.updateViewportCenter();
    this.updateSceneScaleIfNeeded(params, step);
    return this.size;
  }

  private updateSceneScaleIfNeeded(params: BrowserScenarioDraft, step: SimulationFrame): void {
    if (!(this.autoFitScene || !this.hasSceneScale)) return;
    this.fitSceneScale(params, step);
    this.hasSceneScale = true;
  }

  private drawFrameBackground(cssW: number, cssH: number): void {
    this.ctx.clearRect(0, 0, cssW, cssH);
    this.ctx.fillStyle = this.opts.background;
    this.ctx.fillRect(0, 0, cssW, cssH);
  }

  private resolveFrameObserverDir(params: BrowserScenarioDraft, step: SimulationFrame): Vec3 {
    return normalizeObserverDirSafe(step.renderSignals.orbitFrames.observerDir ?? params.observer?.dir);
  }

  private prepareSceneDrawList(params: BrowserScenarioDraft, step: SimulationFrame): Drawable[] {
    const drawList = this.drawList;
    let drawCount = 0;
    this.setStarDrawItem(drawList, drawCount);
    drawCount++;
    for (const geometry of resolveOcculterGeometry(params, step)) {
      this.setOcculterDrawItem(drawList, drawCount, geometry);
      drawCount++;
    }
    drawList.length = drawCount;
    this.sortSceneDrawList(drawList, drawCount);
    return drawList;
  }

  private setStarDrawItem(drawList: Drawable[], index: number): void {
    const drawItem = drawList[index] ?? { kind: "star", z: 0 };
    drawItem.kind = "star";
    drawItem.z = 0;
    drawItem.geometry = undefined;
    drawList[index] = drawItem;
  }

  private setOcculterDrawItem(drawList: Drawable[], index: number, geometry: RenderOcculterGeometry): void {
    const drawItem = drawList[index] ?? { kind: "occulter", z: 0, geometry };
    drawItem.kind = "occulter";
    drawItem.z = Number.isFinite(geometry.center.z) ? geometry.center.z : 0;
    drawItem.geometry = geometry;
    drawList[index] = drawItem;
  }

  private sortSceneDrawList(drawList: Drawable[], drawCount: number): void {
    if (drawCount === 2 && compareDrawables(drawList[0], drawList[1]) > 0) {
      const first = drawList[0];
      drawList[0] = drawList[1];
      drawList[1] = first;
      return;
    }
    if (drawCount > 2) drawList.sort(compareDrawables);
  }

  private drawSceneDrawList(drawList: Drawable[], params: BrowserScenarioDraft): void {
    for (const item of drawList) {
      if (item.kind === "star") {
        this.drawStar(params);
        continue;
      }
      if (item.geometry) this.drawOcculterGeometry(params, item.geometry, params.star.r);
    }
  }

  private drawDidacticOverlayForFrame(cssW: number): void {
    drawDidacticOverlay({
      ctx: this.ctx,
      toPxInto: this.toPxInto.bind(this),
      scratchPoint: this.scratchPoint0,
      pixelsPerUnit: this.pixelsPerUnit,
      cssW,
      overlay: this.didacticOverlay,
    });
  }

  private drawDebugOverlayForFrame(size: SizeInfo, observerDir: Vec3, step: SimulationFrame): void {
    drawDebugOverlay(this.ctx, size, this.toOverlayData(step), observerDir, this.debug, {
      observerDirNormalized: true,
    });
  }

  /** Render one canonical simulation frame. */
  drawFrame(params: BrowserScenarioDraft, step: SimulationFrame): void {
    const size = this.prepareFrame(params, step);
    this.drawFrameBackground(size.cssW, size.cssH);
    this.drawAxes();

    const observerDir = this.resolveFrameObserverDir(params, step);
    this.drawSceneDrawList(this.prepareSceneDrawList(params, step), params);
    this.drawEventMarkers(step);
    this.drawDidacticOverlayForFrame(size.cssW);
    this.drawDebugOverlayForFrame(size, observerDir, step);
  }
}
