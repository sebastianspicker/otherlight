# OtherlightScience

`OtherlightScience` is an experimental macOS 14+ Swift package. Its
`TransitScience` library validates strict V5 contracts, executes the bounded
native DOP853 path, produces result and provenance structures, and writes Arrow
IPC artifacts through a pinned Arrow Swift dependency.

It requires Swift tools 6.3 and the repository's exact Swift 6.3.3 toolchain. Run
from the repository root:

```bash
source scripts/select-swift-toolchain.sh
swift test --package-path apps/apple/Packages/OtherlightScience
```

If the host cannot start the SwiftPM process sandbox, retry just the test command
with `--disable-sandbox`.

This package is not linked into the mobile `Otherlight` SwiftUI app. It is linked
only into `OtherlightMac`, where the Scientific profile exposes a session-only
native execution path and separate, explicit Arrow and manifest exports. It
depends on `TransitScienceContracts` from the sibling `OtherlightCore` package,
while the machine-readable request and run-manifest formats stay owned by
[`contracts/science-v5`](../../../../contracts/science-v5/README.md).

SwiftPM products under `.build/` and `.swiftpm/` are generated and should not be
committed.

The public `NativeDOP853ForwardPropagator.propagate` path retains full sampled
states for compatibility and parity tests. Native artifact publication shares its
integration, cancellation, work-budget, and collision-certification path but
retains only time/RV arrays and work metadata, so Arrow columns and run manifests
are unchanged.
