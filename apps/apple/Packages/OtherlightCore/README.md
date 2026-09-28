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

The package tests read the checked-in TypeScript oracle at
`contracts/education-v4/fixtures/scoped-parity.json` and compare all 12 scoped
rows — orbit geometry, five flux components, interactive transit timing, event
metadata, and warnings — using the manifest's absolute and relative tolerances.
Contract tests also validate strict Scientific V5 request decoding and stable
canonical fingerprints. The package never regenerates the TypeScript oracle.
