# V5 local scientific contract

V5 is an asynchronous, loopback-only contract for bounded Newtonian
radial-velocity jobs. It is independent from the Browser Education runtime.
A successful V5 job shows that the strict request and execution contract passed;
it does not promote an output beyond the evidence status in the model registry.

## Authoring route

The Browser does not send `BrowserScenarioDraft` to the service. It follows:

```text
BrowserScenarioDraft -> EducationScenarioV4 -> strict V5 ForwardRunRequest
```

`apps/browser/src/application/browserScenarioAdapter.ts` creates the canonical
V4 scenario. `apps/browser/src/infrastructure/science/educationScenarioCompiler.ts`
compiles only supported static V4 input. It rejects unsupported dynamics,
dynamic orbit providers, and fields without a V5 representation.

## State and units

V5 uses barycentric Cartesian SI state: kilograms, metres, metres per second,
and a numeric `epochJdTdb`. Sample offsets are seconds from that epoch. The
observer line-of-sight vector is unit length and radial velocity is positive
for recession. The service does not convert UTC, BJD, or orbital elements.

The request has strict fields and must satisfy finite positive body
mass/radius, barycentric position and velocity residuals, non-overlapping
initial bodies, finite tolerances, and a representable increasing sample grid.

## Execution and output

`services/science/` exposes `/v1` capability and job routes on loopback. It
advertises forward execution only when required dependencies are present.
The bounded execution path uses DOP853, limits bodies, samples, work, and wall
time, and fails closed on invalid state, contact, unavailable execution, or an
indeterminate collision certificate.

The only advertised successful observable is radial velocity. Completed jobs
return structured result and provenance data and can reference a
content-addressed Arrow IPC artifact. Photometry, astrometry, inference,
relativity, time-scale conversion, and remote execution are unavailable.

The exact machine-readable contracts are in `contracts/science-v5/`. The
service README defines the current operational limits and HTTP errors.
