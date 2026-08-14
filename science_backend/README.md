# Otherlight scientific backend

`science_backend` is an optional local HTTP service for the V5 forward radial-velocity contract. It accepts bounded Newtonian point-mass requests, performs DOP853 propagation, and writes Arrow IPC artifacts. It is not a general astronomy service and does not replace the browser Education simulation.

## Requirements and installation

The package requires Python `>=3.14.6,<3.15`.

From the repository root, create an environment and install the development set:

```bash
python3.14 -m venv science_backend/.venv
source science_backend/.venv/bin/activate
python -m pip install -e './science_backend[dev]'
```

Optional dependency sets are deliberately separated:

| Extra        | Packages                      | Purpose                    |
| ------------ | ----------------------------- | -------------------------- |
| `integrator` | SciPy                         | DOP853 forward integration |
| `service`    | FastAPI, Uvicorn              | HTTP transport             |
| `artifacts`  | PyArrow                       | Arrow IPC artifacts        |
| `test`       | pytest, HTTPX2, Ruff, Pyright | Local checks               |
| `dev`        | All of the above plus `build` | Development environment    |

Install only the HTTP execution dependencies with:

```bash
python -m pip install -e './science_backend[integrator,service,artifacts]'
```

## Run locally

Start the service on loopback only:

```bash
pnpm science:backend:serve
```

The default service writes artifacts to `.science-cache` relative to the process working directory. It does not fetch external data or start any non-loopback network service. CORS permits only the local Vite development, preview, and end-to-end origins on ports `5173`, `4173`, and `4174` for `localhost` and `127.0.0.1`.

## HTTP contract

All routes are under `/v1`.

| Method   | Route                      | Result                                                                   |
| -------- | -------------------------- | ------------------------------------------------------------------------ |
| `GET`    | `/capabilities`            | Current end-to-end capability manifest and unavailable model identifiers |
| `POST`   | `/jobs`                    | Creates a `forward` job and returns `201` with its initial status        |
| `GET`    | `/jobs/{job_id}`           | Returns job status                                                       |
| `GET`    | `/jobs/{job_id}/result`    | Returns the completed result and run manifest                            |
| `DELETE` | `/jobs/{job_id}`           | Requests cooperative cancellation of a non-terminal job                  |
| `GET`    | `/artifacts/{artifact_id}` | Serves an Arrow IPC file for a lowercase SHA-256 artifact identifier     |

The only successful HTTP output is `radial-velocity`. A request contains a V5 scenario with two or three finite-radius bodies, barycentric SI Cartesian position and velocity, a positive TDB Julian Date epoch, a target body, a unit line-of-sight vector, DOP853 tolerances, a finite sampling interval, and a seed. The velocity sign is positive for recession. Unknown fields and malformed contracts are rejected.

`GET /capabilities` reports no supported jobs unless SciPy 1.18.0 exposes the exact DOP853 dense representation required by the collision certificate and the PyArrow IPC writer is available. Version or representation drift fails closed. The service reports these unavailable lanes: photometry research, relativistic timing, parameter inference adapters, atmospheric radiative transfer, and stellar-atmosphere grids.

## Limits and failure behavior

The default service has one worker, admits at most eight running or queued jobs, and retains the newest 128 terminal job records. A full queue returns `429` with code `job-capacity-exhausted` and `Retry-After: 1`. Evicted terminal jobs return `404`; artifacts remain in the independent content-addressed cache.

Forward jobs are bounded to three bodies, 100,000 samples, 500,000 accepted integration steps, 8,000,000 right-hand-side evaluations, and 60 seconds. Sample times must be finite, unique, and representable as a strictly increasing IEEE-754 grid. Body centres must be non-overlapping initially. Each accepted DOP853 dense numerical trajectory is certified outside finite-radius contact with bounded, outward-rounded interval arithmetic; contact or an indeterminate proof fails the job. This is a certificate for the numerical interpolant within its declared tolerances, not the exact physical trajectory. The service does not model impacts, mergers, tides, rotational multipoles, relativity, radiation forces, softening, or time-scale conversion.

The contract requires initial barycentre residuals no larger than `max(1e-3 m, 1e-12 * position scale)` for position and `max(1e-9 m/s, 1e-12 * velocity scale)` for velocity. It accepts only positive masses and radii, and it requires a target body identifier present in the scenario.

Errors use a JSON object with `code` and `message`. Invalid contracts return `422`; unavailable execution dependencies return `503`; missing jobs or artifacts return `404`; a result requested before completion returns `409`; unexpected service failures return `500`. Cancellation is authoritative: a cancelled job cannot later publish a successful artifact.

## Checks

From the repository root with the development environment active:

```bash
python -m ruff format --check science_backend
python -m ruff check science_backend
python -m pyright --pythonpath "$VIRTUAL_ENV/bin/python" science_backend
PYTHONPATH=science_backend python -m pytest science_backend/tests
```

## Troubleshooting

| Symptom                                                      | Check                                                                                                                               |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Service startup reports that the HTTP service is unavailable | Install the `service` extra.                                                                                                        |
| Capabilities contain no supported jobs                       | Install the `integrator` and `artifacts` extras, then restart the service.                                                          |
| `429 job-capacity-exhausted`                                 | Wait for a running job to reach a terminal state or cancel a queued or running job.                                                 |
| `422 invalid-contract`                                       | Check exact field names, body count, barycentric state, target body, TDB epoch, finite positive tolerances, and the sample grid.    |
| `404 unknown-artifact`                                       | Use the artifact identifier from a completed result. An invalid identifier, a missing file, or a removed cache entry returns `404`. |
| A job fails at contact or a work budget                      | Reduce the requested span or sampling and use a physically non-overlapping scenario.                                                |

## Security

Bind the service to `127.0.0.1` unless a separate deployment review establishes an authenticated network boundary. The service has no authentication or authorization layer. Treat request payloads and Arrow artifacts as local data, restrict filesystem access to `.science-cache`, and do not expose its local CORS policy as an access-control mechanism.
