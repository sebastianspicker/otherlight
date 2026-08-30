# Changelog

## Unreleased

### Changed

- Reorganised the repository around `apps/browser`, `apps/apple`, `apps/demo`,
  `services/science`, and `contracts`.
- Defined the Browser as a modular monolith with domain, application,
  infrastructure, presentation, and composition layers.
- Documented the canonical Browser authoring route from `SystemParams` through
  `EducationScenarioV4` to strict V5 science requests.

### Compatibility

- Education V4, science V5, and `workspace-v1` remain serialized contracts.
- The Python science service remains loopback-only and capability-gated.

## Historical releases

Earlier entries described paths and tooling from the pre-application-layout
repository. They are retained in Git history; current commands and locations
are documented in [README.md](README.md) and [docs/architecture.md](docs/architecture.md).
