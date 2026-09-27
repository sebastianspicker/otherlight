/** Resolves stellar parent relationships in native V4 snapshots. */
import type { NativeBodyState, NativeSnapshot } from "./nativeSnapshot";

export const starParentForBody = (
  snap: NativeSnapshot,
  body: NativeBodyState,
  fallback: NativeBodyState | undefined,
): NativeBodyState | undefined => {
  const parent = body.parentId ? snap.byId.get(body.parentId) : undefined;
  return parent?.kind === "star" ? parent : fallback;
};

export const starParentForMoon = (
  snap: NativeSnapshot,
  moon: NativeBodyState,
  fallback: NativeBodyState | undefined,
): NativeBodyState | undefined => {
  const parentPlanet = moon.parentId ? snap.byId.get(moon.parentId) : undefined;
  const parentStar = parentPlanet?.parentId ? snap.byId.get(parentPlanet.parentId) : undefined;
  return parentStar?.kind === "star" ? parentStar : fallback;
};
