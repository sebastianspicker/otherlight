# V5 local scientific contract

V5 is an asynchronous, loopback-only contract for bounded Newtonian
radial-velocity jobs, and it is independent of the Browser Education runtime. A
successful V5 job means the strict request and execution contract held; it does
not promote the output beyond the evidence status recorded in the model
registry.

## Authoring route

The Browser never sends its authoring state (`BrowserScenarioDraft`) to the
service. It converts first:

```text
BrowserScenarioDraft -> EducationScenarioV4 -> strict V5 ForwardRunRequest
```

`apps/browser/src/application/browserScenarioAdapter.ts` creates the canonical
V4 scenario.
`apps/browser/src/infrastructure/science/educationScenarioCompiler.ts` compiles
only the supported static V4 subset, rejecting unsupported dynamics, dynamic
orbit providers, and any field without a V5 representation. It checks the
supported orbital period and mass closure before building the barycentric state.

## State and units

V5 uses barycentric Cartesian SI state: kilograms, metres, metres per second, and
a numeric `epochJdTdb`. Sample offsets are seconds from that epoch. The observer
line-of-sight vector is unit length, and radial velocity is positive for
recession. The service does not convert UTC, BJD, or orbital elements.

Requests use strict fields and must satisfy finite positive body mass and radius,
barycentric position and velocity residuals, non-overlapping initial bodies,
finite tolerances, and a representable increasing sample grid.

## Execution and output

`services/science/` exposes `/v1` capability and job routes on loopback, and it
advertises forward execution only when the required dependencies are present.
The bounded execution path uses DOP853 and limits bodies, samples, work, and wall
time. It fails closed on invalid state, contact, unavailable execution, or an
indeterminate collision certificate.

The only advertised successful observable is radial velocity. Completed jobs
return structured result and provenance data and can reference a content-addressed
Arrow IPC artifact. Photometry, astrometry, inference, relativity, time-scale
conversion, and remote execution are unavailable.

The GitHub Pages Browser displays a deterministic projection of
`contracts/science-v5/contract-cases.json#validForwardResult`. That checked-in
fixture is a contract example only: it performs no execution, exposes no Arrow
artifact, and does not change when the visible form inputs change.

The exact machine-readable contracts are indexed in the
[contract README](../../contracts/science-v5/README.md). The
[service README](../../services/science/README.md) defines the current
operational limits and HTTP errors.
