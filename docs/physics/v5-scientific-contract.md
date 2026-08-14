# V5 Local Scientific Contract

V5 is an asynchronous, loopback-only contract. It does not migrate or relabel a
V4 preview configuration. The browser first validates `/v1/capabilities`; a job
can be submitted only when its kind and every requested output are advertised.
An empty capability list is valid and means that execution is unavailable.
This is a validated input/execution contract for bounded scientific
computation. The `runtime.v5.scientific-forward` registry status remains
`bounded-approximation` pending independent verification evidence; neither a
successful run nor `scientificResult: true` claims research validation.

## State, frame, epoch, and units

The canonical state is barycentric Cartesian SI:

- body mass $m_i$ in kg;
- body radius $R_i$ in m;
- position $\mathbf r_i$ in m;
- velocity $\mathbf v_i$ in m s$^{-1}$;
- a numeric `epochJdTdb` (Julian Date on the TDB scale);
- sample offsets in SI seconds relative to that epoch;
- a right-handed inertial frame;
- observer unit vector $\mathbf n$ from the system toward the observer.

The initial Cartesian state is the state at offset zero. No JavaScript
`Date`/UTC parser participates in the epoch contract, and the backend does not
perform UTC-to-TDB or BJD-to-JD conversion. The API requires an explicit
`targetBodyId` for radial velocity. It never
guesses which component is observed. The current backend accepts Cartesian
states only; it does not convert orbital elements or BJD_TDB observations.

The state must satisfy both barycentric invariants

$$
\frac{\sum_i m_i\mathbf r_i}{\sum_i m_i}=\mathbf 0,
\qquad
\frac{\sum_i m_i\mathbf v_i}{\sum_i m_i}=\mathbf 0.
$$

The second expression is total momentum divided by total mass. Validation is
scale-aware: the allowed norms are

$$
\epsilon_r=\max(10^{-3}\ {\rm m},10^{-12}\max_i\lVert\mathbf r_i\rVert),
\quad
\epsilon_v=\max(10^{-9}\ {\rm m\,s^{-1}},10^{-12}\max_i\lVert\mathbf v_i\rVert).
$$

States outside either limit are rejected rather than silently recentered.

## Newtonian forward model

Before finite-radius contact, the centers follow the Newtonian point-mass
equations

$$
\ddot{\mathbf r}_i = G \sum_{j\ne i} m_j
\frac{\mathbf r_j-\mathbf r_i}{\lVert\mathbf r_j-\mathbf r_i\rVert^3}.
$$

The CODATA 2022 central value `G = 6.67430e-11 m^3 kg^-1 s^-2` is used. Initial states are interpreted exactly at
the declared epoch. Requested times may be in any order: the backend integrates
forward and backward from the epoch as needed and restores request order in the
result. Duplicate sample times are rejected.

The browser-facing regular grid is also required to be strictly increasing
after every `startOffsetSec + index * sampleCadenceSec` operation is rounded to
an IEEE-754 double. Both the TypeScript validator and Python adapter perform
the same check. A finite-looking request is rejected if its offset magnitude
is so large that adjacent samples collapse to the same representable value.

Bounded scientific execution requires SciPy DOP853. `positionToleranceM` applies to each
Cartesian position component and `velocityToleranceMps` to each velocity
component; the resulting component-wise absolute-tolerance vector is passed to
`solve_ivp`. `relativeTolerance` must be in $[100\epsilon_{64},1)$; the lower
bound is currently `2.220446049250313e-14`, matching SciPy's double-precision
floor. `maxStepSec` is finite and positive. Requested and effective values are separately recorded
in the run manifest. This alpha rejects sub-floor requests, so the two values
are equal rather than relying on SciPy's implicit clamp. Missing SciPy fails
closed. The exact circular two-body propagator is test-only and always returns
`scientific_result = false`.

Every body requires a finite positive radius. Initially, every pair must satisfy
$\lVert\mathbf r_j-\mathbf r_i\rVert>R_i+R_j$. During DOP853 propagation, each
pair has a terminal event at
$\lVert\mathbf r_j-\mathbf r_i\rVert-(R_i+R_j)=0$. Contact or a close encounter
that reaches this boundary fails the run. The derivative rejects any stage
inside contact. Every accepted DOP853 dense polynomial is also converted to an
outward-rounded interval Bernstein form and recursively subdivided until the
whole step is proven outside contact. The proof is bounded; an unsupported
dense-output representation, exhausted proof budget, or unresolved interval
fails closed instead of sampling or minimizing heuristically. This certifies
the numerical interpolant within its declared tolerances, not an exact physical
trajectory. A collision-domain violation cannot produce a result with
`scientificResult = true`. There is no impact, merger, fragmentation, tide,
softening, rotational multipole, radiation-force, relativity, or light-time
model beyond this finite-radius validity boundary.

## SystemParams adapter

`buildScientificScenarioV5FromSystemParams` is the explicit bridge from a
static education/lab `SystemParams` value. It does not send that value directly
to the backend. It requires positive masses and radii, rejects orbital-element
provider functions and active unsupported dynamics, and checks each static
orbit against Kepler's third law,

$$
P=2\pi\sqrt{\frac{a^3}{G(m_1+m_2)}},
$$

with a relative consistency limit of $10^{-4}$ (allowing rounded catalog input,
not a materially inconsistent mass/period combination). For an accepted orbit,
the Cartesian state is evaluated with the mass-derived period so its position
phase and velocity use the same $G(m_1+m_2)$; the rounded supplied period is not
mixed with a mass-derived velocity. A detached binary is
split about its common barycentre. For a star/planet/moon system, the adapter
first splits the star and planet-moon subsystem about the outer barycentre, then
splits planet and moon about the subsystem barycentre. The same split is applied
to positions and velocities, so both barycentric invariants hold by
construction. The adapter defaults to the explicit reference value `2451545.0`
JD TDB but accepts another numeric epoch; it does not infer an epoch from the
host clock or claim a UTC conversion.

## Radial velocity

With $\mathbf n$ directed toward the observer,

$$
v_r = -\mathbf v_{\rm target}\cdot\mathbf n.
$$

This is the astronomical sign convention: $v_r>0$ means recession. The output
is barycentric and has no instrumental zero point or relativistic correction.

## Photocentre intermediate

For bodies with declared luminosities $L_i$,

$$
\mathbf r_{\rm pc}=\frac{\sum_i L_i\mathbf r_i}{\sum_iL_i},\qquad
\mathbf r_{\rm pc,sky}=\mathbf r_{\rm pc}-(\mathbf r_{\rm pc}\cdot\mathbf n)\mathbf n.
$$

For distance $d$, the small-angle vector is
$\boldsymbol\theta=\mathbf r_{\rm pc,sky}/d$ in radians. The V5 HTTP surface
does not advertise astrometry yet because the browser scenario does not carry a
versioned luminosity/passband model. The programmatic Python core exposes this
intermediate only when luminosities are explicitly supplied.

## Reduced Gaussian likelihood

For residual vector $\mathbf e=\mathbf y-\mathbf M$ and symmetric positive
definite covariance $C$,

$$
\ln\mathcal L=-\tfrac12\left(
\mathbf e^T C^{-1}\mathbf e + \ln|C| + N\ln(2\pi)
\right).
$$

The implementation uses a Cholesky factorization and supports diagonal
uncertainties or a full covariance matrix. Parameter-to-forward-model adapters,
priors, `emcee`, and `dynesty` execution are not implemented, so inference jobs
are not advertised even if a sampler package happens to be installed.

## Provenance and artifacts

A successful browser-facing result requires:

- input SHA-256 and run identifier;
- backend, engine, Python, SciPy, PyArrow, and model versions;
- the exact numeric JD(TDB) epoch and `G` value;
- requested and effective numerical tolerances and maximum step;
- dataset identities, versions, and SHA-256 values when data are used;
- validity-domain statements and warnings;
- random seed and timestamps;
- an immutable Arrow IPC artifact identifier.

The `radial-velocity-v1` artifact is an Arrow IPC file (not an IPC stream). It
uses the `ARROW1` file marker and exactly two non-null `float64` columns in this
order: `time_offset_s` and `radial_velocity_m_s`. The shared machine-readable
shape lives in `contracts/science-v5/contract-cases.json`; both native and
backend writers must round-trip against that shape before publishing bytes.

The HTTP capability is advertised only when both SciPy and PyArrow are present.
The supported HTTP output is exactly `radial-velocity`; photometry, astrometry,
timing, inference, and samplers are not advertised. Request objects and all
nested scenario objects use exact field sets: missing required fields and
unknown fields fail with an invalid-contract response instead of being ignored.
Browser CORS is restricted to the loopback Vite development, preview, and E2E
origins on ports 5173, 4173, and 4174, with only GET, POST, DELETE, `Accept`,
and `Content-Type`.
The default local service has one worker and accepts at most eight outstanding
jobs, including running and queued work. It reserves capacity before parsing or
materializing a sample grid and releases the slot only after the worker future
actually stops; a cooperatively cancelling worker therefore still occupies a
slot while it unwinds. `POST /v1/jobs` above this bound returns HTTP 429 with
`code: "job-capacity-exhausted"` and `Retry-After: 1`. The constructor exposes
both limits for controlled deployments.

Cancellation is cooperative during propagation and serialized with Arrow
publication: either a cancellation becomes terminal before any artifact write,
or success becomes terminal and a later cancellation receives a conflict. The
service retains the newest 128 terminal job statuses/results in memory by
default and evicts older terminal records first; later status/result requests
for an evicted job return 404. Content-addressed Arrow files are a separate
local cache and are not deleted by metadata eviction. A forward request may
materialize at most 100,000 strictly representable samples. Artifact
identifiers are lowercase SHA-256 digests.
This checkout does not install optional packages automatically. See
[`model-registry.json`](./model-registry.json),
[`model-status.md`](./model-status.md), and
[`../references.bib`](../references.bib). The orbital and numerical foundations
follow Murray and Dermott and Hairer, Lubich, and Wanner; IAU nominal constants
are conversion factors, not measured true solar or planetary properties.
