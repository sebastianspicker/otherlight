import type { PhaseCurveParams, SystemParams } from "../../core/types";
import { isFiniteNonNegative } from "../../core/units";

function usesHigherFidelityAdditiveComposition(params: SystemParams): boolean {
  const fid = params.dynamics?.fidelityProfile;
  return fid === "accurate" || fid === "reference";
}

function hasActiveThermalPhaseChannel(model: PhaseCurveParams | undefined, params: SystemParams): boolean {
  if (!model?.enabled) return false;
  if (Number.isFinite(model.thermAmp) && (model.thermAmp as number) > 0) return true;
  if (Number.isFinite(model.constant) && (model.constant as number) > 0) return true;
  return Boolean(params.star.photometry?.thermalModelAdvanced?.enabled);
}

function hasActiveReflectedPhaseChannel(model: PhaseCurveParams | undefined): boolean {
  return Boolean(model?.enabled && Number.isFinite(model.reflAmp) && (model.reflAmp as number) > 0);
}

function hasActiveHigherFidelityAdditiveChannels(params: SystemParams): boolean {
  const phot = params.star.photometry;
  const rtEmission = phot?.atmosphereRT?.emission;
  return Boolean(
    phot?.phaseCurve?.enabled ||
    phot?.moonPhaseCurve?.enabled ||
    (phot?.forwardScattering?.enabled &&
      Number.isFinite(phot.forwardScattering.amp) &&
      (phot.forwardScattering.amp as number) > 0) ||
    (phot?.ringScattering?.enabled &&
      Number.isFinite(phot.ringScattering.amp) &&
      (phot.ringScattering.amp as number) > 0) ||
    (phot?.atmosphereRT?.enabled &&
      rtEmission?.enabled &&
      Number.isFinite(rtEmission.amp) &&
      (rtEmission.amp as number) > 0),
  );
}

export function assertPhotometryInputs(params: SystemParams): void {
  const phot = params.star.photometry;
  const gridRes = phot?.gridRes;
  if (gridRes !== undefined && (!Number.isFinite(gridRes) || gridRes <= 0)) {
    throw new Error("star.photometry.gridRes must be > 0 and finite if provided.");
  }

  const baselineFlux = phot?.baselineFlux;
  if (baselineFlux !== undefined && !isFiniteNonNegative(baselineFlux)) {
    throw new Error("star.photometry.baselineFlux must be finite and >= 0 if provided.");
  }

  const cadenceSec = phot?.cadenceSec;
  if (cadenceSec !== undefined && !isFiniteNonNegative(cadenceSec)) {
    throw new Error("star.photometry.cadenceSec must be finite and >= 0 if provided.");
  }

  const nSubsamples = phot?.nSubsamples;
  if (nSubsamples !== undefined && (!Number.isFinite(nSubsamples) || nSubsamples < 1)) {
    throw new Error("star.photometry.nSubsamples must be finite and >= 1 if provided.");
  }

  const validateThermalInertia = (
    thermalInertia:
      | {
          enabled?: boolean;
          albedo?: number;
          emissivity?: number;
          thermalTimescaleSec?: number;
          redistribution?: number;
        }
      | undefined,
    name: string,
  ): void => {
    if (!thermalInertia?.enabled) return;
    if (
      thermalInertia.albedo !== undefined &&
      (!Number.isFinite(thermalInertia.albedo) || thermalInertia.albedo < 0 || thermalInertia.albedo > 1)
    ) {
      throw new Error(`${name}.albedo must be in [0,1] if provided.`);
    }
    if (
      thermalInertia.emissivity !== undefined &&
      (!Number.isFinite(thermalInertia.emissivity) ||
        thermalInertia.emissivity < 0 ||
        thermalInertia.emissivity > 1)
    ) {
      throw new Error(`${name}.emissivity must be in [0,1] if provided.`);
    }
    if (
      thermalInertia.thermalTimescaleSec !== undefined &&
      (!Number.isFinite(thermalInertia.thermalTimescaleSec) || thermalInertia.thermalTimescaleSec < 0)
    ) {
      throw new Error(`${name}.thermalTimescaleSec must be >= 0 if provided.`);
    }
    if (
      thermalInertia.redistribution !== undefined &&
      (!Number.isFinite(thermalInertia.redistribution) ||
        thermalInertia.redistribution < 0 ||
        thermalInertia.redistribution > 1)
    ) {
      throw new Error(`${name}.redistribution must be in [0,1] if provided.`);
    }
  };

  validateThermalInertia(phot?.phaseCurve?.thermalInertia, "phaseCurve.thermalInertia");
  validateThermalInertia(phot?.moonPhaseCurve?.thermalInertia, "moonPhaseCurve.thermalInertia");

  const spot = phot?.spotEvolution;
  if (spot?.enabled) {
    const period = spot.rotationPeriodSec ?? Number.NaN;
    if (!Number.isFinite(period) || period <= 0) {
      throw new Error("star.photometry.spotEvolution.rotationPeriodSec must be > 0 when enabled.");
    }
    if (
      spot.coverage !== undefined &&
      (!Number.isFinite(spot.coverage) || spot.coverage < 0 || spot.coverage > 1)
    ) {
      throw new Error("star.photometry.spotEvolution.coverage must be in [0,1] if provided.");
    }
    if (spot.lifetimeSec !== undefined && (!Number.isFinite(spot.lifetimeSec) || spot.lifetimeSec < 0)) {
      throw new Error("star.photometry.spotEvolution.lifetimeSec must be >= 0 if provided.");
    }
    if (spot.driftRateRadPerSec !== undefined && !Number.isFinite(spot.driftRateRadPerSec)) {
      throw new Error("star.photometry.spotEvolution.driftRateRadPerSec must be finite if provided.");
    }
    if (spot.tRef !== undefined && !Number.isFinite(spot.tRef)) {
      throw new Error("star.photometry.spotEvolution.tRef must be finite if provided.");
    }
    if (spot.rotationPhase0 !== undefined && !Number.isFinite(spot.rotationPhase0)) {
      throw new Error("star.photometry.spotEvolution.rotationPhase0 must be finite if provided.");
    }
  }

  const surf = phot?.stellarSurface;
  if (surf?.enabled) {
    if (
      surf.differentialRotationK !== undefined &&
      (!Number.isFinite(surf.differentialRotationK) ||
        surf.differentialRotationK < 0 ||
        surf.differentialRotationK > 1)
    ) {
      throw new Error("star.photometry.stellarSurface.differentialRotationK must be in [0,1] if provided.");
    }
    if (
      surf.rotationPeriodSec !== undefined &&
      (!Number.isFinite(surf.rotationPeriodSec) || surf.rotationPeriodSec <= 0)
    ) {
      throw new Error("star.photometry.stellarSurface.rotationPeriodSec must be finite and > 0 if provided.");
    }
  }

  const bp = phot?.spectralBandpass;
  if (bp?.enabled) {
    const lambda = Array.isArray(bp.lambdaNm) ? bp.lambdaNm : [];
    if (lambda.length > 0 && lambda.some((x) => !Number.isFinite(x) || x <= 0)) {
      throw new Error("star.photometry.spectralBandpass.lambdaNm entries must be finite and > 0.");
    }
    const weights = Array.isArray(bp.weights) ? bp.weights : [];
    if (weights.length > 0 && weights.some((x) => !Number.isFinite(x) || x < 0)) {
      throw new Error("star.photometry.spectralBandpass.weights entries must be finite and >= 0.");
    }
  }

  const rt = phot?.atmosphereRT;
  if (rt?.enabled) {
    if (rt.lambdaRefNm !== undefined && (!Number.isFinite(rt.lambdaRefNm) || rt.lambdaRefNm <= 0)) {
      throw new Error("star.photometry.atmosphereRT.lambdaRefNm must be finite and > 0 if provided.");
    }
    const layers = Array.isArray(rt.layers) ? rt.layers : [];
    for (let i = 0; i < layers.length; i++) {
      const ly = layers[i];
      if (!Number.isFinite(ly.r0) || ly.r0 <= 0) {
        throw new Error(`star.photometry.atmosphereRT.layers[${i}].r0 must be finite and > 0.`);
      }
      if (!Number.isFinite(ly.H) || ly.H <= 0) {
        throw new Error(`star.photometry.atmosphereRT.layers[${i}].H must be finite and > 0.`);
      }
      if (!Number.isFinite(ly.tau0) || ly.tau0 < 0) {
        throw new Error(`star.photometry.atmosphereRT.layers[${i}].tau0 must be finite and >= 0.`);
      }
      if (ly.alpha !== undefined && !Number.isFinite(ly.alpha)) {
        throw new Error(`star.photometry.atmosphereRT.layers[${i}].alpha must be finite if provided.`);
      }
    }
  }

  const thAdv = phot?.thermalModelAdvanced;
  if (thAdv?.enabled) {
    if (
      thAdv.equilibriumScale !== undefined &&
      (!Number.isFinite(thAdv.equilibriumScale) || thAdv.equilibriumScale < 0)
    ) {
      throw new Error(
        "star.photometry.thermalModelAdvanced.equilibriumScale must be finite and >= 0 if provided.",
      );
    }
    if (
      thAdv.redistribution !== undefined &&
      (!Number.isFinite(thAdv.redistribution) || thAdv.redistribution < 0 || thAdv.redistribution > 1)
    ) {
      throw new Error("star.photometry.thermalModelAdvanced.redistribution must be in [0,1] if provided.");
    }
    if (thAdv.tauSec !== undefined && (!Number.isFinite(thAdv.tauSec) || thAdv.tauSec < 0)) {
      throw new Error("star.photometry.thermalModelAdvanced.tauSec must be finite and >= 0 if provided.");
    }
  }

  const ringSc = phot?.ringScattering;
  if (ringSc?.enabled) {
    if (ringSc.amp !== undefined && (!Number.isFinite(ringSc.amp) || ringSc.amp < 0)) {
      throw new Error("star.photometry.ringScattering.amp must be finite and >= 0 if provided.");
    }
    if (ringSc.sigmaPhase !== undefined && (!Number.isFinite(ringSc.sigmaPhase) || ringSc.sigmaPhase <= 0)) {
      throw new Error("star.photometry.ringScattering.sigmaPhase must be finite and > 0 if provided.");
    }
  }

  if (!usesHigherFidelityAdditiveComposition(params)) return;

  if (
    hasActiveHigherFidelityAdditiveChannels(params) &&
    phot?.additiveComposition !== "higher-fidelity-coupled"
  ) {
    throw new Error(
      'higher-fidelity additive composition requires star.photometry.additiveComposition = "higher-fidelity-coupled" when additive body-light channels are active.',
    );
  }

  const rtEmission = phot?.atmosphereRT?.enabled ? phot.atmosphereRT.emission : undefined;
  const rtTarget = phot?.atmosphereRT?.target ?? "planet";
  const emissionActive = Boolean(
    rtEmission?.enabled && Number.isFinite(rtEmission.amp) && (rtEmission.amp as number) > 0,
  );
  if (emissionActive) {
    if (rtTarget === "planet" && hasActiveThermalPhaseChannel(phot?.phaseCurve, params)) {
      throw new Error(
        "higher-fidelity additive composition rejects star.photometry.atmosphereRT.emission together with an active planet thermal phase channel.",
      );
    }
    if (rtTarget === "moon" && hasActiveThermalPhaseChannel(phot?.moonPhaseCurve, params)) {
      throw new Error(
        "higher-fidelity additive composition rejects star.photometry.atmosphereRT.emission together with an active moon thermal phase channel.",
      );
    }
  }

  const forwardSc = phot?.forwardScattering;
  if (
    forwardSc?.enabled &&
    Number.isFinite(forwardSc.amp) &&
    (forwardSc.amp as number) > 0 &&
    hasActiveReflectedPhaseChannel(phot?.phaseCurve)
  ) {
    throw new Error(
      "higher-fidelity additive composition rejects star.photometry.forwardScattering together with an active reflected planet phase channel.",
    );
  }

  if (
    ringSc?.enabled &&
    Number.isFinite(ringSc.amp) &&
    (ringSc.amp as number) > 0 &&
    params.planet.rings &&
    hasActiveReflectedPhaseChannel(phot?.phaseCurve)
  ) {
    throw new Error(
      "higher-fidelity additive composition rejects star.photometry.ringScattering together with an active reflected planet phase channel.",
    );
  }
}
