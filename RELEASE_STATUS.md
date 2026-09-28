# Release status

**No Otherlight revision is release-qualified yet.** The project is pre-release
alpha software; the version strings in the manifests identify build inputs, not
a shipped release.

That is not a claim that nothing works. The individual pieces — the Browser
Education app, the loopback science service, the Apple packages, and the
serialized contracts — each have their own automated checks. What is missing is
a single dated qualification that covers one exact revision across all of them
at once, including the lanes this repository cannot run (signing, notarization,
device testing, and live deployment).

To qualify an intended revision, follow the
[alpha release procedure](docs/alpha-release.md) and replace this page with
dated, revision-specific evidence. Record every omitted or externally controlled
lane explicitly. Do not treat the presence of a workflow, a build artifact, or a
green test run as qualification on its own.
