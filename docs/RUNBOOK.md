# Operations runbook

Run every command from the repository root unless a section says otherwise.

## Browser

Requires Node 22.13 or later and pnpm 11.4.

```bash
corepack enable
corepack install
pnpm install --frozen-lockfile
pnpm dev
```

Education runs locally in the Browser and needs no service. To build and preview
the ordinary production bundle:

```bash
pnpm build
pnpm preview
```

Prefer `pnpm smoke:served` when you want the automated served-build check: it
rebuilds, starts a preview on `127.0.0.1:4173`, and probes the served application.
`SMOKE_HOST` and `SMOKE_PORT` override that test endpoint.

## GitHub Pages mode

The Pages artifact holds the Browser application beneath `/otherlight/` and the
static screenshot tour beneath `/otherlight/demo/`:

```bash
pnpm build:pages:site
pnpm preview:pages
```

Open the preview at `/otherlight/`, not the origin root. The Pages build removes
loopback science origins from its Content Security Policy. Its Scientific view
shows a deterministic projection of
`contracts/science-v5/contract-cases.json#validForwardResult`, labelled as a
fixture replay: no V5 execution or network request happens, and changing the
visible form inputs does not change the fixture.

`pnpm smoke:pages` rebuilds the whole artifact and probes a preview on
`127.0.0.1:4174` by default; `SMOKE_PAGES_HOST` and `SMOKE_PAGES_PORT` override
that endpoint.

The workflow in `.github/workflows/pages.yml` publishes `dist/` only from `main`.
A passing workflow does not guarantee the deployed site is current, so load the
published URL before treating a revision as live. To build the tour on its own
for local review, use `pnpm build:demo`, which writes `pages-dist/`.

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

The process listens on `http://127.0.0.1:8765`; stop it with the terminal's
interrupt signal, and keep it on loopback. Check `GET /v1/capabilities` before
submitting work: missing or incompatible SciPy/PyArrow dependencies make the V5
job capability unavailable rather than enabling a fallback.

Job state lives in memory, and the service retains at most 128 terminal job
records by default, so a restart or eviction removes status lookup. Completed
Arrow files stay in `.science-cache` relative to the process working directory,
and the service stops publication at a default retained-cache quota of 1 GiB. Set
`OTHERLIGHT_ARTIFACT_CACHE_MAX_BYTES` to a positive integer byte count before
startup, or pass the keyword-only `max_artifact_cache_bytes` service option;
invalid values fail startup. An existing oversized cache stays readable, but
publication cannot increase its footprint. A failed admission produces
`artifact-cache-capacity-exhausted`, removes its temporary output, and preserves
existing artifacts. There is no automatic deletion, expiry, or backup.

The retained quota accounts for artifacts and abandoned writer temporaries, and
active temporary output is separately limited to 64 MiB per writer. An OS
advisory ownership lock excludes competing service writers and offline cleanup, so
stop the service before using the local operator CLI, which refuses a live cache.
Run usage reporting or inspect selected entries first:

```bash
uv run --project services/science --locked --extra dev python -m science_backend.artifact_cache .science-cache
uv run --project services/science --locked --extra dev python -m science_backend.artifact_cache .science-cache --artifact SHA256
uv run --project services/science --locked --extra dev python -m science_backend.artifact_cache .science-cache --temporary .arrow-EXACT-NAME.tmp
```

Replace the placeholders with the exact artifact ID or temporary basename. Removal
is a dry run unless the same command includes `--apply`, and only explicitly
selected entries are removed; symlinks, special files, and paths outside the cache
are rejected. Do not remove the ownership-lock file. This CLI adds no HTTP
endpoint or capability field.

Routes, limits, error codes, and troubleshooting live in the
[service guide](../services/science/README.md).

## Apple application

Use Xcode 26.6 and Swift 6.3.3. The portable and scientific packages have separate
test lanes:

```bash
pnpm native:core:test
pnpm native:science:test
```

Use the [Apple guide](../apps/apple/README.md) for Xcode destinations, local macOS
builds, package sandbox troubleshooting, signing, DMG packaging, notarization,
and verification. The mobile `Otherlight` target does not link the scientific
package; only `OtherlightMac` does. The Mac Scientific profile runs one
session-only native V5 job and offers separate, explicit Arrow and manifest
exports, and cancelling or replacing a run prevents stale publication.

## Verification

```bash
pnpm contracts:check
pnpm ci:verify
```

`ci:verify` is the Browser gate. It does not include contract validation, Python
checks, Apple tests, or Pages smoke, so run those independent lanes when their
paths or shared contracts change. See [Continuous integration](ci.md).

## Maintainer operations

Build the static screenshot tour on its own into the ignored `pages-dist/`:

```bash
pnpm build:demo
```

Refresh the checked-in NASA-derived Browser catalog only with network access:

```bash
pnpm data:real-systems:refresh
```

Review the source metadata and the complete JSON diff before retaining a refresh.
Migrate a legacy Browser draft from standard input to standard output:

```bash
pnpm migrate:v4 < input.json > output.json
```

Validate migrated output before importing it. `pnpm native:fixtures` rewrites a
tracked Education parity fixture and is reserved for intentional contract updates.
