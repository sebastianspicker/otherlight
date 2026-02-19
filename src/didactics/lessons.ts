import type { LessonSpec } from "../core/types";

export const LESSONS: LessonSpec[] = [
  {
    id: "kepler-geometry",
    title: "Kepler Transit Geometry",
    summary: "Connect impact parameter and transit depth in a planet-only baseline.",
    audience: "bachelor-master-stem",
    steps: [
      {
        id: "kepler-step-1",
        title: "Near-central transit",
        prompt: "Tune inclination so the impact parameter remains below 0.2.",
        checks: [{ id: "b-low", label: "b_planet < 0.2", kind: "range", signal: "bPlanet", max: 0.2 }],
      },
      {
        id: "kepler-step-2",
        title: "Depth consistency",
        prompt: "Verify observed depth matches (Rp/Rs)^2 within 20%.",
        checks: [
          {
            id: "depth-approx",
            label: "depth_obs ≈ depth_theory",
            kind: "approx",
            signal: "depthObserved",
            target: 0,
            tolerance: 0.2,
          },
        ],
      },
    ],
  },
  {
    id: "limb-darkening-lab",
    title: "Limb Darkening Lab",
    summary: "Observe how limb-darkening modifies ingress/egress and apparent depth.",
    audience: "bachelor-master-stem",
    steps: [
      {
        id: "ld-step-1",
        title: "Enable strong LD profile",
        prompt: "Use a stronger LD profile and keep transit visible.",
        checks: [
          {
            id: "transit-on",
            label: "transit factor below 1",
            kind: "range",
            signal: "fluxTransitFactor",
            max: 0.9999,
          },
        ],
      },
      {
        id: "ld-step-2",
        title: "Compare depth against geometric approximation",
        prompt: "Observe deviation between geometric and LD-weighted depth.",
        checks: [
          { id: "depth-nonzero", label: "depth_obs > 0", kind: "range", signal: "depthObserved", min: 1e-6 },
        ],
      },
    ],
  },
  {
    id: "nbody-perturber-lab",
    title: "N-Body Perturber Lab",
    summary: "Track dynamical signatures in radial velocity and timing diagnostics.",
    audience: "bachelor-master-stem",
    steps: [
      {
        id: "nbody-step-1",
        title: "Activate dynamical signal",
        prompt: "Configure N-body so star RV becomes measurably non-zero.",
        checks: [
          { id: "rv-star", label: "|RV_star| > 0.01 m/s", kind: "range", signal: "rvStar", min: 0.01 },
        ],
      },
      {
        id: "nbody-step-2",
        title: "Observe timing distortion",
        prompt: "Generate a measurable TDV-like distortion.",
        checks: [
          {
            id: "tdv-neq-1",
            label: "tdvRatio differs from 1",
            kind: "distance",
            signal: "tdvRatio",
            target: 1,
            minAbsDelta: 1e-4,
          },
        ],
      },
    ],
  },
];

export const DEFAULT_LESSON_ID = LESSONS[0].id;

export function getLessonById(id: string | undefined): LessonSpec {
  if (!id) return LESSONS[0];
  return LESSONS.find((l) => l.id === id) ?? LESSONS[0];
}
