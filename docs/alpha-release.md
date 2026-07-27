# Alpha assembly and distribution

The root package and Python backend identify the browser and backend alpha as
`0.2.0-alpha.1`. The native Apple project has a separate `0.3.0-alpha.1`
development lane.

The repository does not contain an automated publication workflow. The root
package is private, the browser build is not deployed by GitHub Actions, the
backend is intended for loopback use, and the native workflows do not upload
artifacts.

## Alpha scope

The browser application contains:

- an Education profile with Simulation and Guided Labs
- an optional Scientific profile that submits a V5 forward radial-velocity job
  to a verified loopback backend
- static scenario and real-system data
- CSV and report exports from the browser interface

The Scientific backend currently exposes forward radial velocity only. It does
not provide inference, fitting, posterior sampling, research photometry,
calibrated time conversion, or a remote service security model.

The native Apple application is Education-only. It targets macOS 14, iOS 17,
and iPadOS 17 or newer. The macOS-only `OtherlightScience` package is separate
from the shared application.

## Browser build

Create the static bundle:

```bash
pnpm install --frozen-lockfile
pnpm build
```

The output is in `dist/`. A static host must:

- serve `index.html` for application navigation
- preserve the security headers defined in `vite.config.ts`
- permit the browser to connect only to the documented loopback backend when
  Scientific mode is used

There is no repository script that uploads `dist/`.

## Backend operation

Prepare the exact supported Python line:

```bash
python3.14 -m venv science_backend/.venv
source science_backend/.venv/bin/activate
python -m pip install -e './science_backend[dev]'
PYTHONPATH=science_backend python -m pytest science_backend/tests
pnpm science:backend:serve
```

Keep the service on `127.0.0.1:8765`. Do not expose it to a LAN or public
network.

## Native macOS packaging

The local scripts support a manually authorized macOS archive, DMG,
notarization, and verification path. The entry points are
`scripts/archive-macos.sh`, `scripts/package-macos-dmg.sh`,
`scripts/notarize-macos.sh`, and `scripts/verify-macos-release.sh`.

Archive creation requires `DEVELOPMENT_TEAM`. Packaging, notarization, and
verification require the relevant app or DMG positional path. Notarization also
requires `NOTARY_PROFILE`, and final verification requires
`EXPECTED_TEAM_ID`. Signing identity, version, build number, output paths, and
other expected metadata have script defaults or documented overrides. Complete
invocations are in [`native-apple/README.md`](../native-apple/README.md). Do not
infer release authorization from the presence of these scripts.

The manual `Native macOS DMG` workflow creates an unsigned temporary DMG and
prints its checksum. It uploads nothing.

## Candidate verification

Run the browser and TypeScript release loop:

```bash
pnpm clean
./scripts/ci-local.sh
```

Run the Python checks in the prepared backend environment:

```bash
python -m ruff format --check science_backend
python -m ruff check science_backend
python -m pyright science_backend
PYTHONPATH=science_backend python -m pytest science_backend/tests
```

Run the native checks on Xcode 26.6 with Swift 6.3.3:

```bash
source scripts/select-swift-toolchain.sh
swift format lint --strict --recursive native-apple
swift test --package-path native-apple/Packages/OtherlightCore
swift test --package-path native-apple/Packages/OtherlightScience
bash scripts/build-run-macos.sh build
```

Before distribution, repeat the applicable checks from one clean candidate
revision and record any environment-specific gaps. The working tree described
in [`../RELEASE_STATUS.md`](../RELEASE_STATUS.md) is not an immutable release
candidate.

## Screenshot evidence

The checked-in browser gallery is documented in [`tour.md`](tour.md). Its
completed Scientific frame uses a checked-in contract response and is not
evidence of a new backend execution.

For a live Scientific capture, start the verified backend and run:

```bash
pnpm capture:tour:web:live
```

The live mode downloads the Arrow artifact and records its digest. The default
capture uses a Vite development server. The static mode builds the site and
intercepts the Scientific request with the checked-in contract case:

```bash
pnpm capture:tour:web
pnpm capture:tour:web:static
```

The repository does not currently include a native Apple screenshot gallery.
