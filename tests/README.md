# Test suites

Tests stay beside the language and runner that owns them. TypeScript tests use
the root `tests/` tree, Python tests stay with the backend package, SwiftPM
tests use each package’s `Tests/` tree, and Xcode application tests use the
native application test targets.

## TypeScript and browser tests

Vitest discovers `tests/**/*.test.ts`. The default environment is Node, while
`tests/ui/**/*.test.ts` uses jsdom.

| Directory               | Files | Scope                                            |
| ----------------------- | ----: | ------------------------------------------------ |
| `tests/app/`            |    27 | Browser orchestration and runtime integration    |
| `tests/baseline/`       |     2 | Numerical baseline and cross-platform parity     |
| `tests/benchmarks/`     |     3 | Literature and scientific calibration            |
| `tests/contracts/`      |     1 | Capability registry                              |
| `tests/core/`           |     5 | Shared types, units, and utilities               |
| `tests/didactics/`      |     8 | Guided Labs and reports                          |
| `tests/docs/`           |     9 | Repository, documentation, and release contracts |
| `tests/error-recovery/` |     1 | Failure recovery                                 |
| `tests/perf/`           |     2 | Dedicated performance and calibration checks     |
| `tests/photometry/`     |    22 | Photometry models                                |
| `tests/physics/`        |    12 | Dynamics and physics models                      |
| `tests/property/`       |     1 | Numerical property checks                        |
| `tests/render/`         |     9 | Canvas and plot behavior                         |
| `tests/science/`        |     3 | Scientific contracts and client                  |
| `tests/scripts/`        |     4 | Data refresh and migration tools                 |
| `tests/sim/`            |    46 | V3 compatibility and V4 simulation runtime       |
| `tests/ui/`             |    21 | DOM controls and accessibility state             |
| `tests/workspace/`      |     2 | Workspace encoding and compatibility             |

The 176-file default suite excludes `tests/perf/`. Those two files run through
`pnpm perf-smoke` and `pnpm scientific-calibration`.

Playwright discovers the two specifications under `tests/e2e/` and expands
them across the configured Chromium, Firefox, WebKit, tablet, and mobile
projects.

Support modules under `tests/helpers/`, `tests/baseline/`, and
`tests/benchmarks/` are imported by active tests and are not independent test
entry points.

## Python tests

`science_backend/tests/` contains four pytest modules covering contracts,
canonical JSON, numerical propagation, inference helpers, service behavior,
jobs, cancellation, and artifacts.

```bash
source science_backend/.venv/bin/activate
PYTHONPATH=science_backend python -m pytest science_backend/tests
```

## Native Apple tests

Portable and macOS-only package tests use SwiftPM:

```bash
swift test --package-path native-apple/Packages/OtherlightCore
swift test --package-path native-apple/Packages/OtherlightScience
```

Application tests are in `native-apple/AppTests/`. UI tests are in
`native-apple/AppUITests/`. The shared Xcode scheme runs them on the configured
macOS, iPhone, and iPad destinations.

## Common commands

```bash
pnpm test
pnpm test:coverage
pnpm test:e2e
pnpm perf-smoke
pnpm scientific-calibration
```

Test output belongs in ignored framework directories such as `coverage/`,
`test-results/`, `playwright-report/`, and `.vitest-attachments/`. Contract
fixtures and runtime snapshots consumed by the application remain versioned.
