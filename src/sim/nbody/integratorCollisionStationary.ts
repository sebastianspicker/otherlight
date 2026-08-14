/** Finds stationary points for the cubic derivative of swept separation. */
import {
  bisectRoot,
  polynomialValue,
  quadraticRoots,
  ROOT_EPSILON,
  uniqueUnitRoots,
  type Cubic,
} from "./integratorCollisionPolynomial";

/** Returns every real stationary point of a quadratic-vector squared norm on [0, 1]. */
export function stationaryPoints(coefficients: Cubic): number[] {
  if (!coefficients.every(Number.isFinite)) return [];
  const derivativeCritical = uniqueUnitRoots(
    quadraticRoots(3 * coefficients[3], 2 * coefficients[2], coefficients[1]),
  );
  const breakpoints = [0, ...derivativeCritical, 1];
  const roots: number[] = [];

  for (const point of breakpoints) {
    const value = polynomialValue(coefficients, point);
    const scale = Math.max(...coefficients.map(Math.abs), Number.MIN_VALUE);
    if (Math.abs(value) <= ROOT_EPSILON * scale) roots.push(point);
  }
  for (let index = 0; index + 1 < breakpoints.length; index++) {
    const lower = breakpoints[index];
    const upper = breakpoints[index + 1];
    const lowerValue = polynomialValue(coefficients, lower);
    const upperValue = polynomialValue(coefficients, upper);
    if (lowerValue === 0 || upperValue === 0 || Math.sign(lowerValue) === Math.sign(upperValue)) continue;
    roots.push(bisectRoot(coefficients, lower, upper));
  }
  return uniqueUnitRoots(roots);
}
