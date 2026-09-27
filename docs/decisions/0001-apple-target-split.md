# ADR 0001: Split portable Education and macOS scientific application targets

- Status: accepted; implemented
- Date: 2026-09-04

## Context

Before this split, the universal `Otherlight` target shared Education across
macOS, iPhone, and iPad. The experimental `OtherlightScience` package was
macOS-only and depended on Arrow. Linking it into the universal target would have
made mobile dependency resolution and archive boundaries harder to prove, and
would have blurred the product distinction between portable Education and local
scientific execution.

## Decision

Keep `Otherlight` as the iPhone and iPad Education application. Add a separate
`OtherlightMac` target and scheme that shares the Education sources and product
identity but alone links `TransitScience` and Arrow. Keep the request, result,
manifest, and executor interfaces in portable packages, and place the concrete
scientific executor and session-only run coordination in the macOS host.

Scientific execution must be cancellable and off the main actor. A result may be
published only when the request, trajectory, Arrow artifact, manifest, and
SHA-256 values all agree; cancelled or superseded work cannot update visible
state.

## Consequences

- Mobile archives get an explicit Education-only dependency graph.
- macOS packaging, CI, privacy, entitlement, and export checks use
  `OtherlightMac`; mobile checks keep using `Otherlight`.
- Education stays available on macOS through the shared sources, but scientific
  controls exist only in the macOS target.
- The split adds Xcode target and scheme maintenance, and dependency inspection
  is a required gate because shared sources alone cannot prove Arrow isolation.
- Release qualification still requires the platform, archive, signing, and live
  accessibility gates described in the release documentation.
