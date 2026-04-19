# Physics Docs Alignment Audit

This audit records known and suspected alignment gaps between the current code/runtime state and the maintained physics docs.

It is a working document for the refresh implementation. Status values:

- `confirmed`: verified mismatch
- `review`: needs line-by-line confirmation during implementation
- `resolved`: fixed in docs

## Audit Table

| Status   | File                              | Topic                            | Current doc claim                                                                            | Current code/runtime reality                                                                                                     | Planned doc action                                                                 |
| -------- | --------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| resolved | `docs/physics/overview.md`        | additive photometry on active V4 | active V4 strips forward and ring scattering on input                                        | current native V4 emits forward scattering and ring scattering on the active path                                                | runtime note rewritten and bounded interactive-vs-scientific-browser wording added |
| resolved | `docs/physics/overview.md`        | visualization linkage            | current summary under-describes the learner-visible overlay surfaces                         | current shell now exposes landmarks, decomposition, compare insets, chromatic lanes, and scene annotations                       | learner-visible visualization contract note added with rendering cross-link        |
| resolved | `docs/physics/photometry.md`      | composition wording              | composition summary is broadly right but minimal                                             | active UI now teaches additive vs multiplicative contributions through overlay lanes and bounded chromatic broadband comparisons | photometry page expanded and rendering linkage added                               |
| resolved | `docs/physics/photometry.md`      | multi-band wording               | lambda-grid / weighted integration wording may be too broad for the shipped didactic surface | current learner-facing shell shows weighted broadband multi-band overlays, not a full spectroscopic workspace                    | wording tightened to the current broadband didactic lane                           |
| resolved | `docs/physics/relativity.md`      | native vs shared solver wording  | likely mostly current, but needs consistency check against the active native/runtime split   | runtime and docs now distinguish interactive path, shared solver metadata, and scientific-browser constraints                    | proof-read pass completed and learner-visible timing note added                    |
| resolved | `docs/physics/nbody.md`           | teaching visibility              | page describes integrator mechanics but not how dynamics surfaces reach the UI               | current shell exposes timing, barycenter, epoch-ghost, and drift-oriented visuals                                                | learner-visible diagnostics linkage added                                          |
| resolved | `docs/physics/orbits.md`          | runtime terminology              | needs terminology pass for interactive vs scientific-browser wording                         | repo now uses stronger contract language around static orbits in scientific-browser mode                                         | runtime note normalized without changing the orbital math content                  |
| resolved | `docs/physics/full-derivation.md` | summary/cross-links              | likely mathematically fine, but may need updated overview links                              | rendering and didactics contract docs have expanded                                                                              | no wording drift requiring changes was found in this pass                          |

## Review Rules

- Prefer conservative edits: correct stale claims before adding explanatory expansion.
- Keep bounded-model language explicit where the repo already treats the feature as surrogate or educational.
- Distinguish:
  - confirmed active runtime behavior
  - scientific-browser constraints
  - roadmap or unsupported cases
- Do not duplicate large chunks of rendering docs inside physics docs; use cross-links.

## Minimum Required Fixes

The implementation pass must at least:

1. remove the stale forward/ring scattering statement from `docs/physics/overview.md`
2. align photometry wording with the current additive and chromatic teaching surface
3. ensure relativity docs do not imply native-path diagnostics that the runtime does not actually emit
4. add cross-links from physics docs to `docs/rendering/physics-visualization-contract.md` where learner-visible interpretation depends on that contract
