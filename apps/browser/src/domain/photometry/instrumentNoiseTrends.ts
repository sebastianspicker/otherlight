/** Applies deterministic and stochastic trend systematics to flux. */
import { toFiniteNumber } from "../model/units";
import { randomWalkStep } from "./random";
import type { InstrumentNoiseState, InstrumentNoiseSystematicsParams } from "./instrumentNoiseTypes";

type TrendConfig = NonNullable<InstrumentNoiseSystematicsParams["trends"]>;

export function applyDeterministicSystematics(
  state: InstrumentNoiseState,
  trends: InstrumentNoiseSystematicsParams["trends"],
  t: number,
  dt: number,
): number {
  if (!trends?.enabled) return 0;
  return (
    rollTrendFlux(trends.roll, t) +
    temperatureTrendFlux(state, trends.temperature, t, dt) +
    intraPixelTrendFlux(trends.intraPixel, t) +
    driftFamilyTrendFlux(trends.driftFamilies, t)
  );
}

const rollTrendFlux = (roll: TrendConfig["roll"], t: number): number => {
  if (roll?.enabled) {
    const amp = toFiniteNumber(roll.ampFlux, 0);
    const period = toFiniteNumber(roll.periodSec, Number.NaN);
    const phase0 = toFiniteNumber(roll.phase0, 0);
    if (Number.isFinite(period) && period > 0 && Number.isFinite(amp) && amp !== 0)
      return amp * Math.sin((2 * Math.PI * t) / period + phase0);
  }
  return 0;
};

const temperatureTrendFlux = (
  state: InstrumentNoiseState,
  temp: TrendConfig["temperature"],
  t: number,
  dt: number,
): number => {
  if (!temp?.enabled) return 0;
  advanceTemperatureRandomWalk(state, temp, dt);
  const slope = toFiniteNumber(temp.linearSlopeFluxPerSec, 0);
  return (Number.isFinite(slope) && slope !== 0 ? slope * t : 0) + (state.tempRW ?? 0);
};

const advanceTemperatureRandomWalk = (
  state: InstrumentNoiseState,
  temp: TrendConfig["temperature"],
  dt: number,
): void => {
  const sigma = Math.max(0, toFiniteNumber(temp?.randomWalkSigmaFluxPerSqrtSec, 0));
  if (sigma <= 0) return;
  if (dt > 0) {
    const next = randomWalkStep(state.rng, state.tempRW ?? 0, dt, sigma);
    state.tempRW = Number.isFinite(next) ? next : (state.tempRW ?? 0);
  } else if (dt === 0 && state.tempRW === undefined) state.tempRW = 0;
};

const intraPixelTrendFlux = (ip: TrendConfig["intraPixel"], t: number): number => {
  if (!ip?.enabled) return 0;
  const amp = toFiniteNumber(ip.ampFlux, 0);
  const periodX = toFiniteNumber(ip.periodXSec, Number.NaN);
  const periodY = toFiniteNumber(ip.periodYSec, Number.NaN);
  if (
    !(
      Number.isFinite(amp) &&
      amp !== 0 &&
      Number.isFinite(periodX) &&
      periodX > 0 &&
      Number.isFinite(periodY) &&
      periodY > 0
    )
  )
    return 0;
  const x = toFiniteNumber(ip.ax, 0) * Math.sin((2 * Math.PI * t) / periodX);
  const y = toFiniteNumber(ip.ay, 0) * Math.sin((2 * Math.PI * t) / periodY + toFiniteNumber(ip.phaseY, 0));
  return amp * 0.5 * Math.cos(2 * Math.PI * x) * Math.cos(2 * Math.PI * y);
};

const driftFamilyTrendFlux = (drift: TrendConfig["driftFamilies"], t: number): number => {
  if (!drift?.enabled) return 0;
  const amplitudes = Array.isArray(drift.amplitudesFlux) ? drift.amplitudesFlux : [];
  const periods = Array.isArray(drift.periodsSec) ? drift.periodsSec : [];
  const phases = Array.isArray(drift.phasesRad) ? drift.phasesRad : [];
  let fluxAdd = 0;
  for (let i = 0; i < Math.min(amplitudes.length, periods.length); i++) {
    const amplitude = toFiniteNumber(amplitudes[i], 0);
    const period = toFiniteNumber(periods[i], Number.NaN);
    const phase = toFiniteNumber(phases[i], 0);
    fluxAdd +=
      Number.isFinite(amplitude) && amplitude !== 0 && Number.isFinite(period) && period > 0
        ? amplitude * Math.sin((2 * Math.PI * t) / period + phase)
        : 0;
  }
  return fluxAdd;
};
