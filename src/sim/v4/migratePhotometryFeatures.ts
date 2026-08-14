/** Reports enabled V4 photometry features unsupported by compatibility runtimes. */
import type { SimulationConfigV4 } from "./types";

type AtmosphereRTConfig = NonNullable<NonNullable<SimulationConfigV4["photometry"]>["atmosphereRT"]>;

function enabledAtmosphereRT(config: SimulationConfigV4): AtmosphereRTConfig | undefined {
  const rt = config.photometry?.atmosphereRT;
  return rt?.enabled ? rt : undefined;
}

function collectUnsupportedRTFeaturePaths(rt: AtmosphereRTConfig): string[] {
  const issues: string[] = [];
  if (Array.isArray(rt.temperatureProfileK) && rt.temperatureProfileK.length > 0) {
    issues.push("photometry.atmosphereRT.temperatureProfileK");
  }
  if (rt.scattering?.enabled) issues.push("photometry.atmosphereRT.scattering");
  if (rt.emission?.enabled) issues.push("photometry.atmosphereRT.emission");
  return issues;
}

function collectUnsupportedRTLayerPaths(rt: AtmosphereRTConfig): string[] {
  const issues: string[] = [];
  for (const [index, layer] of (rt.layers ?? []).entries()) {
    if (layer.temperatureK !== undefined) {
      issues.push(`photometry.atmosphereRT.layers[${index}].temperatureK`);
    }
  }
  return issues;
}

export function collectUnsupportedPhotometryFeaturesV4(config: SimulationConfigV4): string[] {
  const rt = enabledAtmosphereRT(config);
  if (!rt) return [];
  return [...collectUnsupportedRTFeaturePaths(rt), ...collectUnsupportedRTLayerPaths(rt)];
}
