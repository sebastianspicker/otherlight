export type ScientificCalibrationSurface =
  | "relativity-timing"
  | "detached-binary-photometry"
  | "bounded-atmosphere-rt"
  | "additive-photometry"
  | "exact-event-timing";

export type ScientificCalibrationReferenceKind =
  | "canonical-astronomy-target"
  | "analytic-reference"
  | "independent-geometry-reference"
  | "high-resolution-numeric-reference"
  | "direct-model-reference"
  | "local-perf-budget";

export type ScientificCalibrationEntry = {
  id: string;
  surface: ScientificCalibrationSurface;
  claim: string;
  referenceKind: ScientificCalibrationReferenceKind;
  provenance: string;
  referenceAnchor?: string;
  tolerance: string;
  owner: string;
  releaseEvidence: boolean;
};

export const ACTIVE_SCIENTIFIC_CALIBRATION_SURFACES: ScientificCalibrationSurface[] = [
  "relativity-timing",
  "detached-binary-photometry",
  "bounded-atmosphere-rt",
  "additive-photometry",
  "exact-event-timing",
] as const;

export const SCIENTIFIC_CALIBRATION_CATALOG: ScientificCalibrationEntry[] = [
  {
    id: "relativity-mercury-precession",
    surface: "relativity-timing",
    claim: "Mercury-like weak-field GR apsidal precession stays near the canonical 43 arcsec/century scale.",
    referenceKind: "canonical-astronomy-target",
    provenance:
      "Canonical Mercury anomalous perihelion-precession target at approximately 43 arcsec/century.",
    referenceAnchor:
      "Canonical anomalous Mercury perihelion-precession target: approximately 42.98 arcsec/century.",
    tolerance: "40 to 46 arcsec/century with approximate 43 center check.",
    owner: "tests/benchmarks/literature-benchmarks.test.ts",
    releaseEvidence: true,
  },
  {
    id: "relativity-ltte-constant-velocity",
    surface: "relativity-timing",
    claim: "The LTTE solver stays on the closed-form constant-velocity retarded-time solution.",
    referenceKind: "analytic-reference",
    provenance:
      "Closed-form constant-velocity retarded-time solution used as an independent analytic reference.",
    referenceAnchor:
      "Closed-form constant-velocity retarded-time root for the benchmark geometry, evaluated independently of the runtime solver.",
    tolerance: "Residual <= 1e-12 seconds and tEmit close to analytic reference at 10 decimals.",
    owner: "tests/benchmarks/literature-benchmarks.test.ts",
    releaseEvidence: true,
  },
  {
    id: "relativity-ltte-one-au",
    surface: "relativity-timing",
    claim: "One-AU light time stays near the canonical approximately 499 second reference.",
    referenceKind: "canonical-astronomy-target",
    provenance: "Named astronomy-style one-AU light-time target near 499.00478 seconds.",
    referenceAnchor: "1 AU / c reference delay: 499.00478 seconds.",
    tolerance: "498 to 500 seconds with close-to reference at 3 decimals.",
    owner: "tests/benchmarks/literature-benchmarks.test.ts",
    releaseEvidence: true,
  },
  {
    id: "relativity-shapiro-one-au",
    surface: "relativity-timing",
    claim:
      "Solar-limb one-AU relative Shapiro scale stays near the expected approximately 113 microsecond band.",
    referenceKind: "canonical-astronomy-target",
    provenance: "Named relative Shapiro-delay benchmark near 112.643 microseconds.",
    referenceAnchor:
      "Solar-limb relative Shapiro-delay reference for the one-AU benchmark geometry: approximately 112.643 microseconds.",
    tolerance: "100 to 130 microseconds with close-to reference at 8 decimals in seconds.",
    owner: "tests/benchmarks/literature-benchmarks.test.ts",
    releaseEvidence: true,
  },
  {
    id: "relativity-shapiro-five-au",
    surface: "relativity-timing",
    claim:
      "Solar-limb five-AU relative Shapiro scale stays near the expected approximately 144 microsecond band.",
    referenceKind: "canonical-astronomy-target",
    provenance: "Distance-scaled relative Shapiro-delay benchmark near 144.352 microseconds.",
    referenceAnchor:
      "Solar-limb relative Shapiro-delay reference for the five-AU benchmark geometry: approximately 144.352 microseconds.",
    tolerance: "135 to 150 microseconds with close-to reference at 8 decimals in seconds.",
    owner: "tests/benchmarks/literature-benchmarks.test.ts",
    releaseEvidence: true,
  },
  {
    id: "relativity-shapiro-multibody",
    surface: "relativity-timing",
    claim:
      "Static enhanced multi-body LTTE plus Shapiro stays on the direct summed analytic reference delay.",
    referenceKind: "analytic-reference",
    provenance:
      "Direct summed point-mass LTTE plus Shapiro analytic reference for a static multi-body geometry.",
    referenceAnchor:
      "Direct summed point-mass LTTE plus Shapiro delay over the static benchmark-body geometry, independent of the runtime solver.",
    tolerance: "Residual <= 1e-12 seconds and tEmit close to analytic reference at 10 decimals.",
    owner: "tests/benchmarks/literature-benchmarks.test.ts",
    releaseEvidence: true,
  },
  {
    id: "binary-photometry-analytic-overlap",
    surface: "detached-binary-photometry",
    claim:
      "Selected scientific-browser detached-binary uniform-disk eclipse depths stay on an independent analytic overlap reference.",
    referenceKind: "analytic-reference",
    provenance:
      "Exact circle-overlap area plus passband-resolved luminosity weights on runtime sky geometry.",
    referenceAnchor:
      "Independent uniform-disk eclipse-depth reference from exact circle-overlap area plus passband-resolved luminosity weights on the sampled benchmark geometry.",
    tolerance:
      "Analytic overlap comparison uses direct uniform-disk reference on selected primary and symmetric eclipse cases.",
    owner: "tests/benchmarks/literature-benchmarks.test.ts",
    releaseEvidence: true,
  },
  {
    id: "atmosphere-rt-annulus-reference",
    surface: "bounded-atmosphere-rt",
    claim:
      "Bounded circle-only scientific-browser atmosphereRT stays close to a higher-resolution annulus reference.",
    referenceKind: "high-resolution-numeric-reference",
    provenance:
      "Independent high-resolution annulus integration around the effective circle-only atmosphere opacity helper.",
    referenceAnchor:
      "Independent gray annulus-integration reference with 4096 radial samples around the effective circle-only atmosphere opacity helper.",
    tolerance: "max(5e-4, 3 percent of reference opacity) on selected gray atmosphereRT cases.",
    owner: "tests/benchmarks/literature-benchmarks.test.ts",
    releaseEvidence: true,
  },
  {
    id: "additive-direct-model-reference",
    surface: "additive-photometry",
    claim:
      "The scientific-browser declared additive composition path stays on the direct photometry-model reference.",
    referenceKind: "direct-model-reference",
    provenance:
      "Direct evaluation of planetPhase, moonPhase, forwardScattering, and ringScattering on native snapshot geometry.",
    referenceAnchor:
      "Direct photometry-model evaluation of planetPhase, moonPhase, forwardScattering, and ringScattering on the sampled native snapshot geometry.",
    tolerance:
      "All covered additive channels close to direct model reference at 12 decimals on sampled configuration.",
    owner: "tests/benchmarks/literature-benchmarks.test.ts",
    releaseEvidence: true,
  },
  {
    id: "timing-eccentric-contact-reference",
    surface: "exact-event-timing",
    claim:
      "Higher-fidelity eccentric planet contact timing stays on an independent sky-geometry contact reference.",
    referenceKind: "independent-geometry-reference",
    provenance:
      "Independent contact root search against projected sky geometry, separate from the runtime event solver.",
    referenceAnchor:
      "Independent eccentric-planet projected-sky contact root search over the benchmark orbit, separate from the runtime solver.",
    tolerance: "Ingress, egress, duration, and center close to reference at 3 decimals.",
    owner: "tests/sim/transit-timing-tracker.test.ts",
    releaseEvidence: true,
  },
  {
    id: "timing-moon-contact-reference",
    surface: "exact-event-timing",
    claim: "Higher-fidelity moon contact timing stays on an independent sky-geometry contact reference.",
    referenceKind: "independent-geometry-reference",
    provenance:
      "Independent moon contact root search against projected sky geometry, separate from the runtime event solver.",
    referenceAnchor:
      "Independent moon projected-sky contact root search over the benchmark transit geometry, separate from the runtime solver.",
    tolerance: "Ingress, egress, duration, and center close to reference at 3 decimals.",
    owner: "tests/sim/transit-timing-tracker.test.ts",
    releaseEvidence: true,
  },
  {
    id: "timing-grazing-contact-reference",
    surface: "exact-event-timing",
    claim:
      "Higher-fidelity grazing planet contact timing stays on an independent near-tangent contact reference.",
    referenceKind: "independent-geometry-reference",
    provenance: "Independent projected-sky contact reference on a near-tangent planet event.",
    referenceAnchor:
      "Independent near-tangent projected-sky contact root search on the grazing benchmark event, separate from the runtime solver.",
    tolerance: "Ingress, egress, duration, and center close to reference at 3 decimals.",
    owner: "tests/sim/transit-timing-tracker.test.ts",
    releaseEvidence: true,
  },
  {
    id: "timing-accelerated-moon-reference",
    surface: "exact-event-timing",
    claim:
      "Higher-fidelity accelerated moon contact timing stays on an independent timing-shape-evolved contact reference.",
    referenceKind: "independent-geometry-reference",
    provenance:
      "Independent moon contact reference while moonOmegaDot evolves the event geometry during the transit.",
    referenceAnchor:
      "Independent moon projected-sky contact root search while moonOmegaDot evolves the benchmark event geometry during transit.",
    tolerance: "Ingress, egress, duration, and center close to reference at 3 decimals.",
    owner: "tests/sim/transit-timing-tracker.test.ts",
    releaseEvidence: true,
  },
  {
    id: "timing-accelerated-browser-budget",
    surface: "exact-event-timing",
    claim:
      "The accelerated scientific exact-contact moon path stays within a bounded local browser-feasible step budget.",
    referenceKind: "local-perf-budget",
    provenance:
      "Perf scenario keeps the expensive exact-contact path near an accelerated moon transit window instead of the cheap non-transit branch.",
    tolerance: "Average step time below 50 ms across a 240-step accelerated moon transit window.",
    owner: "tests/perf/perf-scenarios.test.ts",
    releaseEvidence: false,
  },
] as const;
