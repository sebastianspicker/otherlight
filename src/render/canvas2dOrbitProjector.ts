import type { RenderOcculterGeometryV3 } from "../sim/v3/types";

import type { OrbitPathPoint2D } from "./orbitPathCache";

export type Drawable = {
  kind: "star" | "occulter";
  z: number;
  geometry?: RenderOcculterGeometryV3;
};

export function compareDrawables(a: Drawable, b: Drawable): number {
  if (a.z !== b.z) return a.z - b.z;
  if (a.kind === b.kind) {
    if (a.kind === "occulter" && a.geometry && b.geometry) {
      const rank = (g: RenderOcculterGeometryV3) => (g.kind === "ring" ? 0 : 1);
      return rank(a.geometry) - rank(b.geometry);
    }
    return 0;
  }
  return a.kind === "star" ? -1 : 1;
}

type ProjectedOrbitPath = {
  pixelsPerUnit: number;
  viewportCx: number;
  viewportCy: number;
  coords: Float32Array;
  path2d?: Path2D;
};

export class ProjectedOrbitPathCache {
  private cache = new WeakMap<OrbitPathPoint2D[], ProjectedOrbitPath>();

  getProjectedPath(
    pts: OrbitPathPoint2D[],
    pixelsPerUnit: number,
    viewportCx: number,
    viewportCy: number,
  ): ProjectedOrbitPath {
    const cached = this.cache.get(pts);
    if (
      cached &&
      cached.pixelsPerUnit === pixelsPerUnit &&
      cached.viewportCx === viewportCx &&
      cached.viewportCy === viewportCy
    ) {
      return cached;
    }

    const coords = new Float32Array(pts.length * 2);
    for (let i = 0; i < pts.length; i++) {
      const offset = i * 2;
      coords[offset] = viewportCx + pts[i].x * pixelsPerUnit;
      coords[offset + 1] = viewportCy - pts[i].y * pixelsPerUnit;
    }

    const projected: ProjectedOrbitPath = {
      pixelsPerUnit,
      viewportCx,
      viewportCy,
      coords,
    };

    if (typeof Path2D !== "undefined") {
      const path = new Path2D();
      path.moveTo(coords[0], coords[1]);
      for (let i = 1; i < pts.length; i++) {
        const offset = i * 2;
        path.lineTo(coords[offset], coords[offset + 1]);
      }
      projected.path2d = path;
    }

    this.cache.set(pts, projected);
    return projected;
  }
}
