import type { LessonEventTarget, LessonPhaseSpec, LessonWorkedExample } from "../core/types";

function fallbackText(value: string | undefined, defaultValue: string): string {
  return value ?? defaultValue;
}

export function workedExamplePhase(
  id: string,
  prompt: string,
  workedExample: LessonWorkedExample,
): LessonPhaseSpec {
  return {
    id,
    type: "worked-example",
    title: workedExample.title,
    prompt,
    responseMode: "none",
    workedExample,
  };
}

export function predictPhase(args: {
  id: string;
  title: string;
  prompt: string;
  primaryLabel: string;
  secondaryLabel?: string;
  primaryPlaceholder?: string;
  secondaryPlaceholder?: string;
}): LessonPhaseSpec {
  return {
    ...args,
    type: "predict",
    responseMode: "claim-reason",
  };
}

export function observePhase(args: {
  id: string;
  title: string;
  prompt: string;
  eventTarget?: LessonEventTarget;
  checklist: string[];
  primaryLabel?: string;
  primaryPlaceholder?: string;
}): LessonPhaseSpec {
  return {
    ...args,
    type: "observe",
    responseMode: "observation-notes",
    primaryLabel: args.primaryLabel ?? "Observation notes",
    primaryPlaceholder:
      args.primaryPlaceholder ??
      "Describe what overlaps, which body is in front, and what changed on the curve.",
  };
}

export function explainPhase(args: {
  id: string;
  title: string;
  prompt: string;
  primaryLabel?: string;
  secondaryLabel?: string;
  primaryPlaceholder?: string;
  secondaryPlaceholder?: string;
}): LessonPhaseSpec {
  return {
    ...args,
    type: "explain",
    responseMode: "explanation-notes",
    primaryLabel: fallbackText(args.primaryLabel, "Your explanation"),
    secondaryLabel: fallbackText(args.secondaryLabel, "What rule did you learn?"),
    primaryPlaceholder: fallbackText(
      args.primaryPlaceholder,
      "Explain how the geometry and flux evidence fit together.",
    ),
    secondaryPlaceholder: fallbackText(
      args.secondaryPlaceholder,
      "State the general rule you would apply to a similar system next time.",
    ),
  };
}

export function comparePhase(args: {
  id: string;
  title: string;
  prompt: string;
  primaryLabel?: string;
  primaryPlaceholder?: string;
}): LessonPhaseSpec {
  return {
    ...args,
    type: "compare",
    responseMode: "comparison-notes",
    primaryLabel: args.primaryLabel ?? "Comparison note",
    primaryPlaceholder:
      args.primaryPlaceholder ?? "State which feature changed between A and B and which control caused it.",
  };
}

export function reportPhase(args: {
  id: string;
  title: string;
  prompt: string;
  primaryLabel?: string;
  primaryPlaceholder?: string;
}): LessonPhaseSpec {
  return {
    ...args,
    type: "report",
    responseMode: "reflection-notes",
    primaryLabel: args.primaryLabel ?? "Conclusion",
    primaryPlaceholder:
      args.primaryPlaceholder ??
      "Summarize your final claim, the evidence that supports it, and what changed in your model.",
  };
}

export const TRANSIT_GEOMETRY_EXAMPLE: LessonWorkedExample = {
  title: "Worked example: central transit",
  body: "In a near-central transit the planet chord crosses close to the stellar center. That keeps the impact parameter low and makes the dip depth line up closely with (Rp/R*)^2 on the physical curve.",
  takeaway: "First match the geometry, then compare the depth formula.",
};

export const EXOMOON_EXAMPLE: LessonWorkedExample = {
  title: "Worked example: moon lead/lag",
  body: "A moon can only create its own visible feature when it also crosses the stellar disk and when its transit center is offset enough from the planet’s center to avoid being buried inside the main dip.",
  takeaway: "Moon visibility needs both front-of-star geometry and temporal separation.",
};

export const CURVE_READING_EXAMPLE: LessonWorkedExample = {
  title: "Worked example: reading a transit curve",
  body: "Ingress is where the flux first drops, mid-transit is where overlap is strongest, and egress is where the curve climbs back out. The canvas and the light curve must tell the same story from the same observer direction.",
  takeaway: "Named light-curve landmarks help you read geometry instead of guessing.",
};

export const BINARY_EXAMPLE: LessonWorkedExample = {
  title: "Worked example: black-box binary inference",
  body: "In a detached binary, both stars emit light. The observed eclipse depth depends on both the eclipse chord and the luminosity contrast between the stars, so the deeper eclipse is not just a matter of one body being larger.",
  takeaway: "Binary eclipses are combined-light inference problems, not single-body transits.",
};
