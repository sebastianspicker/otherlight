# Operations runbook

## Browser

Requires Node 22.13 or later and pnpm 11.4.

```bash
corepack enable
corepack install
pnpm install --frozen-lockfile
pnpm dev
```

Build and serve the production bundle:

```bash
pnpm build
pnpm preview
pnpm smoke:served
```

Education is local Browser functionality and does not require the Python
service.

## Science service

Requires Python 3.14.6 or a later 3.14 patch release.

```bash
python3.14 -m venv services/science/.venv
source services/science/.venv/bin/activate
python -m pip install -e './services/science[dev]'
pnpm science:backend:check
pnpm science:backend:test
pnpm science:backend:serve
```

The service listens at `http://127.0.0.1:8765`. Keep it on loopback. Its
routes, capability handshake, limits, artifact cache, and failures are defined
in [services/science/README.md](../services/science/README.md).

## Apple application

```bash
pnpm native:core:test
pnpm native:science:test
```

Use [apps/apple/README.md](../apps/apple/README.md) for Xcode destinations,
toolchain selection, local builds, and distribution-only procedures.

## Verification

```bash
pnpm hygiene:public
pnpm hygiene:docs
pnpm hygiene:swift-docs
pnpm architecture:check
pnpm physics-registry
pnpm ci:verify
```

`pnpm ci:verify` runs the Browser quality and build lane. Service and Apple
checks are separate because their runtimes and dependencies differ.

## Maintenance

`pnpm data:real-systems:refresh` updates the checked-in Browser catalog and
requires network access. Review its metadata and diff before retaining a
refresh. `pnpm migrate:v4 -- input.json output.json` migrates a legacy
`BrowserScenarioDraft` payload to V4; validate the resulting contract and Browser
tests before using it.
