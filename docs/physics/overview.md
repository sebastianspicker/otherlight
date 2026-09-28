# Physics overview

Otherlight keeps two model families deliberately apart:

- the Browser and Apple **Education** runtimes, which provide interactive
  teaching previews;
- the optional **V5 service**, which performs bounded Newtonian barycentric
  propagation for radial velocity.

The machine-readable [`model-registry.json`](model-registry.json) is
authoritative for model status, source owners, citations, and capability
evidence. [Model status](model-status.md) is its human-readable companion.
Agreeing with the same implementation at another resolution, or passing
validation, does not promote a model to research-validated.

## Education models

Browser implementations live under `apps/browser/src/domain/`:

- `orbits/` — orbital and coordinate calculations;
- `simulation/` — V4 frames, observables, dynamics, diagnostics, and teaching
  signals;
- `photometry/` — Education light curves, limb darkening, occultation, phase,
  and preview atmosphere behavior.

The Education coordinate helpers do not establish ICRS mapping, research-grade
ephemerides, or time-scale conversion. Education dynamics and photometry stay
within each registry entry's validity domain and evidence level. Light curves,
timing diagnostics, scattering, stellar variability, and relativity-era
previews are never attached to a V5 result as though the service produced them.

The Apple app implements a narrower Education surface through
`OtherlightCore`. Platform availability is tracked separately in the capability
registry.

## V5 model

The Browser compiles only supported, static Education V4 input into barycentric
Cartesian SI state. The service then integrates a two- or three-body DOP853 path
with explicit work limits and a fail-closed finite-radius contact certificate.
It does not model impacts, mergers, softening, tides, rotational multipoles,
radiation forces, relativity, photometry, astrometry, inference, atmospheres, or
time-scale conversion.

The V5 and Education paths share schemas and conversion boundaries, not runtime
results. See the [V5 scientific contract](v5-scientific-contract.md) and the
[service guide](../../services/science/README.md).

## Evidence and references

[`references.bib`](../references.bib) holds the bibliography the registry cites.
Promotion to `research-validated` requires a stated validity domain, analytic
invariants or convergence evidence, and an independent implementation, published
table, reference standard, or observed-system benchmark with a physically
justified tolerance.
