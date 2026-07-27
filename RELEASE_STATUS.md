# Verification status

Evidence date: 2026-07-24

This document records checks run against the current local working tree. The
tree contains tracked and untracked changes, so these results do not describe
an immutable release candidate. Nothing was staged, committed, tagged,
published, or deployed.

## Browser and TypeScript

| Check                                | Result                                                   |
| ------------------------------------ | -------------------------------------------------------- |
| Public-surface hygiene               | Passed, 701 candidate files                              |
| Source documentation hygiene         | Passed, 586 executable files                             |
| Native Swift documentation hygiene   | Passed, 35 Swift files                                   |
| Local documentation links            | Passed, 34 Markdown and HTML files                       |
| Screenshot gallery and README checks | Passed, 7 tests                                          |
| ESLint                               | Passed                                                   |
| Repository Prettier check            | Passed                                                   |
| TypeScript 7 typecheck               | Passed                                                   |
| TypeScript 6 compatibility typecheck | Passed                                                   |
| Vitest                               | Passed, 176 files and 1,008 tests                        |
| Vite production build                | Passed, 293 modules                                      |
| Knip                                 | Passed                                                   |
| jscpd                                | Passed its configured threshold; reported two CSS clones |
| Playwright E2E                       | 52 passed, 5 failed                                      |

Four failures are `tests/e2e/responsive.spec.ts:39` under Chromium, Firefox,
WebKit, and the tablet project. The fifth is the mobile project at
`tests/e2e/responsive.spec.ts:29`. Each check measured 8px of horizontal
overflow against a maximum of 1px.

A separate snapshot containing only nonignored project files completed a
frozen installation, `pnpm ci:verify`, and `pnpm smoke:served`. The initial
offline-only install could not proceed because 87 packages were absent from
the local pnpm store; the normal installation retrieved them.

## Python backend

Python 3.14.6 is installed, and `python3 -m compileall` passes for
`science_backend/science_backend`.

The ignored `science_backend/.venv` directory does not contain a usable Python
executable. The active Python installation does not provide pytest, Ruff, or
Pyright. Backend tests, formatting, linting, type checking, HTTP execution,
Arrow output, and wheel installation were not run. These checks require the
documented `science_backend[dev]` installation.

## Native Apple

The exact local toolchain reports Xcode 26.6 build 17F113 and Swift 6.3.3.

| Check                    | Result                                                       |
| ------------------------ | ------------------------------------------------------------ |
| Swift formatting         | Passed                                                       |
| `OtherlightCore` package | Passed, 16 tests                                             |
| macOS application tests  | Did not start; package dependency resolution failed in Xcode |

Xcode 26.6 reaches package dependency resolution but its linker fails with
`posix_spawn failed: No such file or directory`. Xcode 26.3 cannot resolve the
Swift 6.3 package because its installed package tools report Swift 6.2.4.

The macOS-only `OtherlightScience` package, simulator test matrix, generic iOS
archive, Universal 2 archive, DMG, signing, and notarization checks were not
run.

## Screenshot evidence

The checked-in browser gallery contains ten frames and a manifest. Its
completed Scientific frame is a deterministic contract replay, not a live
backend result.

A live Scientific capture and a native Apple gallery were not produced. The
native gallery directory is absent.

## Distribution status

- `pnpm build` writes the static browser bundle to `dist/`.
- No workflow uploads or deploys the browser bundle.
- The Python service is limited to loopback operation.
- The manual macOS DMG workflow produces an unsigned temporary artifact and
  does not upload it.
- No current check establishes a signed, notarized, uploaded, or published
  release.
