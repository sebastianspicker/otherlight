# OtherlightCore

A portable macOS 14+ / iOS 17+ Swift package requiring Swift tools 6.3 and the
repository's exact Swift 6.3.3 toolchain. `TransitCore`, `TransitEducation`, and
`TransitVisualization` support the native Education app.

`TransitScienceContracts` exposes the strict Scientific V5 request types,
validation, an exact-key request decoder, and canonical request fingerprinting.
It has no Arrow dependency, so it is safe to share with iOS callers. The sibling
macOS-only `../OtherlightScience` package exports `TransitScience`, which owns
the experimental DOP853 runtime, the result and provenance contracts, and the
pinned Arrow IPC writer. Neither package is an automatic fallback for the Browser
or the backend.

Build this package from the repository root with
`swift build --package-path apps/apple/Packages/OtherlightCore`.
