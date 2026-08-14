/** Characterizes the public lesson interpretation contract at every decision boundary. */

import { describe, expect, it } from "vitest";

import type { DidacticInterpretation } from "../../src/core/types";
import { buildInterpretation, evaluateChecks } from "../../src/didactics/engineSupport";
import type { NumericSignals } from "../../src/didactics/engineNumericSignals";
import { getLessonById } from "../../src/didactics/lessons";

const BASE_SIGNALS: NumericSignals = {
  bPlanet: 0.1,
  bMoon: 0.1,
  fluxTransitFactor: 0.99,
  tdvRatio: 1,
  rvStar: 0,
  rvPlanet: 0,
  depthApprox: 0.1,
  depthObserved: 0.1,
  combinedFluxDrop: 0.02,
  moonLeadLagSec: 700,
};

const INTERPRETATIONS = {
  noPlanetTransit: {
    headline: "There is no front-of-star planet transit yet.",
    observation: "The current observer/chord geometry does not produce a valid planet impact parameter.",
    nextAction: "Raise the planet inclination until the planet crosses the visible stellar disk.",
  },
  centralTransit: {
    headline: "You reached a near-central transit.",
    observation: "The planet impact parameter is 0.20, so the chord stays close to the stellar center.",
    nextAction: "Keep this geometry and now compare the physical depth against (Rp/R*)^2.",
  },
  grazingTransit: {
    headline: "The transit is still too grazing.",
    observation: "The current impact parameter is 0.21, so the chord is still too far from the center.",
    nextAction: "Increase planet inclination to push the chord inward.",
  },
  matchingDepth: {
    headline: "Geometry and depth now tell the same story.",
    observation: "The physical depth 0.200 is close to the geometric estimate 0.000.",
    nextAction:
      "Use ingress and egress to explain why central transits best match the simple radius-ratio formula.",
  },
  mismatchedDepth: {
    headline: "The depth still disagrees with the simple radius-ratio estimate.",
    observation: "Observed depth 0.301 differs from the geometric estimate 0.100.",
    nextAction:
      "Inspect whether the chord is grazing or whether limb darkening is changing the occulted brightness.",
  },
  visibleMoon: {
    headline: "The moon is now in front-of-star geometry.",
    observation: "The moon impact parameter is 1.10, so the moon can contribute its own transit feature.",
    nextAction: "Now separate the moon timing from the planet timing so the moon feature becomes readable.",
  },
  missingMoon: {
    headline: "The moon is still missing the stellar disk.",
    observation: "Its projected chord is still too tilted or too far from the visible stellar disk.",
    nextAction: "Reduce moon inclination until the moon also crosses in front of the star.",
  },
  separatedMoon: {
    headline: "The moon signal is no longer buried inside the planet dip.",
    observation: "The moon transit center is offset from the planet by 600 s.",
    nextAction:
      "Compare moon-on versus moon-off to identify which shoulder or dip belongs to the moon alone.",
  },
  separatedLeadingMoon: {
    headline: "The moon signal is no longer buried inside the planet dip.",
    observation: "The moon transit center is offset from the planet by -600 s.",
    nextAction:
      "Compare moon-on versus moon-off to identify which shoulder or dip belongs to the moon alone.",
  },
  overlappingMoon: {
    headline: "The moon signal still overlaps too strongly with the planet transit.",
    observation: "The moon and planet are still transiting too close together in time to separate cleanly.",
    nextAction: "Increase moon spacing so the moon leads or trails the planet more clearly.",
  },
  readableEclipse: {
    headline: "The combined light curve now shows a readable stellar eclipse.",
    observation: "The total binary flux drops by 1.0% from the combined baseline.",
    nextAction:
      "Use the eclipse chord and the reveal-sky step to decide whether the event is central or grazing.",
  },
  shallowEclipse: {
    headline: "The binary eclipse is still too shallow to teach from cleanly.",
    observation:
      "The combined stellar flux has not dropped enough yet to make the eclipse morphology obvious.",
    nextAction: "Stay near eclipse and compare the black-box curve to the revealed geometry.",
  },
  centralBinaryChord: {
    headline: "The binary eclipse chord is close to central.",
    observation: "The projected impact parameter proxy is 0.40, so the occulting chord is no longer grazing.",
    nextAction:
      "Relate the deeper eclipse to both geometry and the luminosity contrast between the two stars.",
  },
  grazingBinaryChord: {
    headline: "The binary eclipse is still geometrically grazing.",
    observation: "The projected chord remains too far from the center (b ≈ 0.41).",
    nextAction:
      "Use the reveal-sky step to compare your flux-only hypothesis against the actual eclipse chord.",
  },
  invalidBinaryChord: {
    headline: "The binary eclipse is still geometrically grazing.",
    observation: "The projected chord remains too far from the center (b ≈ n/a).",
    nextAction:
      "Use the reveal-sky step to compare your flux-only hypothesis against the actual eclipse chord.",
  },
  readableCurve: {
    headline: "The curve landmarks are readable.",
    observation:
      "The physical curve contains a visible drop and recovery, so ingress, mid-transit, and egress can be named from evidence rather than guesswork.",
    nextAction:
      "Use the event jumps and describe exactly what changes first on the curve and on the stellar disk at each landmark.",
  },
  unreadableCurve: {
    headline: "There is no readable transit landmark yet.",
    observation:
      "Without an active physical transit, the light curve does not yet support landmark-based reading.",
    nextAction: "Restore a visible transit before trying to identify ingress, mid-transit, and egress.",
  },
  visibleLimbTransit: {
    headline: "You have a visible transit to study limb darkening.",
    observation:
      "The lesson surface is ready: ingress, egress, and depth can now be compared against the geometric prediction.",
    nextAction:
      "Switch to expert mode and increase u1/u2, then compare ingress/egress shape rather than only depth.",
  },
  invisibleLimbTransit: {
    headline: "There is no useful transit shape to study yet.",
    observation:
      "Without an active transit, limb-darkening changes will not produce a readable ingress/egress signature.",
    nextAction: "Restore a visible transit first, then strengthen limb darkening in expert mode.",
  },
  measurableDynamics: {
    headline: "The system now shows a measurable dynamical signal.",
    observation: "|RV*| is 0.010 m/s and TDV ratio is 1.2345.",
    nextAction:
      "Compare this setup against an unperturbed one to separate timing effects from pure photometry.",
  },
  measurableDynamicsWithoutFiniteTdv: {
    headline: "The system now shows a measurable dynamical signal.",
    observation: "|RV*| is 0.010 m/s and TDV ratio is n/a.",
    nextAction:
      "Compare this setup against an unperturbed one to separate timing effects from pure photometry.",
  },
  subtleDynamics: {
    headline: "The perturbation is still too subtle.",
    observation:
      "The current setup has not yet produced a strong enough RV or timing deviation to teach from clearly.",
    nextAction: "Increase perturber mass or shorten the relevant orbital timescale in expert mode.",
  },
} satisfies Record<string, DidacticInterpretation>;

function interpretation(
  lessonId: string,
  stepIndex: number,
  overrides: Partial<NumericSignals>,
): DidacticInterpretation {
  const lesson = getLessonById(lessonId);
  if (!lesson) throw new Error(`Missing lesson ${lessonId}`);
  const signals = { ...BASE_SIGNALS, ...overrides };
  return buildInterpretation(lesson, evaluateChecks(lesson, stepIndex, signals), signals);
}

describe("buildInterpretation", () => {
  it.each([
    ["NaN impact parameter at step one", 0, Number.NaN],
    ["infinite impact parameter at step one", 0, Number.POSITIVE_INFINITY],
    ["NaN impact parameter at step two", 1, Number.NaN],
    ["infinite impact parameter at step two", 1, Number.POSITIVE_INFINITY],
  ])("keeps invalid planet geometry ahead of Kepler step handling: %s", (_label, stepIndex, bPlanet) => {
    expect(interpretation("kepler-geometry", stepIndex, { bPlanet })).toEqual(
      INTERPRETATIONS.noPlanetTransit,
    );
  });

  it.each([
    ["near-central geometry at the inclusive b = 0.2 threshold", 0.2, INTERPRETATIONS.centralTransit],
    ["grazing geometry immediately above b = 0.2", 0.21, INTERPRETATIONS.grazingTransit],
  ])("characterizes Kepler step one: %s", (_label, bPlanet, expected) => {
    expect(interpretation("kepler-geometry", 0, { bPlanet })).toEqual(expected);
  });

  it.each([
    ["depths exactly 0.2 apart", { depthApprox: 0, depthObserved: 0.2 }, INTERPRETATIONS.matchingDepth],
    ["depths more than 0.2 apart", { depthObserved: 0.301 }, INTERPRETATIONS.mismatchedDepth],
  ])("characterizes Kepler step two: %s", (_label, overrides, expected) => {
    expect(interpretation("kepler-geometry", 1, overrides)).toEqual(expected);
  });

  it.each([
    ["inclusive bMoon = 1.1", 1.1, INTERPRETATIONS.visibleMoon],
    ["bMoon above 1.1", 1.11, INTERPRETATIONS.missingMoon],
    ["NaN bMoon", Number.NaN, INTERPRETATIONS.missingMoon],
    ["infinite bMoon", Number.POSITIVE_INFINITY, INTERPRETATIONS.missingMoon],
  ])("characterizes exomoon geometry: %s", (_label, bMoon, expected) => {
    expect(interpretation("exomoon-transit-lab", 0, { bMoon })).toEqual(expected);
  });

  it.each([
    ["positive 600 s separation", 600, INTERPRETATIONS.separatedMoon],
    ["negative 600 s separation", -600, INTERPRETATIONS.separatedLeadingMoon],
    ["separation below 600 s", 599, INTERPRETATIONS.overlappingMoon],
    ["NaN separation", Number.NaN, INTERPRETATIONS.overlappingMoon],
    ["infinite separation", Number.POSITIVE_INFINITY, INTERPRETATIONS.overlappingMoon],
  ])("characterizes exomoon timing: %s", (_label, moonLeadLagSec, expected) => {
    expect(interpretation("exomoon-transit-lab", 1, { moonLeadLagSec })).toEqual(expected);
  });

  it.each([
    ["inclusive 1% combined drop", 0.01, INTERPRETATIONS.readableEclipse],
    ["drop below 1%", 0.009, INTERPRETATIONS.shallowEclipse],
  ])("characterizes binary step one: %s", (_label, combinedFluxDrop, expected) => {
    expect(interpretation("binary-eclipse-lab", 0, { combinedFluxDrop })).toEqual(expected);
  });

  it.each([
    ["inclusive b = 0.4", 0.4, INTERPRETATIONS.centralBinaryChord],
    ["b above 0.4", 0.41, INTERPRETATIONS.grazingBinaryChord],
    ["NaN b", Number.NaN, INTERPRETATIONS.invalidBinaryChord],
    ["infinite b", Number.POSITIVE_INFINITY, INTERPRETATIONS.invalidBinaryChord],
  ])("characterizes binary step two: %s", (_label, bPlanet, expected) => {
    expect(interpretation("binary-eclipse-lab", 1, { bPlanet })).toEqual(expected);
  });

  it.each([
    ["curve-reading-lab", 0.001, INTERPRETATIONS.readableCurve],
    ["curve-reading-lab", 0, INTERPRETATIONS.unreadableCurve],
    ["limb-darkening-lab", 0.001, INTERPRETATIONS.visibleLimbTransit],
    ["limb-darkening-lab", 0, INTERPRETATIONS.invisibleLimbTransit],
  ])("characterizes %s depth boundary at %d", (lessonId, depthObserved, expected) => {
    expect(interpretation(lessonId, 0, { depthObserved })).toEqual(expected);
  });

  it.each([
    ["RV exactly 0.01 m/s", 0.01, 1.2345, INTERPRETATIONS.subtleDynamics],
    ["RV above 0.01 m/s", 0.0101, 1.2345, INTERPRETATIONS.measurableDynamics],
    ["non-finite TDV", 0.0101, Number.NaN, INTERPRETATIONS.measurableDynamicsWithoutFiniteTdv],
  ])("characterizes default dynamical interpretation: %s", (_label, rvStar, tdvRatio, expected) => {
    expect(interpretation("nbody-perturber-lab", 0, { rvStar, tdvRatio })).toEqual(expected);
  });
});
