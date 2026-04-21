import type { SystemDynamicsParams } from "../core/types";
import { AU_M, EARTH_MASS_KG, G_SI, JUPITER_MASS_KG, SOLAR_MASS_KG } from "../core/units";
import {
  enableAccuratePhysics,
  ensureMoon,
  makeEdgeCasePreset,
  setPlanetImpactParameter,
  stripToTransitCase,
  withoutPatches,
} from "./presetEdgeCaseUtils";

export const DYNAMICS_EDGE_CASE_PRESETS = [
  makeEdgeCasePreset(
    "ec-dynamics-reflex-wobble",
    "Edge Case: stellar reflex wobble",
    "High-mass planet transit used to emphasize the star's reflex motion in the observables layer.",
    (p) => {
      stripToTransitCase(p);
      setPlanetImpactParameter(p, 0.06);
      p.planet.m = 1.1e29;
    },
  ),
  makeEdgeCasePreset(
    "ec-dynamics-perturber-ttv",
    "Edge Case: perturber-driven TTV",
    "N-body transit case with an external perturber so the learner can compare timing changes not caused by a moon.",
    (p) => {
      stripToTransitCase(p, { keepMoon: true });
      withoutPatches(p);
      const dyn = (p.dynamics ??= {} as SystemDynamicsParams);
      dyn.nbodyPlanetMoon = {
        enabled: true,
        muStar: G_SI * SOLAR_MASS_KG,
        muPlanet: G_SI * JUPITER_MASS_KG,
        muMoon: G_SI * EARTH_MASS_KG,
        dtMax: 60,
        softening: 0,
        perturbers: [
          {
            enabled: true,
            mu: G_SI * (0.08 * JUPITER_MASS_KG),
            orbit: {
              a: 0.11 * AU_M,
              e: 0.08,
              inc: 0.08,
              Omega: 0.2,
              omega: 0.1,
              period: 2 * Math.PI * Math.sqrt((0.11 * AU_M) ** 3 / (G_SI * SOLAR_MASS_KG)),
              t0: 0,
            },
          },
        ],
      };
    },
  ),
  makeEdgeCasePreset(
    "ec-dynamics-mutual-inclination",
    "Edge Case: mutual inclination",
    "Planet transit with a moon whose orbit is tilted enough that the moon exists dynamically but does not reliably cross the star.",
    (p) => {
      stripToTransitCase(p, { keepMoon: true });
      setPlanetImpactParameter(p, 0.08);
      const moon = ensureMoon(p);
      if ("inc" in moon.orbitAroundPlanet) moon.orbitAroundPlanet.inc = 0.6;
      if ("a" in moon.orbitAroundPlanet) moon.orbitAroundPlanet.a = 3.8e8;
    },
  ),
  makeEdgeCasePreset(
    "ec-dynamics-nodal-precession",
    "Edge Case: nodal precession",
    "Planet-moon transit with explicit nodal and inclination drift so repeated epochs change geometry without resizing any body.",
    (p) => {
      stripToTransitCase(p, { keepMoon: true });
      setPlanetImpactParameter(p, 0.08);
      const dyn = (p.dynamics ??= {});
      dyn.exomoonTimingShape = {
        enabled: true,
        tRef: 0,
        velDt: 2,
        moonOmegaDot: 8e-6,
        moonIncDot: 3e-6,
        moonOmegaSmallDot: 0,
        moonImpactYDot: 0,
      };
    },
  ),
  makeEdgeCasePreset(
    "ec-dynamics-hill-edge",
    "Edge Case: Hill-edge moon",
    "Planet-moon geometry placed close to the Hill-stability boundary so the fit looks plausible but is dynamically fragile.",
    (p) => {
      stripToTransitCase(p, { keepMoon: true });
      setPlanetImpactParameter(p, 0.08);
      const moon = ensureMoon(p);
      if ("a" in moon.orbitAroundPlanet) moon.orbitAroundPlanet.a = 4.1e8;
    },
  ),
  makeEdgeCasePreset(
    "ec-dynamics-close-encounter",
    "Edge Case: close encounter warning",
    "N-body planet-moon setup with an intentionally aggressive close-encounter threshold so the learner sees that a numerically running fit can still be dynamically suspect.",
    (p) => {
      stripToTransitCase(p, { keepMoon: true });
      setPlanetImpactParameter(p, 0.08);
      const dyn = (p.dynamics ??= {} as SystemDynamicsParams);
      dyn.nbodyPlanetMoon = {
        enabled: true,
        muStar: G_SI * SOLAR_MASS_KG,
        muPlanet: G_SI * JUPITER_MASS_KG,
        muMoon: G_SI * EARTH_MASS_KG,
        dtMax: 60,
        softening: 0,
      };
      dyn.collisionPolicy = { enabled: true, minSeparation: 1e11, onCloseEncounter: "warn" };
    },
  ),
  makeEdgeCasePreset(
    "ec-relativity-ltte",
    "Edge Case: LTTE timing",
    "Transit timing case with light-travel time enabled and other relativity channels disabled.",
    (p) => {
      stripToTransitCase(p);
      setPlanetImpactParameter(p, 0.05);
      const dyn = (p.dynamics ??= {});
      dyn.relativityLevel = "toy";
      dyn.relativity = {
        enabled: true,
        ltte: true,
        shapiro: false,
        grPrecession: false,
        c: 299_792_458,
        ltteIters: 6,
        ltteTolSec: 1e-9,
      };
    },
  ),
  makeEdgeCasePreset(
    "ec-relativity-shapiro",
    "Edge Case: Shapiro timing",
    "Transit timing case with bounded enhanced Shapiro delay enabled so learners can inspect a small but real extra delay term.",
    (p) => {
      stripToTransitCase(p);
      setPlanetImpactParameter(p, 0.05);
      const dyn = (p.dynamics ??= {});
      dyn.relativityLevel = "enhanced";
      dyn.relativity = {
        enabled: true,
        ltte: true,
        shapiro: true,
        grPrecession: false,
        c: 299_792_458,
        ltteIters: 6,
        ltteTolSec: 1e-9,
        shapiroMinImpact: p.star.r,
      };
    },
  ),
  makeEdgeCasePreset(
    "ec-relativity-einstein-delay",
    "Edge Case: Einstein-delay surrogate",
    "Transit timing case with a bounded weak-field Einstein-delay surrogate added as an explicit didactic timing scale.",
    (p) => {
      stripToTransitCase(p);
      setPlanetImpactParameter(p, 0.05);
      const dyn = (p.dynamics ??= {});
      dyn.relativityLevel = "enhanced";
      dyn.relativity = {
        enabled: true,
        ltte: false,
        shapiro: false,
        grPrecession: false,
        einsteinDelay: true,
        lightBending: false,
        c: 299_792_458,
        timingRefSec: 0,
      };
    },
  ),
  makeEdgeCasePreset(
    "ec-relativity-clock-mismatch",
    "Edge Case: clock-frame mismatch",
    "Transit timing case with an explicit observer-side clock offset so pseudo-TTV can be compared against true dynamical timing changes.",
    (p) => {
      stripToTransitCase(p);
      setPlanetImpactParameter(p, 0.05);
      p.observer = {
        ...(p.observer ?? { dir: { x: 0, y: 0, z: 1 } }),
        timekeeping: { enabled: true, barycentricOffsetSec: 180 },
      };
    },
  ),
  makeEdgeCasePreset(
    "ec-relativity-light-bending-scale",
    "Edge Case: light-bending scale",
    "Transit timing case that reports the weak-field light-bending angular scale without claiming a full ray-traced transit geometry.",
    (p) => {
      stripToTransitCase(p);
      setPlanetImpactParameter(p, 0.05);
      const dyn = (p.dynamics ??= {});
      dyn.relativityLevel = "enhanced";
      dyn.relativity = {
        enabled: true,
        ltte: false,
        shapiro: false,
        grPrecession: false,
        einsteinDelay: false,
        lightBending: true,
        c: 299_792_458,
        shapiroMinImpact: p.star.r,
      };
    },
  ),
  makeEdgeCasePreset(
    "ec-relativity-gr-precession",
    "Edge Case: GR precession",
    "Transit timing case with GR apsidal precession enabled and timing corrections otherwise kept simple.",
    (p) => {
      stripToTransitCase(p);
      setPlanetImpactParameter(p, 0.05);
      const dyn = (p.dynamics ??= {});
      dyn.relativityLevel = "toy";
      dyn.relativity = {
        enabled: true,
        ltte: false,
        shapiro: false,
        grPrecession: true,
        c: 299_792_458,
        planetPrecessionPerOrbit: 2.5e-4,
      };
    },
  ),
  makeEdgeCasePreset(
    "ec-stellar-granulation",
    "Edge Case: stellar granulation",
    "Planet-only transit with bounded stellar-surface granulation enabled so low-level stellar flicker can be compared against detector noise.",
    (p) => {
      stripToTransitCase(p);
      setPlanetImpactParameter(p, 0.04);
      const ph = p.star.photometry;
      if (!ph) return;
      ph.stellarSurface = {
        enabled: true,
        granulationSigma: 6e-4,
        granulationTimescaleSec: 300,
        activityCycleAmp: 0.001,
        activityCyclePeriodSec: 45_000,
      };
      enableAccuratePhysics(p, { stellarSurface: true });
    },
  ),
];
