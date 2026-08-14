/** Numerical primitives for the cubic collision-separation derivative. */
const ROOT_ITERATIONS = 80;
export const ROOT_EPSILON = 64 * Number.EPSILON;

export type Cubic = readonly [number, number, number, number];

export function polynomialValue(coefficients: Cubic, x: number): number {
  return ((coefficients[3] * x + coefficients[2]) * x + coefficients[1]) * x + coefficients[0];
}

export function uniqueUnitRoots(values: number[]): number[] {
  return values
    .filter((value) => Number.isFinite(value) && value > 0 && value < 1)
    .sort((left, right) => left - right)
    .filter((value, index, sorted) => index === 0 || Math.abs(value - sorted[index - 1]) > ROOT_EPSILON);
}

export function quadraticRoots(a: number, b: number, c: number): number[] {
  const scale = Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Number.MIN_VALUE);
  if (Math.abs(a) <= ROOT_EPSILON * scale) {
    return Math.abs(b) <= ROOT_EPSILON * scale ? [] : [-c / b];
  }

  const normalizedA = a / scale;
  const normalizedB = b / scale;
  const normalizedC = c / scale;
  const discriminant = normalizedB * normalizedB - 4 * normalizedA * normalizedC;
  const tolerance =
    ROOT_EPSILON *
    Math.max(normalizedB * normalizedB, Math.abs(4 * normalizedA * normalizedC), Number.MIN_VALUE);
  if (discriminant < -tolerance) return [];
  const rootDiscriminant = Math.sqrt(Math.max(0, discriminant));
  const q = -0.5 * (normalizedB + Math.sign(normalizedB || 1) * rootDiscriminant);
  if (q === 0) return [-normalizedB / (2 * normalizedA)];
  return [q / normalizedA, normalizedC / q];
}

export function bisectRoot(coefficients: Cubic, lower: number, upper: number): number {
  let left = lower;
  let right = upper;
  let leftValue = polynomialValue(coefficients, left);
  for (let iteration = 0; iteration < ROOT_ITERATIONS; iteration++) {
    const middle = 0.5 * (left + right);
    const middleValue = polynomialValue(coefficients, middle);
    if (middleValue === 0) return middle;
    if (Math.sign(leftValue) === Math.sign(middleValue)) {
      left = middle;
      leftValue = middleValue;
    } else {
      right = middle;
    }
  }
  return 0.5 * (left + right);
}
