# ADR 0003: Derive V6 transit timing from certified dense trajectories

- Status: accepted design; implementation pending
- Date: 2026-09-04

## Context

Scientific transit timing must not depend on sampled display frames or on the
Education event finders. A coarse sampling cadence can miss contacts, and an
ephemeris fitted from the resulting events would make TTV circular. The V5 Python
and Swift runtimes already produce accepted DOP853 dense segments, but V6 needs
an explicit geometry, event, error, and artifact contract before either
implementation can be promoted.

The definitions of TTV and TDV follow the event-timing and transit-duration basis
in [Kipping 2009a](https://academic.oup.com/mnras/article/392/1/181/1071655) and
[Kipping 2009b](https://academic.oup.com/mnras/article/396/3/1797/1747382).
Otherlight publishes measured event geometry; it does not infer an exomoon, and
it does not claim that its numerical tolerances describe physical-model
uncertainty.

## Decision

For a line-of-sight unit vector `n` directed from the system toward the observer,
an occulter is foreground only when `(rOcculter - rStar) dot n > 0`. Mid-transit
is the certified foreground local minimum of sky-plane separation. First and
fourth contact are roots at `RStar + ROcculter`; second and third contact use
`abs(RStar - ROcculter)` when a finite internal-contact interval exists. The
result distinguishes full transit, grazing transit, total eclipse, and no transit.
Tangent, central equal-radius, multiple-minimum, and otherwise unresolved
topology fails closed instead of being rounded into a class.

Root isolation runs independently over every accepted DOP853 dense segment. It
uses bounded interval subdivision and refinement, deduplicates shared segment
endpoints, and never scans sampled frames. Each requested series provides a fixed
linear ephemeris and reference T14 duration. The service emits one ordered event
row for every half-open ephemeris cell in the requested window, including
explicit no-transit rows, and it does not fit an ephemeris from the generated
events.

The first qualified timing result includes a `transit-events` Arrow artifact and
run-manifest V3. A deterministic tighter integration estimates numerical error:
primary and refinement event times must differ by no more than 0.05 seconds, and
Python and independent Swift results must agree by less than 0.1 seconds within
the declared validity fixtures. These are implementation-error ceilings, not
physical-model uncertainty.

All integration, isolation, refinement, row, wall-time, and cancellation work is
bounded, and cancellation and stale-result checks happen before atomic artifact
and result publication. `science-v5` and `/v1` remain unchanged.

The first timing slice fixes these ceilings: three bodies, two timing series,
10,000 ephemeris rows, 500,000 accepted dense segments, 8,000,000 right-hand-side
evaluations, 60 seconds wall time, 2,000,000 isolation nodes per run, 4,096 nodes
per segment and series, isolation depth 64, 64 refinement iterations per root, a
0.001-second root bracket, one artifact, and a 64-MiB artifact response. The
verification integration divides relative, position, and velocity tolerances by
ten and halves the maximum step.

## Consequences

- The timing request has no display-frame cadence and cannot silently reuse an
  Education solver.
- Radius ratios at or above one get explicit eclipse semantics instead of an
  implicit planet-only assumption.
- Near-tangent geometry and exhausted root budgets surface as visible domain
  failures.
- Python owns the canonical fixtures and Swift independently evaluates the same
  inputs. TypeScript validates and presents the shared contract but is not a third
  dynamics implementation.
- The timing capability stays unavailable until strict contracts, both numerical
  implementations, Arrow output, cancellation, provenance, and cross-language
  fixtures pass together.
