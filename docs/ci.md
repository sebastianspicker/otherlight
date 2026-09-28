# Continuous integration

The workflow files under `.github/workflows/` are the source of truth for
triggers, runner images, permissions, and pinned action revisions. A local
command tells you what your machine did, not what a remote workflow, deployment,
simulator, signing, or notarization lane did — check the run itself before you
rely on it.

## Browser and contract lanes

The local Browser gate is:

```bash
pnpm ci:verify
```

It runs public-surface, executable-code, and Swift-documentation hygiene; the
Browser architecture and physics-registry checks; ESLint and Prettier;
TypeScript 7 and TypeScript 6 compatibility over application, worker, and test
sources; Vitest; and the ordinary Vite
build. It does not run serialized-contract validation, Python, Apple, security,
or Pages smoke checks.

`.github/workflows/ci.yml` runs `pnpm contracts:check` before the lint lane, tests
Node 22 and 24, and builds on Node 22. The complete local equivalent for the
Browser and contract portion is:

```bash
pnpm contracts:check
pnpm ci:verify
```

The lint job also runs `pnpm quality:static`: ESLint and Prettier, Stylelint,
ShellCheck, Knip, a deterministic 500-physical-line source ceiling, and JSCPD
with a zero-percent threshold for duplicate blocks of 10 lines and 100 tokens.
Those scanners cover Browser source, the static demo, repository scripts, the
science backend, the Apple apps, and both Swift package `Sources` trees. They omit
tests, generated code, vendor code, contracts, schemas, data, fixtures, build
output, and local tool output.

After you synchronize the locked Python environment, `pnpm quality:check` is the
canonical local quality gate; it combines `quality:static` with
`scripts/check-complexity.sh`, the one Lizard definition that the CI Python job
also runs.

## GitHub Pages

`.github/workflows/pages.yml` runs only for `main` and manual dispatches of
`main`. Its build job has read-only repository access and runs a frozen pnpm
install, `pnpm ci:verify`, `pnpm build:pages:site`, and `pnpm smoke:pages`. Only
the deployment job receives `pages:write` and `id-token:write`.

The uploaded artifact is `dist/` with base `/otherlight/`. It contains the Browser
and the display-only V5 contract fixture replay at `/otherlight/`, plus the static
screenshot tour at `/otherlight/demo/`. It contains no Python runtime and cannot
execute scientific jobs. The smoke check verifies the app, its worker asset, and
the tour captures before upload.

## Science service

The Python job uses exact Python 3.14.6 and `uv==0.10.7`, synchronizes
`services/science/uv.lock` with the `dev` extra, then runs
`scripts/check-complexity.sh`, Ruff formatting and linting, Pyright, pytest, a wheel build, and
an installed-wheel import/version smoke. The Node lint job invokes ShellCheck
through `quality:static`, and the native checks use Xcode 26.6 and Swift 6.3.3 on
their dedicated macOS runner.

The shorter editable-install development checks are:

```bash
pnpm science:backend:check
pnpm science:backend:test
```

They are useful local gates, but they are not equivalent to the locked CI job and
its wheel smoke.

## Apple

`.github/workflows/native-apple.yml` is path-filtered to Apple, shared contracts,
the checked-in catalog, and its workflow and toolchain files. On `macos-26` with
Xcode 26.6 and Swift 6.3.3 it runs:

- both SwiftPM package tests;
- strict `swift format lint` across `apps/apple`;
- `xcodebuild test` for `OtherlightMac` on macOS and for the `Otherlight`
  Education target on iPhone 17 Pro and iPad Pro 13-inch (M5), both on iOS 26.5;
- an unsigned generic-iOS archive metadata and dependency gate.

The manual `native-macos-dmg.yml` workflow creates an unsigned, ephemeral
Universal 2 DMG and checksum. It does not sign, notarize, upload, or retain a
release artifact. Manual signed distribution is documented in the
[Apple guide](../apps/apple/README.md).

## Security automation

CodeQL analyzes TypeScript/JavaScript and Python on pushes and pull requests to
`main` and `dev`, plus a weekly schedule. Gitleaks scans push and pull-request
history, and the dependency-audit workflow runs
`pnpm audit:security` (moderate and above) weekly and on manual dispatch.

## Release evidence

There is no automated release publication and no versioning policy beyond the
version strings in the package metadata. Before you make a release claim,
identify the exact revision and gather fresh results for every included product
and contract. Browser, service, Apple, Pages, device, signing, notarization, and
scientific-validation evidence are independent, so state any omitted lane instead
of inferring it from another successful check.

Use the [alpha release procedure](alpha-release.md) for the candidate-level
checklist and [release status](../RELEASE_STATUS.md) for the current
qualification marker.

## Performance evidence

The existing test lanes already produce performance reports. Browser lanes run
`pnpm benchmark:browser` and upload `browser-benchmarks-node-22` and
`browser-benchmarks-node-24` JSON artifacts. The Python lane runs maximum-size
dataset imports and rich/compact forward output in separate latency and memory
passes, then uploads `python-benchmarks`. The portable Swift package lane runs
`OtherlightBenchmark` and uploads `apple-benchmarks` text output for the
interactive, reference, and series workloads.

Reports include workload and toolchain metadata, warmups, repetitions, latency
distributions, and memory measurements. Timing does not set a CI threshold;
work-count, sample-equality, bounded-scheduling, and retained-state assertions
must pass. Raw Browser export/type discovery is also a required part of
`pnpm deadcode`, with exact compatibility exceptions documented in the
[discovery guide](dead-code.md). See [performance validation](performance.md) for
controlled comparisons and manual responsiveness/profiling checks.
