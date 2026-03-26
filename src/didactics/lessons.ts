import type { LessonSpec } from "../core/types";

export const LESSONS: LessonSpec[] = [
  {
    id: "kepler-geometry",
    title: "Kepler Transit Geometry",
    summary:
      "Explore the relationship between orbital inclination, impact parameter b, and transit depth delta = (Rp/R*)^2 for a planet-only system.",
    audience: "bachelor-master-stem",
    steps: [
      {
        id: "kepler-step-1",
        title: "Achieve a near-central transit",
        prompt:
          "Adjust the orbital inclination i so that the projected impact parameter b stays below 0.2. " +
          "Recall that b = (a cos i) / R* for a circular orbit.",
        checks: [{ id: "b-low", label: "b < 0.2", kind: "range", signal: "bPlanet", max: 0.2 }],
      },
      {
        id: "kepler-step-2",
        title: "Verify the geometric depth approximation",
        prompt:
          "For a uniform stellar disk and a near-central transit, the depth should satisfy " +
          "delta_obs ~ (Rp/R*)^2. Check that the observed depth matches this prediction within 20%.",
        checks: [
          {
            id: "depth-approx",
            label: "delta_obs ~ (Rp/R*)^2  (within 20%)",
            kind: "signal-approx",
            signal: "depthObserved",
            referenceSignal: "depthApprox",
            tolerance: 0.2,
          },
        ],
      },
    ],
  },
  {
    id: "limb-darkening-lab",
    title: "Limb Darkening Lab",
    summary:
      "Investigate how quadratic limb darkening I(mu)/I(1) = 1 - u1(1-mu) - u2(1-mu)^2 modifies transit ingress/egress shape and apparent depth.",
    audience: "bachelor-master-stem",
    steps: [
      {
        id: "ld-step-1",
        title: "Apply a strong limb-darkening profile",
        prompt:
          "Increase u1 and u2 to create a pronounced centre-to-limb brightness variation, while keeping a transit visible in the light curve.",
        checks: [
          {
            id: "transit-on",
            label: "transit factor F < 1 (transit in progress)",
            kind: "range",
            signal: "fluxTransitFactor",
            max: 0.9999,
          },
        ],
      },
      {
        id: "ld-step-2",
        title: "Compare observed depth to the geometric prediction",
        prompt:
          "With strong limb darkening, the observed transit depth will deviate from (Rp/R*)^2 because the occulted flux depends on where the planet crosses the disk. " +
          "Note the difference and consider which direction it shifts.",
        checks: [
          {
            id: "depth-nonzero",
            label: "delta_obs > 0 (depth is measurable)",
            kind: "range",
            signal: "depthObserved",
            min: 1e-6,
          },
        ],
      },
    ],
  },
  {
    id: "nbody-perturber-lab",
    title: "N-Body Perturber Lab",
    summary:
      "Detect dynamical signatures of a third body (exomoon or additional planet) through stellar radial velocity (RV) and transit duration variations (TDV).",
    audience: "bachelor-master-stem",
    steps: [
      {
        id: "nbody-step-1",
        title: "Generate a detectable stellar RV signal",
        prompt:
          "Enable N-body dynamics and configure the system so that the reflex motion of the star produces a radial velocity |RV*| > 0.01 m/s. " +
          "Hint: the RV semi-amplitude scales with the companion mass and inversely with orbital period.",
        checks: [
          {
            id: "rv-star",
            label: "|RV*| > 0.01 m/s",
            kind: "range",
            signal: "rvStar",
            min: 0.01,
          },
        ],
      },
      {
        id: "nbody-step-2",
        title: "Observe a transit duration variation",
        prompt:
          "A perturbing body shifts the planet's sky-plane velocity between transits, changing the transit duration. " +
          "Generate a measurable TDV signal (ratio deviating from 1.0).",
        checks: [
          {
            id: "tdv-neq-1",
            label: "TDV ratio != 1.0 (duration varies)",
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
