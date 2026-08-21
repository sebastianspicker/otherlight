# Operations runbook

This runbook covers local setup, browser operation, the optional Scientific
backend, native Apple builds, screenshots, and common failures.

## Initial setup

The browser workspace requires Node.js 22.13.0 or newer and pnpm 11.4.0.

```bash
corepack enable
corepack install
pnpm install --frozen-lockfile
```

The install command uses the checked-in lockfile. Do not use npm to update the
workspace dependencies.

## Browser application

Start the Vite development server:

```bash
pnpm dev
```

Open `http://localhost:5173`. The Education profile works without the Python
backend.

Build and serve the static browser bundle:

```bash
pnpm build
pnpm preview
```

The build output is written to `dist/`. Vite preview uses port 4173 unless it is
overridden on the command line.

Probe a served production build:

```bash
pnpm smoke:served
```

`scripts/smoke-served-app.sh` starts a loopback preview server. `SMOKE_HOST`
defaults to `127.0.0.1`, and `SMOKE_PORT` defaults to `4173`.

## Scientific backend

The backend requires Python 3.14.6 or a later 3.14 patch release. Create a
dedicated environment in the backend directory:

```bash
python3.14 -m venv science_backend/.venv
source science_backend/.venv/bin/activate
python -m pip install -e './science_backend[dev]'
```

Run its checks:

```bash
python -m ruff format --check science_backend
python -m ruff check science_backend
python -m pyright --pythonpath "$VIRTUAL_ENV/bin/python" science_backend
PYTHONPATH=science_backend python -m pytest science_backend/tests
```

Start the service:

```bash
pnpm science:backend:serve
```

The service listens on `http://127.0.0.1:8765`. Keep it bound to loopback. It
has no authentication or remote multi-user security model.

Useful endpoints:

```text
GET  /v1/capabilities
POST /v1/jobs
GET  /v1/jobs/{job_id}
GET  /v1/jobs/{job_id}/result
DELETE /v1/jobs/{job_id}
GET  /v1/artifacts/{artifact_id}
```

The browser enables a Scientific request only when the capabilities response
advertises forward execution and radial-velocity output. SciPy and PyArrow are
required for that path. See
[`science_backend/README.md`](../science_backend/README.md) for the request,
artifact, cache, and limit contracts.

## Native Apple application

The native workspace requires Xcode 26.6 and Swift 6.3.3.

```bash
source scripts/select-swift-toolchain.sh
swift format lint --strict --recursive native-apple
swift test --package-path native-apple/Packages/OtherlightCore
swift test --package-path native-apple/Packages/OtherlightScience
bash scripts/build-run-macos.sh build
```

The `OtherlightScience` package is macOS-only. The shared application is an
Education client for macOS 14, iOS 17, and iPadOS 17 or newer. It does not
provide the browser Scientific workspace.

Use [`native-apple/README.md`](../native-apple/README.md) for simulator
destinations, package boundaries, release variables, and platform-specific
troubleshooting.

## Browser screenshot tour

The maintained browser gallery is under `docs/screenshots/web/`.

Capture against a temporary Vite development server:

```bash
pnpm capture:tour:web
```

Capture from a production build while intercepting the Scientific request with
the checked-in contract case:

```bash
pnpm capture:tour:web:static
```

Capture a new Scientific result from an already running backend:

```bash
pnpm capture:tour:web:live
```

Only the live command runs the backend request, downloads the Arrow artifact,
and records its digest. The default and static commands use deterministic
contract data for the completed-result frame.

Set `SCREENSHOT_DIR` to write review captures outside the maintained gallery.
Validate the gallery with:

```bash
pnpm verify:tour
```

The frame list and provenance rules are in [`tour.md`](tour.md).

## Native Apple screenshot tour

Run the preflight before launching capture:

```bash
DEVELOPER_DIR=/Applications/Xcode-26.6.0.app/Contents/Developer \
  pnpm capture:tour:apple --preflight
```

Capture the macOS, iPhone, and iPad frames:

```bash
DEVELOPER_DIR=/Applications/Xcode-26.6.0.app/Contents/Developer \
  pnpm capture:tour:apple
```

Set `APPLE_SCREENSHOT_DIR` for output outside `docs/screenshots/apple/`.
The repository does not currently contain a maintained native Apple gallery.

## Verification

Run the normal local checks:

```bash
pnpm hygiene:public
pnpm hygiene:docs
pnpm hygiene:swift-docs
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Run the broader local release loop:

```bash
./scripts/ci-local.sh
```

That script performs a frozen install, runs the compact contract suite, probes
the served application, queries the dependency advisory service, and runs the
project checks. It does not run the Python or native Apple test suites.

Remove reproducible local output:

```bash
pnpm clean
```

## Data and migration maintenance

Refresh the checked-in NASA Exoplanet Archive snapshot:

```bash
pnpm data:real-systems:refresh
```

This command uses the network and rewrites
`src/config/real-systems.snapshot.json`. Review the source metadata and diff
before retaining the result.

Migrate a SystemParams payload to V4:

```bash
pnpm migrate:v4 -- input.json output.json
```

Run the compact `pnpm test` suite after changing migration code or schema.

## Troubleshooting

### pnpm is unavailable

Run:

```bash
corepack enable
corepack install
```

Confirm that `pnpm --version` reports `11.4.0`.

### Vite or a test executable is missing

Install the locked dependencies:

```bash
pnpm install --frozen-lockfile
```

### A local port is already in use

Stop the existing process or pass another port to Vite. The browser Scientific
client is fixed to the loopback backend on port 8765, so that service must use
the documented address.

### The Scientific profile is unavailable

Check `http://127.0.0.1:8765/v1/capabilities`. A running service can still
withhold forward radial velocity when SciPy or PyArrow is missing. Restart the
browser after correcting the backend environment.

### Screenshot capture cannot find a browser

Install the pinned browser binaries:

```bash
pnpm exec playwright install chromium firefox webkit
```

Install any required system libraries for the local screenshot-capture host.

### Swift selects the wrong toolchain

Set `DEVELOPER_DIR` to the Xcode 26.6 developer directory, then source
`scripts/select-swift-toolchain.sh`. The script verifies Swift 6.3.3 before
running the requested command.

### macOS packaging fails

Check the required signing, team, version, and notarization variables in
[`native-apple/README.md`](../native-apple/README.md). The repository workflows
do not provide signing credentials and do not upload artifacts.
