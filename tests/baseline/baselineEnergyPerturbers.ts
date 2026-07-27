/** Covers baseline energy perturbers data and helpers used by physics baseline regression checks. */

import type { SystemParams } from "../../src/core/types";
import { G_SI } from "../../src/core/units";

type NBodyConfig = NonNullable<NonNullable<SystemParams["dynamics"]>["nbodyPlanetMoon"]>;
type PerturberConfig = NonNullable<NonNullable<NBodyConfig["perturbers"]>[number]>;

function finitePositiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function perturberMu(perturber: PerturberConfig): number | undefined {
  const directMu = finitePositiveNumber(perturber?.mu);
  const mass = finitePositiveNumber(perturber?.m);
  return directMu ?? (mass === undefined ? undefined : G_SI * mass);
}

export function enabledPerturberMus(nbody: NBodyConfig | undefined): number[] {
  const perturbers = Array.isArray(nbody?.perturbers) ? nbody.perturbers : [];
  const mus: number[] = [];
  for (const p of perturbers) {
    if (!p || p.enabled === false) continue;
    const mu = perturberMu(p);
    if (mu !== undefined) mus.push(mu);
  }
  return mus;
}
