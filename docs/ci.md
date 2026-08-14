# Continuous integration

The repository separates browser and Python checks from native Apple checks.
Workflow access to repository contents is read-only, and action revisions are
pinned. The CodeQL workflow also grants `security-events: write` so it can
publish its analysis results.

## Browser and Python workflow

`.github/workflows/ci.yml` runs on pull requests and pushes to `main` and `dev`.
Its jobs are:

| Job             | Environment                  | Checks                                                                            |
| --------------- | ---------------------------- | --------------------------------------------------------------------------------- |
| `lint`          | Ubuntu 24.04, Node 22        | Public-surface and documentation hygiene, ESLint, Prettier, Knip, and duplication |
| `typecheck`     | Ubuntu 24.04, Node 22        | TypeScript 7 and TypeScript 6 compatibility projects                              |
| `python`        | Ubuntu 24.04, Python 3.14.6  | Ruff, Pyright, pytest, wheel build, clean wheel install and import                |
| `test`          | Ubuntu 24.04, Node 22 and 24 | Vitest unit and integration suites                                                |
| `build`         | Ubuntu 24.04, Node 22        | Vite production build                                                             |
| `e2e`           | Ubuntu 24.04, Node 22        | Playwright Chromium, Firefox, WebKit, tablet, and mobile projects                 |
| `quality-gates` | Ubuntu 24.04, Node 22        | Literature, calibration, didactics, performance, physics, and migration checks    |

Each Node job installs dependencies with:

```bash
corepack enable
corepack install
pnpm install --frozen-lockfile
```

## Native Apple workflow

`.github/workflows/native-apple.yml` runs when its workflow, native source,
capability contract, Swift toolchain selector, or real-systems snapshot changes.
It can also be dispatched manually. It uses macOS 26, Xcode 26.6, and Swift
6.3.3.

The workflow:

- tests `native-apple/Packages/OtherlightCore`
- tests the macOS-only `native-apple/Packages/OtherlightScience`
- checks Swift formatting
- tests the shared app on macOS, iPhone 17 Pro with iOS 26.5, and iPad Pro
  13-inch (M5) with iOS 26.5
- creates an unsigned generic iOS archive and verifies bundle metadata, the
  privacy manifest, and the absence of Arrow in mobile dependencies

This workflow is path-filtered. It is not a check on changes outside those
paths.

## macOS DMG workflow

`.github/workflows/native-macos-dmg.yml` runs only through
`workflow_dispatch`. It creates and checksums an unsigned Universal 2 DMG in
the runner temporary directory. It does not upload, sign, notarize, publish, or
create a release.

## Security automation

- `.github/workflows/security.yml` runs Gitleaks on pushes and pull requests.
- `.github/workflows/codeql.yml` runs CodeQL on pushes, pull requests, and its
  configured schedule.
- `.github/workflows/dependency-audit.yml` runs the moderate pnpm advisory gate
  on schedule or manual dispatch.
- `.github/dependabot.yml` monitors root pnpm dependencies, Python backend
  dependencies, and GitHub Actions.

No standard verification workflow requires repository secrets.

## Local checks

Run the same browser and TypeScript checks used by the main workflow:

```bash
pnpm ci:verify
```

Run the broader local loop:

```bash
./scripts/ci-local.sh
```

The script performs a frozen install, installs Playwright browsers, runs
browser E2E tests, probes the served build, records coverage, runs the moderate
dependency audit, and executes the scientific contract and project quality
gates. It does not run the Python backend checks or native Apple checks.

Run those separately:

```bash
source science_backend/.venv/bin/activate
python -m ruff format --check science_backend
python -m ruff check science_backend
python -m pyright --pythonpath "$VIRTUAL_ENV/bin/python" science_backend
PYTHONPATH=science_backend python -m pytest science_backend/tests

source scripts/select-swift-toolchain.sh
swift format lint --strict --recursive native-apple
swift test --package-path native-apple/Packages/OtherlightCore
swift test --package-path native-apple/Packages/OtherlightScience
```

The local dependency audit requires network access. Playwright installation may
also download browser binaries.

## Changing automation

When editing a workflow:

1. Keep permissions at the smallest required scope.
2. Pin third-party actions to immutable revisions.
3. Set a finite timeout.
4. Keep installation tied to the checked-in lockfile or package metadata.
5. Add path filters only when an unaffected change can safely skip the job.
6. Do not add signing, upload, publication, or infrastructure mutation to a
   verification workflow.
