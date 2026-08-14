# Verification status

Evidence date: 2026-08-14

This document records checks run against a dirty local working tree. The
results do not describe an immutable release candidate. Nothing was staged,
committed, tagged, published, or deployed.

## Current candidate evidence

The current TypeScript gates passed lint, formatting, Knip, clone detection,
TypeScript 6 and 7 checks, 1,119 tests, production build, served-bundle smoke,
coverage thresholds, and the scientific, literature, calibration, didactics,
performance, physics, and migration suites. The static demo also built as a
self-contained Pages artifact with its checked fixture captures and manifest.
No Pages deployment workflow exists.

The production dependency audit initially reproduced one high-severity Nano
ID advisory. The workspace override and lockfile now resolve Nano ID 3.3.18,
and the pinned audit reports no known vulnerabilities. This was a transitive
PostCSS/Vite path; no direct application import was found.

The following lanes remain environment- or owner-blocked in this checkout:

- all 57 Playwright cases stop at browser launch because the pinned browser
  executables are absent;
- Python lint, type, test, wheel, and live-service proof cannot run because the
  required backend environment and development tools are absent; source
  byte-compilation passes;
- native build, test, and archive proof requires Xcode 26.6 and Swift 6.3.3,
  while this host exposes Command Line Tools and Swift 6.3.2;
- the historical gitleaks result identifies the non-secret
  `shapiroConvergence` interface field and still needs an explicit scanner
  baseline or configuration decision;
- remote CI, browser interaction, signing, notarization, device/simulator, and
  deployment evidence remain external.

## Historical evidence (2026-08-12)

The detailed snapshot below predates the current candidate. Its browser,
Python, native, Codacy, and archive results remain historical evidence and
must not be treated as rerun proof for this working tree.

## Browser and TypeScript

| Check                                | Result                                      |
| ------------------------------------ | ------------------------------------------- |
| Public-surface hygiene               | Passed, 802 candidate files                 |
| Source documentation hygiene         | Passed, 670 authored executable files       |
| Native Swift documentation hygiene   | Passed, 46 Swift source files               |
| ESLint and repository Prettier check | Passed                                      |
| TypeScript 7 typecheck               | Passed                                      |
| TypeScript 6 compatibility typecheck | Passed                                      |
| Knip                                 | Passed                                      |
| jscpd                                | Passed, zero clones at the configured limit |
| Vitest                               | Passed, 182 files and 1,119 tests           |
| V8 coverage                          | Passed all configured global thresholds     |
| Vite production build                | Passed, 327 modules                         |
| Playwright E2E                       | Passed, 57 tests                            |
| Served-bundle smoke                  | Passed                                      |
| Screenshot gallery and README checks | Passed, 7 tests                             |
| Moderate dependency audit            | Passed, no known vulnerabilities            |
| Configured Codacy analysis           | Passed, zero findings                       |

Coverage was 83.01% statements, 70.30% branches, 90.09% functions, and
86.52% lines. Playwright covered Chromium, Firefox, WebKit, tablet landscape,
mobile smoke, and 200 percent zoom. No horizontal-overflow assertion failed.

The final configured Codacy run reported zero findings. In particular, Lizard
reported zero issues across 640 analyzed files and Semgrep reported zero
issues. A focused rerun also completed the two Semgrep filesystem rules that
had timed out during the whole-tree pass. The unchanged configured Trivy pass
also completed with zero findings and zero errors across 803 repository paths
when ignored SwiftPM build caches were temporarily outside the scan root; both
caches were restored afterward. With those caches present, Trivy recursively
entered upstream checkout examples and Maven Central rate-limited their Java
metadata. A separate offline authored-tree scan likewise reported zero
vulnerabilities and zero secret matches. Jackson, Checkov, and Spectral also
reported file-read diagnostics for the pre-existing deleted
`.impeccable/design.json`; the file is absent from this working tree, not a
malformed release input.

The project-specific gates also passed:

| Gate                   | Result                   |
| ---------------------- | ------------------------ |
| Scientific contracts   | 4 files, 50 tests passed |
| Literature benchmarks  | 1 file, 10 tests passed  |
| Scientific calibration | 4 files, 25 tests passed |
| Didactics acceptance   | 2 files, 2 tests passed  |
| Performance smoke      | 1 file, 2 tests passed   |
| Physics regression     | 3 files, 11 tests passed |
| Migration regression   | 2 files, 9 tests passed  |

The timing gates were rerun alone after unrelated shared-host workloads
subsided. Their existing budgets and assertions were not changed.

## Python backend

Python 3.14.6 is installed in the ignored `science_backend/.venv` environment
with the development extra.

| Check                                  | Result                              |
| -------------------------------------- | ----------------------------------- |
| Ruff formatting and lint               | Passed, 25 files                    |
| Pyright                                | Passed, zero errors and warnings    |
| pytest                                 | Passed, 74 tests                    |
| Wheel build and clean base import      | Passed, `0.2.0-alpha.1`             |
| Clean service-only installation        | Passed, no NumPy or SciPy installed |
| Full loopback HTTP and Arrow execution | Passed                              |

The base wheel now imports without scientific extras. A clean wheel installed
with only the `service` extra creates the app, keeps NumPy and the DOP853 audit
module unloaded, and advertises no supported forward jobs. With the complete
extras installed, the loopback service advertised the forward capability,
accepted a V5 job, completed it, returned its result, and served the
content-addressed Arrow artifact.

A browser-driven live capture independently exercised capabilities, CORS
preflight, job submission, polling, result retrieval, and Arrow download
against the real loopback service.

## Native Apple

The pinned local toolchain reports Xcode 26.6 build 17F113 and Swift 6.3.3.

| Check                              | Result                                                |
| ---------------------------------- | ----------------------------------------------------- |
| Swift formatting                   | Passed                                                |
| `OtherlightCore` package           | Passed, 17 tests                                      |
| `OtherlightScience` package        | Passed, 16 tests                                      |
| macOS application units            | Passed, 23 tests                                      |
| iPhone iOS 26.5 scheme             | Passed, 23 unit and 7 UI tests                        |
| iPad iOS 26.5 scheme               | Passed, 23 unit and 7 UI tests                        |
| Unsigned generic iOS archive       | Passed metadata, privacy, and mobile-dependency gates |
| Unsigned Universal 2 macOS archive | Passed, `x86_64 arm64`                                |

Debug builds resolve only the active `arm64` architecture on this host, so the
application and local Swift packages consume matching module slices. Release
settings remain separate: generic iOS is `arm64`, while the macOS archive is
Universal 2.

The macOS UI-only runner built successfully but stalled before executing a
test and was cancelled after one isolated retry. Its result bundle contains no
assertion or source failure. The same seven UI journeys executed successfully
on both iPhone and iPad.

## Screenshot evidence

The checked-in browser gallery contains ten frames and a manifest. Its
completed Scientific frame is a deterministic contract replay, not a live
backend result.

A separate temporary ten-frame gallery was captured and validated with the
real backend during this verification. It was deliberately not copied over the
maintained deterministic gallery. Native UI test attachments were also
produced for iPhone and iPad; no maintained native gallery is checked in.

## Distribution status

- `pnpm build` writes the static browser bundle to `dist/`.
- No workflow uploads or deploys the browser bundle.
- The Python service is limited to loopback operation.
- The manual macOS DMG workflow produces an unsigned temporary artifact and
  does not upload it.
- No current check establishes a signed, notarized, uploaded, or published
  release.

## Limitations

- Browser Education calculations are teaching previews, not calibrated
  research results.
- The shipped V4 browser runtime does not execute the maintained compatibility
  N-body or relativity solvers.
- The V5 service implements bounded Newtonian radial-velocity propagation only.
  It does not provide photometry, inference, calibrated time conversion,
  impact or merger dynamics, tides, relativity, or remote execution.
- Scientific jobs require SciPy and PyArrow. The service advertises no forward
  capability when required imports are unavailable.
- The native Apple application has a smaller parameter and model surface than
  the browser application.
- No maintained native Apple screenshot gallery is checked in.
- No web deployment, backend hosting, TestFlight upload, App Store submission,
  or signed macOS release is automated by this repository.
- Public interfaces and schemas are alpha-level and may change.
