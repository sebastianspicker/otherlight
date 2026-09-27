/**
 * Plate & Figure ink for canvas evidence.
 *
 * Two surfaces exist. The sky "plate" is always dark because it depicts light
 * against the sky. The printed "figure" (light curve, O-C history) follows the
 * page theme: ink on paper, or paper-toned ink on a dark page. Callers keep
 * passing their semantic hex colors; `inkFor` translates them for the surface
 * so that every series stays legible on the ground it is drawn on.
 *
 * Values mirror the color roles in `styles/plate-figure/tokens.css`.
 */

export type FigureTheme = "light" | "dark";
export type InkSurface = "figure" | "plate";

export type FigureInk = {
  paper: string;
  ink: string;
  ink2: string;
  ink3: string;
  frame: string;
  grid: string;
  traceA: string;
  traceB: string;
  caution: string;
  fault: string;
  chip: string;
  chipRule: string;
};

const LIGHT: FigureInk = {
  paper: "#f3efe6",
  ink: "#17191b",
  ink2: "#45484b",
  ink3: "#5d6063",
  frame: "#17191b",
  grid: "rgba(23, 25, 27, 0.08)",
  traceA: "#17191b",
  traceB: "#1f55b3",
  caution: "#72500a",
  fault: "#9e2a2b",
  chip: "rgba(243, 239, 230, 0.94)",
  chipRule: "rgba(23, 25, 27, 0.28)",
};

const DARK: FigureInk = {
  paper: "#131416",
  ink: "#ebe6db",
  ink2: "#bbb6ab",
  ink3: "#99958c",
  frame: "#ebe6db",
  grid: "rgba(235, 230, 219, 0.08)",
  traceA: "#ebe6db",
  traceB: "#8fb3ff",
  caution: "#e2bf76",
  fault: "#ff9f96",
  chip: "rgba(19, 20, 22, 0.92)",
  chipRule: "rgba(235, 230, 219, 0.3)",
};

/** The sky plate is identical in both themes. */
export const PLATE_INK = {
  sky: "#0c0f13",
  ink: "#e6e1d4",
  ink3: "#8f8b82",
  traceA: "#e6e1d4",
  traceB: "#8fb3ff",
} as const;

export const FIGURE_FONTS = {
  mono: '"Atkinson Hyperlegible Mono", ui-monospace, "SF Mono", Menlo, monospace',
  sans: '"Atkinson Hyperlegible Next", system-ui, sans-serif',
  serif: '"STIX Two Text", "STIX Two", Georgia, serif',
} as const;

let theme: FigureTheme = "light";

/** Current figure ink; read at draw time so a theme change applies on the next frame. */
export function figureInk(): FigureInk {
  return theme === "dark" ? DARK : LIGHT;
}

export function setFigureTheme(next: FigureTheme): void {
  theme = next;
}

/*
 * Semantic colors used by callers, grouped by the role they play. The light
 * figure needs darker equivalents of these pastel/sky tones; the dark figure
 * and the plate can show them as authored, except for the A/B traces.
 */
const TRACE_A = ["#9ddcff", "#4cc9f0"];
const TRACE_B = ["#f3cf87"];
const PLANET = ["#8ecae6"];
const NEUTRAL = ["#adb5bd", "#6c757d", "#b8c0cc"];
const CAUTION = ["#ffd166", "#ffb703", "#f4a261", "#fb8500", "#f5c26b", "#ffd675"];
const FAULT = ["#ef476f", "#f28482", "rgb(239,71,111)", "rgba(239,71,111,1)"];
const VIOLET = ["#cdb4db"];
const GREEN = ["#90be6d"];

function table(entries: [string[], string][]): Map<string, string> {
  const map = new Map<string, string>();
  for (const [keys, value] of entries) for (const key of keys) map.set(key, value);
  return map;
}

const LIGHT_FIGURE = table([
  [TRACE_A, LIGHT.traceA],
  [TRACE_B, LIGHT.traceB],
  [PLANET, LIGHT.traceB],
  [NEUTRAL, LIGHT.ink3],
  [CAUTION, LIGHT.caution],
  [FAULT, LIGHT.fault],
  [VIOLET, "#5f3f86"],
  [GREEN, "#2b6a3e"],
]);

const DARK_FIGURE = table([
  [TRACE_A, DARK.traceA],
  [TRACE_B, DARK.traceB],
]);

const PLATE = table([
  [TRACE_A, PLATE_INK.traceA],
  [TRACE_B, PLATE_INK.traceB],
]);

const normalize = (color: string): string => color.toLowerCase().replace(/\s+/g, "");

/** Translate a caller's semantic color for the surface it is drawn on. */
export function inkFor(color: string, surface: InkSurface): string {
  const lookup = surface === "plate" ? PLATE : theme === "dark" ? DARK_FIGURE : LIGHT_FIGURE;
  return lookup.get(normalize(color)) ?? color;
}
