# Cross-platform capability registry

The registry is the release truth for website-to-Apple parity. Every capability
has website, macOS, iPhone, and iPad entries. A capability is `available` only
when its platform entry names automated evidence. Work in progress remains
`experimental`; intentionally absent behavior is `unavailable` with a reason.

`available` describes an implemented, evidenced code path. A platform entry
with `availability: capability-gated` additionally requires a successful
runtime capability handshake; it must remain unavailable in the interface when
that service or its required execution dependencies are absent.

The Apple application has one shared SwiftUI target for macOS, iPhone, and iPad.
Its deployment baseline is iOS 17 for iPhone and iPad. Apple entries remain
experimental until the relevant Xcode 26.6 simulator/device gate has passed;
Scientific rows remain unavailable unless their bounded local execution contract
is independently evidenced.
