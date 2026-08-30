/**
 * Owns scene Types support within the render layer. Keeps visual projection and drawing concerns out of simulation state.
 */
export type ScratchPoint = { x: number; y: number };
export type ToPxInto = (x: number, y: number, out: ScratchPoint) => ScratchPoint;

export type AtmosphereHaloStyle = {
  outerRadius: number;
  alphaScale: number;
  innerColor: string;
  outerColor: string;
};

export type SceneAnnotationLine = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color?: string;
  label?: string;
  dashed?: boolean;
};

export type SceneAnnotationPoint = {
  x: number;
  y: number;
  color?: string;
  label?: string;
};

export type SceneAnnotationBadge = {
  label: string;
  color?: string;
};

export type SceneGhostGeometry = {
  label: string;
  color?: string;
  geometry: Array<
    | {
        body: "planet" | "moon" | "star";
        kind: "circle";
        center: { x: number; y: number; z: number };
        radius: number;
      }
    | {
        body: "planet" | "moon" | "star";
        kind: "ellipse";
        center: { x: number; y: number; z: number };
        rx: number;
        ry: number;
        angle: number;
      }
    | {
        body: "planet" | "moon" | "star";
        kind: "ring";
        center: { x: number; y: number; z: number };
        innerRadius: number;
        outerRadius: number;
        inclination: number;
        angle: number;
      }
  >;
};

export type SceneDidacticOverlayState = {
  lines?: SceneAnnotationLine[];
  points?: SceneAnnotationPoint[];
  badges?: SceneAnnotationBadge[];
  ghosts?: SceneGhostGeometry[];
};
