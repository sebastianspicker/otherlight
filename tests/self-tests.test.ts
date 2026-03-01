/**
 * Runs all module self-tests (run*SelfTests) so they are part of CI and runnable on demand via pnpm test:self.
 */
import { describe, it } from "vitest";
import { runBarycenterSelfTests } from "../src/physics/barycenter";
import { runExomoonTimingSelfTests } from "../src/physics/exomoonTiming";
import { runHillSelfTests } from "../src/physics/hill";
import { runKeplerSelfTests } from "../src/physics/kepler";
import { runVec3SelfTests } from "../src/physics/vec3";
import { runDayNightVisibilitySelfTests } from "../src/photometry/dayNightVisibility";
import { runInstrumentNoiseSelfTests } from "../src/photometry/instrumentNoise";
import { runMutualEventsSelfTests } from "../src/photometry/mutualEvents";
import { runPhaseCurveSelfTests } from "../src/photometry/phaseCurve";
import { runRandomSelfTests } from "../src/photometry/random";
import { runSmearingSelfTests } from "../src/photometry/smearing";
import { runStellarVariabilitySelfTests } from "../src/photometry/stellarVariability";
import { runTransitTransmissionSelfTests } from "../src/photometry/transitTransmission";

describe("module self-tests", () => {
  it("physics: barycenter", () => {
    runBarycenterSelfTests();
  });
  it("physics: exomoon timing", () => {
    runExomoonTimingSelfTests();
  });
  it("physics: hill", () => {
    runHillSelfTests();
  });
  it("physics: kepler", () => {
    runKeplerSelfTests();
  });
  it("physics: vec3", () => {
    runVec3SelfTests();
  });
  it("photometry: day/night visibility", () => {
    runDayNightVisibilitySelfTests();
  });
  it("photometry: instrument noise", () => {
    runInstrumentNoiseSelfTests();
  });
  it("photometry: mutual events", () => {
    runMutualEventsSelfTests();
  });
  it("photometry: phase curve", () => {
    runPhaseCurveSelfTests();
  });
  it("photometry: random", () => {
    runRandomSelfTests();
  });
  it("photometry: smearing", () => {
    runSmearingSelfTests();
  });
  it("photometry: stellar variability", () => {
    runStellarVariabilitySelfTests();
  });
  it("photometry: transit transmission", () => {
    runTransitTransmissionSelfTests();
  });
});
