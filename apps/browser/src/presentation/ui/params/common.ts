/**
 * Owns common support within the ui layer. Keeps DOM-facing behavior separate from application orchestration.
 */
import type {
  LimbDarkeningLaw,
  LimbDarkeningLawQuadratic,
  LimbDarkeningModel,
  PhotometryParams,
  BrowserScenarioDraft,
} from "../../../domain/model/types";
import { DEG2RAD, RAD2DEG, clamp } from "../../../domain/model/units";
import { vIsFinite, vNormalizeOrZero } from "../../../domain/orbits/vec3";
import {
  readCheckbox,
  readNumberInput,
  sanitizeEcc,
  sanitizeFinite,
  sanitizeIncDeg,
  sanitizePositive,
  writeNumberInput,
} from "../inputs";
import { applyObserverModeContract, type UiMode } from "../mode";
import type { UiRefs } from "../refs";

export type OrbitInputRefs = {
  a: HTMLInputElement;
  e: HTMLInputElement;
  inc: HTMLInputElement;
  period: HTMLInputElement;
};

export type OblateInputRefs = {
  enabled: HTMLInputElement;
  oblateness: HTMLInputElement;
};

export type RingInputRefs = {
  enabled: HTMLInputElement;
  inner: HTMLInputElement;
  outer: HTMLInputElement;
  incDeg: HTMLInputElement;
  angleDeg: HTMLInputElement;
};

export const ORBIT_A_MIN = 0.001;
export const ORBIT_A_MAX = 1e12;
export const ORBIT_PERIOD_MIN = 0.001;
export const ORBIT_PERIOD_MAX = 1e18;
export const MAX_FREEFORM_INPUT_CHARS = 8192;
export const MAX_NUMBER_LIST_ENTRIES = 256;
export const MAX_QUADRATIC_BAND_ENTRIES = 128;
const OBLA_MAX = 0.95;
const RING_INC_MAX_DEG = 90;
export const RADIUS_MIN = 1e3;
export const RADIUS_MAX = 1e12;

export type DefaultPatchInputs = {
  p1x: number;
  p1y: number;
  p1r: number;
  p1f: number;
  p2x: number;
  p2y: number;
  p2rx: number;
  p2ry: number;
  p2angle: number;
  p2f: number;
};

export const roundPatchLength = (value: number): number => Math.round(value / 1e6) * 1e6;

export const defaultPatchInputs = (starRadius: number): DefaultPatchInputs => {
  const rStar = Math.max(1, starRadius);
  return {
    p1x: roundPatchLength(-0.28 * rStar),
    p1y: roundPatchLength(0.22 * rStar),
    p1r: roundPatchLength(0.16 * rStar),
    p1f: 0.75,
    p2x: roundPatchLength(0.33 * rStar),
    p2y: roundPatchLength(-0.17 * rStar),
    p2rx: roundPatchLength(0.21 * rStar),
    p2ry: roundPatchLength(0.09 * rStar),
    p2angle: 0.6,
    p2f: 1.12,
  };
};

function clampFreeformInput(text: string): string {
  return text.slice(0, MAX_FREEFORM_INPUT_CHARS);
}

function selectedLimbDarkeningLaw(model: LimbDarkeningModel): LimbDarkeningLaw | undefined {
  const band = model.bandpass;
  if (!band || !model.bands) return model.default;
  return model.bands[band] ?? model.default;
}

function quadraticCoefficients(law: LimbDarkeningLaw | undefined): { u1: number; u2: number } | undefined {
  if (!law || law.kind !== "quadratic") return undefined;
  const { u1, u2 } = law;
  if (!Number.isFinite(u1) || !Number.isFinite(u2)) return undefined;
  return { u1, u2 };
}

export function getQuadraticLDFromModel(
  model: LimbDarkeningModel | undefined,
): { u1: number; u2: number } | undefined {
  if (!model) return undefined;
  return quadraticCoefficients(selectedLimbDarkeningLaw(model));
}

export function ensurePhotometry(p: BrowserScenarioDraft): PhotometryParams {
  const ph: PhotometryParams = p.star.photometry ?? {};
  p.star.photometry = ph;
  return ph;
}

export function parseNumberList(text: string): number[] {
  if (typeof text !== "string" || text.trim().length === 0) return [];
  return clampFreeformInput(text)
    .split(/[,;\s]+/)
    .slice(0, MAX_NUMBER_LIST_ENTRIES)
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v));
}

export function formatNumberList(values: number[] | undefined): string {
  if (!Array.isArray(values) || values.length === 0) return "";
  return values
    .map((v) => (Number.isFinite(v) ? String(v) : ""))
    .filter(Boolean)
    .join(", ");
}

export function parseQuadraticBands(text: string): Record<string, LimbDarkeningLawQuadratic> | undefined {
  const entries =
    typeof text === "string"
      ? clampFreeformInput(text)
          .split(/[;\n]+/)
          .slice(0, MAX_QUADRATIC_BAND_ENTRIES)
      : [];
  const bands: Record<string, LimbDarkeningLawQuadratic> = {};

  for (const entry of entries) {
    const trimmed = entry.trim();
    if (!trimmed) continue;

    const parts = trimmed.split(/[:=]/);
    if (parts.length < 2) continue;

    const band = parts[0].trim();
    if (!band) continue;

    const coeffs = parts[1]
      .trim()
      .split(/[,\s]+/)
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v));

    if (coeffs.length < 2) continue;

    bands[band] = { kind: "quadratic", u1: coeffs[0], u2: coeffs[1] };
  }

  return Object.keys(bands).length > 0 ? bands : undefined;
}

export function formatQuadraticBands(bands: Record<string, LimbDarkeningLaw> | undefined): string {
  if (!bands) return "";
  const parts: string[] = [];

  for (const [band, law] of Object.entries(bands)) {
    if (!law || law.kind !== "quadratic") continue;
    const u1 = law.u1;
    const u2 = law.u2;
    if (!Number.isFinite(u1) || !Number.isFinite(u2)) continue;
    parts.push(`${band}:${u1},${u2}`);
  }

  return parts.join("; ");
}

export function writeOrbitInputs(
  r: OrbitInputRefs,
  orbit: { a: number; e: number; inc: number; period: number },
): void {
  writeNumberInput(r.a, orbit.a);
  writeNumberInput(r.e, orbit.e);
  writeNumberInput(r.inc, orbit.inc * RAD2DEG);
  writeNumberInput(r.period, orbit.period);
}

export function readOrbitInputs(r: OrbitInputRefs, orbit: Record<string, number>): void {
  const aFallback = Number.isFinite(orbit.a) ? orbit.a : ORBIT_A_MIN;
  const eFallback = Number.isFinite(orbit.e) ? orbit.e : 0;
  const incFallbackDeg = Number.isFinite(orbit.inc) ? orbit.inc * RAD2DEG : 0;
  const periodFallback = Number.isFinite(orbit.period) ? orbit.period : ORBIT_PERIOD_MIN;

  orbit.a = sanitizePositive(readNumberInput(r.a, aFallback), ORBIT_A_MIN, ORBIT_A_MAX);
  orbit.e = sanitizeEcc(readNumberInput(r.e, eFallback));

  const incDeg = sanitizeIncDeg(readNumberInput(r.inc, incFallbackDeg));
  orbit.inc = incDeg * DEG2RAD;

  orbit.period = sanitizePositive(
    readNumberInput(r.period, periodFallback),
    ORBIT_PERIOD_MIN,
    ORBIT_PERIOD_MAX,
  );

  orbit.Omega = Number.isFinite(orbit.Omega) ? orbit.Omega : 0;
  orbit.omega = Number.isFinite(orbit.omega) ? orbit.omega : 0;
  orbit.t0 = Number.isFinite(orbit.t0) ? orbit.t0 : 0;
}

export function readOblatenessInput(refs: OblateInputRefs, fallback = 0): number | undefined {
  if (!readCheckbox(refs.enabled)) return undefined;
  const raw = sanitizeFinite(readNumberInput(refs.oblateness, fallback), fallback);
  const f = clamp(raw, 0, OBLA_MAX);
  return Number.isFinite(f) ? f : fallback;
}

export function readRingInputs(
  refs: RingInputRefs,
  defaults: { inner: number; outer: number; incDeg?: number; angleDeg?: number },
):
  | {
      innerRadius: number;
      outerRadius: number;
      inclination: number;
      positionAngle: number;
    }
  | undefined {
  if (!readCheckbox(refs.enabled)) return undefined;

  const inner = sanitizePositive(readNumberInput(refs.inner, defaults.inner), 0, 1e12);
  const outerRaw = sanitizePositive(readNumberInput(refs.outer, defaults.outer), 0, 1e12);
  const outer = Math.max(inner + 1e-6, outerRaw);

  const incDeg = clamp(
    sanitizeFinite(readNumberInput(refs.incDeg, defaults.incDeg ?? 0), defaults.incDeg ?? 0),
    0,
    RING_INC_MAX_DEG,
  );
  const angleDeg = sanitizeFinite(
    readNumberInput(refs.angleDeg, defaults.angleDeg ?? 0),
    defaults.angleDeg ?? 0,
  );

  return {
    innerRadius: inner,
    outerRadius: outer,
    inclination: incDeg * DEG2RAD,
    positionAngle: angleDeg * DEG2RAD,
  };
}

export function setObserverDirFromUI(p: BrowserScenarioDraft, r: UiRefs, mode: UiMode): void {
  if (mode !== "expert") {
    applyObserverModeContract(p, mode);
    return;
  }

  const x = sanitizeFinite(readNumberInput(r.observerX, 0), 0);
  const y = sanitizeFinite(readNumberInput(r.observerY, 0), 0);
  const z = sanitizeFinite(readNumberInput(r.observerZ, 1), 1);

  const raw = { x, y, z };
  const dir = vNormalizeOrZero(raw, 1e-15);
  const safeDir = vIsFinite(dir) && !(dir.x === 0 && dir.y === 0 && dir.z === 0) ? dir : { x: 0, y: 0, z: 1 };

  const obs = p.observer ?? { dir: safeDir };
  p.observer = obs;
  obs.dir = safeDir;
}
