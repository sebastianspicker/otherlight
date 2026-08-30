/** Owns canvas scene ordering support within the render layer. */
import type { RenderOcculterGeometry } from "../../domain/simulation/frames";

export type Drawable = {
  kind: "star" | "occulter";
  z: number;
  geometry?: RenderOcculterGeometry;
};

export function compareDrawables(a: Drawable, b: Drawable): number {
  if (a.z !== b.z) return a.z - b.z;
  if (a.kind === b.kind) {
    if (a.kind === "occulter" && a.geometry && b.geometry) {
      const rank = (g: RenderOcculterGeometry) => (g.kind === "ring" ? 0 : 1);
      return rank(a.geometry) - rank(b.geometry);
    }
    return 0;
  }
  return a.kind === "star" ? -1 : 1;
}
