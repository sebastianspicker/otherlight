# Otherlight scientific backend

`science_backend` is an optional local HTTP service. Its stable `/v1` family
executes the V5 forward radial-velocity contract, and its additive `/v2` family
currently provides strict, process-memory V6 dataset imports but no V6 jobs. It is
not a general astronomy service, and it does not replace the Browser Education
simulation.

## Requirements and installation

The package requires Python `>=3.14.6,<3.15`. From the repository root, create an
environment and install the runtime dependencies:

```bash
python3.14 -m venv services/science/.venv
source services/science/.venv/bin/activate
python -m pip install -e './services/science[integrator,service,artifacts]'
```

The dependency sets are intentionally separate:

| Extra        | Packages                    | Purpose                    |
| ------------ | --------------------------- | -------------------------- |
| `integrator` | SciPy                       | DOP853 forward integration |
| `service`    | FastAPI, Uvicorn            | HTTP transport             |
| `artifacts`  | PyArrow                     | Arrow IPC artifacts        |
| `dev`        | Runtime extras plus `build` | Wheel development          |

To install only the HTTP execution dependencies:

```bash
python -m pip install -e './services/science[integrator,service,artifacts]'
```

## Run locally

Start the service on loopback only:

```bash
pnpm science:backend:serve
```

By default it writes artifacts to `.science-cache` relative to the process
working directory, holds an operating-system advisory ownership lock while
running, retains at most 1 GiB of artifacts and abandoned writer temporaries, and
limits each live writer temporary to 64 MiB. Set
`OTHERLIGHT_ARTIFACT_CACHE_MAX_BYTES` to a positive base-10 byte count before
startup to change the retained quota; invalid values fail startup. An existing
oversized cache stays readable, but publication cannot increase its retained
footprint.

Job state exists only in memory, so terminal records are bounded and do not
survive a restart. Artifacts have no automatic expiry or backup. The service does
not fetch external data or start any non-loopback network service. CORS permits
only the local Vite development, preview, and alternate preview origins on ports
`5173`, `4173`, and `4174` for `localhost` and `127.0.0.1`.

## V1 execution contract

The stable V5 routes live under `/v1`.

| Method   | Route                      | Result                                                                   |
| -------- | -------------------------- | ------------------------------------------------------------------------ |
| `GET`    | `/capabilities`            | Current end-to-end capability manifest and unavailable model identifiers |
| `POST`   | `/jobs`                    | Creates a `forward` job and returns `201` with its initial status        |
| `GET`    | `/jobs/{job_id}`           | Returns job status                                                       |
| `GET`    | `/jobs/{job_id}/result`    | Returns the completed result and run manifest                            |
| `DELETE` | `/jobs/{job_id}`           | Requests cooperative cancellation of a non-terminal job                  |
| `GET`    | `/artifacts/{artifact_id}` | Serves an Arrow IPC file for a lowercase SHA-256 artifact identifier     |

The only successful HTTP output is `radial-velocity`. A request carries a V5
scenario with two or three finite-radius bodies, barycentric SI Cartesian
position and velocity, a positive TDB Julian Date epoch, a target body, a unit
line-of-sight vector, DOP853 tolerances, a finite sampling interval, and a seed.
Velocity is positive for recession. Unknown fields and malformed contracts are
rejected.

`GET /capabilities` reports no supported jobs unless SciPy 1.18.0 exposes the
exact DOP853 dense representation required by the collision certificate and the
PyArrow IPC writer is available; version or representation drift fails closed.
The service reports these lanes as unavailable: photometry research, relativistic
timing, parameter-inference adapters, atmospheric radiative transfer, and
stellar-atmosphere grids.

## V2 dataset contract

The additive V6 routes currently expose only dataset capability and lifecycle:

| Method   | Route                      | Result                                       |
| -------- | -------------------------- | -------------------------------------------- |
| `GET`    | `/v2/capabilities`         | Dataset kinds, limits, and no supported jobs |
| `POST`   | `/v2/datasets`             | Imports or idempotently resolves a dataset   |
| `GET`    | `/v2/datasets`             | Lists session dataset metadata               |
| `GET`    | `/v2/datasets/{datasetId}` | Returns one dataset descriptor               |
| `DELETE` | `/v2/datasets/{datasetId}` | Deletes an unused imported dataset           |

Imports require exactly
`application/vnd.otherlight.science-dataset+json; charset=utf-8`. Compression,
duplicate keys, malformed UTF-8, non-finite values, unknown fields, wrong units,
non-monotonic axes, and bodies over 8 MiB are rejected before admission. The
registry permits 16 datasets, 100,000 samples per dataset, 400,000 aggregate
samples, and 64 MiB of retained normalized objects. Canonical JSON supplies the
content identity, so whitespace-only duplicates are idempotent. Imports clear at
shutdown and cannot enter a workspace.

There are no `/v2/jobs` or `/v2/artifacts` routes yet. The V6 job, artifact, and
manifest schemas are an unavailable future boundary, not execution evidence.

## Limits and failure behavior

The default service has one worker, admits at most eight running or queued jobs,
and retains the newest 128 terminal job records. A full queue returns `429` with
code `job-capacity-exhausted` and `Retry-After: 1`; evicted terminal jobs return
`404`, while their artifacts remain in the independent content-addressed cache.
The propagation path retains only the time and radial-velocity columns needed for
Arrow publication plus the run manifest; the public Python `run_forward` function
still returns full positions, velocities, and photocentre values.

Forward jobs are bounded to three bodies, 100,000 samples, 500,000 accepted
integration steps, 8,000,000 right-hand-side evaluations, and 60 seconds. Sample
times must be finite, unique, and representable as a strictly increasing IEEE-754
grid, and body centres must be non-overlapping initially. Each accepted DOP853
dense numerical trajectory is certified outside finite-radius contact with
bounded, outward-rounded interval arithmetic; contact or an indeterminate proof
fails the job. That certificate covers the numerical interpolant within its
declared tolerances, not the exact physical trajectory. The service does not model
impacts, mergers, tides, rotational multipoles, relativity, radiation forces,
softening, or time-scale conversion.

The contract requires initial barycentre residuals no larger than
`max(1e-3 m, 1e-12 * position scale)` for position and
`max(1e-9 m/s, 1e-12 * velocity scale)` for velocity. It accepts only positive
masses and radii and requires a target body identifier that exists in the
scenario.

Errors use a JSON object with `code` and `message`. Invalid contracts return
`422`, unavailable execution dependencies return `503`, missing jobs or
artifacts return `404`, a result requested before completion returns `409`, and
unexpected service failures return `500`. Cancellation is authoritative: a
cancelled job cannot later publish a successful artifact.

Every route rejects a non-loopback `Host` or an unapproved browser `Origin`.
Responses use `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.
Artifact reads open without following links, verify a bounded regular file
through the opened descriptor, and compare its SHA-256 before streaming that same
descriptor.

## Checks

From the repository root with the service environment active:

```bash
pnpm science:backend:check
python -m pip install build
python -m build --wheel services/science
```

Inspect offline cache usage with the local module CLI. Cleanup is a dry run by
default and accepts only explicit artifact identifiers or exact abandoned
temporary basenames. Stop the service first; the ownership lock rejects cleanup
against a live cache.

```bash
PYTHONPATH=services/science python -m science_backend.artifact_cache .science-cache
PYTHONPATH=services/science python -m science_backend.artifact_cache .science-cache --artifact SHA256
PYTHONPATH=services/science python -m science_backend.artifact_cache .science-cache --temporary .arrow-NAME.tmp
PYTHONPATH=services/science python -m science_backend.artifact_cache .science-cache --artifact SHA256 --apply
```

## Troubleshooting

| Symptom                                                      | Check                                                                                                                               |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Service startup reports that the HTTP service is unavailable | Install the `service` extra.                                                                                                        |
| Capabilities contain no supported jobs                       | Install the `integrator` and `artifacts` extras, then restart the service.                                                          |
| `429 job-capacity-exhausted`                                 | Wait for a running job to reach a terminal state, or cancel a queued or running job.                                                |
| `422 invalid-contract`                                       | Check exact field names, body count, barycentric state, target body, TDB epoch, finite positive tolerances, and the sample grid.    |
| `404 unknown-artifact`                                       | Use the artifact identifier from a completed result. An invalid identifier, a missing file, or a removed cache entry returns `404`. |
| `artifact-cache-capacity-exhausted`                          | Stop the service, inspect cache usage, and explicitly remove selected artifacts or abandoned temporaries before retrying.           |
| `artifact-writer-capacity-exhausted`                         | Reduce the forward sample count; one Arrow writer exceeded its independent 64 MiB temporary-file limit.                             |
| `409 dataset-in-use`                                         | Wait for the referencing V2 job to finish or cancel before deletion. No current V2 job route acquires datasets.                     |
| `409 dataset-quota-exceeded`                                 | Delete an unused imported dataset or restart the session-scoped service.                                                            |
| `413 dataset-too-large`                                      | Keep the exact uncompressed JSON upload at or below 8 MiB.                                                                          |
| `415 unsupported-media-type`                                 | Use the exact V6 dataset JSON media type without content encoding.                                                                  |
| A job fails at contact or a work budget                      | Reduce the requested span or sampling and use a physically non-overlapping scenario.                                                |

## Security

Bind the service to `127.0.0.1` unless a separate deployment review establishes
an authenticated network boundary; it has no authentication or authorization
layer. Treat request payloads and Arrow artifacts as local data, restrict
filesystem access to `.science-cache`, and do not treat the local CORS policy as
an access-control mechanism.
