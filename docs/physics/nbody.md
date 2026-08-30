# N-body scope

Browser domain code includes educational dynamics and diagnostics under
`apps/browser/src/domain/simulation/`. Their availability and evidence level
are listed in [model-registry.json](model-registry.json). They are not an
implicit V5 service implementation.

The V5 service executes a separate bounded Newtonian DOP853 forward path for
the supported two- or three-body radial-velocity request. It validates initial
finite-radius separation, enforces work limits, and fails closed on contact or
indeterminate collision certification. It does not model impact, merger,
softening, tides, rotational multipoles, radiation forces, or relativity.

See [v5-scientific-contract.md](v5-scientific-contract.md) for the execution
contract and `services/science/README.md` for operational limits.
