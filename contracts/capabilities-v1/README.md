# Cross-platform capability registry

The registry is the release truth for website-to-Apple parity. Every capability
has website, macOS, iPhone, and iPad entries. A capability is `available` only
when its platform entry names retained implementation evidence; work in progress stays
`experimental`, and intentionally absent behavior is `unavailable` with a reason.

`available` means an implemented, evidenced code path. An entry with
`availability: capability-gated` additionally requires a successful runtime
capability handshake, and it must stay unavailable in the interface whenever that
service or its required execution dependencies are absent.

The Apple applications share Education sources but use separate targets: the
`Otherlight` iPhone and iPad target and the `OtherlightMac` macOS target. The
mobile deployment baseline is iOS 17. Apple entries remain experimental until the
relevant Xcode 26.6 simulator or device gate has passed, and Scientific rows stay
unavailable unless their bounded local execution contract is independently
evidenced.
