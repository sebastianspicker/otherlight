# Orbits and coordinates

Browser Education uses the domain orbit utilities in
`apps/browser/src/domain/orbits/` and the V4 simulation model in
`apps/browser/src/domain/simulation/v4/`. They support the interactive
scenarios described by the model registry.

The V5 service accepts barycentric Cartesian SI state, not Browser authoring
parameters or orbital-element providers. The Browser compiler derives this
state from the supported static Education V4 subset and checks period and mass
consistency before submission. Its coordinate, epoch, and observer conventions
are specified in [v5-scientific-contract.md](v5-scientific-contract.md).

Do not infer an ICRS mapping, time-scale conversion, or research-grade
ephemeris from the Browser coordinate utilities. Those claims require an
explicit external contract and evidence.
