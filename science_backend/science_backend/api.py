"""Optional loopback FastAPI adapter for the browser-facing V5 contract."""

from __future__ import annotations

import logging
import os
import platform
from collections import deque
from collections.abc import Callable
from concurrent.futures import CancelledError, Future, ThreadPoolExecutor
from contextlib import asynccontextmanager, suppress
from dataclasses import dataclass
from datetime import UTC, datetime
from hashlib import sha256
from importlib.util import find_spec
from itertools import pairwise
from math import ceil, floor, isfinite
from pathlib import Path
from tempfile import NamedTemporaryFile
from threading import Event, RLock
from time import monotonic
from typing import Any
from uuid import uuid4

from .__about__ import __version__
from .canonical_json import canonical_json
from .contracts import (
    MAX_FORWARD_BODIES,
    MAX_FORWARD_SAMPLES,
    MAX_FORWARD_WALL_TIME_SECONDS,
    MAX_INTEGRATOR_STEPS,
    Body,
    ForwardRunRequest,
    Observer,
)
from .errors import (
    CapabilityUnavailableError,
    CollisionDomainError,
    ContractError,
    JobCancelledError,
    JobCapacityError,
    JobStateError,
    ScientificBackendError,
    WorkBudgetError,
)
from .forward import run_forward

SCHEMA_VERSION = "v5"
SERVICE_VERSION = __version__
DEFAULT_MAX_OUTSTANDING_JOBS = 8
DEFAULT_MAX_TERMINAL_JOBS = 128
TERMINAL_JOB_STATES = frozenset({"succeeded", "failed", "cancelled"})
ARROW_BATCH_SIZE = 8_192
LOGGER = logging.getLogger(__name__)
_PUBLIC_FAILURE_CODES = (
    (ContractError, "invalid-contract"),
    (CapabilityUnavailableError, "capability-unavailable"),
    (CollisionDomainError, "collision-domain"),
    (JobCancelledError, "job-cancelled"),
    (JobCapacityError, "job-capacity-exhausted"),
    (JobStateError, "job-state-invalid"),
    (WorkBudgetError, "work-budget-exhausted"),
)
BROWSER_CORS_ORIGINS = (
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://127.0.0.1:4173",
    "http://localhost:4173",
    "http://127.0.0.1:4174",
    "http://localhost:4174",
)


def _now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def _capability_available(module: str, attribute: str | None = None) -> bool:
    """Probe the exact public import and callable used by a capability."""

    try:
        specification = find_spec(module)
    except ModuleNotFoundError:
        return False
    if specification is None:
        return False
    if attribute is None:
        return True
    try:
        imported = __import__(module, fromlist=[attribute])
    except ImportError:
        return False
    return callable(getattr(imported, attribute, None))


@dataclass(frozen=True, slots=True)
class _CapabilitySnapshot:
    solve_ivp: bool
    minimize_scalar: bool
    arrow_ipc_new_file: bool

    @property
    def forward_available(self) -> bool:
        return self.solve_ivp and self.minimize_scalar and self.arrow_ipc_new_file


def _capability_snapshot() -> _CapabilitySnapshot:
    return _CapabilitySnapshot(
        solve_ivp=_capability_available("scipy.integrate", "solve_ivp"),
        minimize_scalar=_capability_available("scipy.optimize", "minimize_scalar"),
        arrow_ipc_new_file=_capability_available("pyarrow.ipc", "new_file"),
    )


def capability_manifest(snapshot: _CapabilitySnapshot | None = None) -> dict[str, Any]:
    """Report only end-to-end capabilities, including exact required imports."""

    capabilities = snapshot or _capability_snapshot()
    unavailable = [
        "photometry.research",
        "timing.relativity",
        "inference.parameter-adapter",
        "atmosphere.radiative-transfer",
        "stellar.atmosphere-grid",
    ]
    if not capabilities.solve_ivp or not capabilities.minimize_scalar:
        unavailable.append("dynamics.dop853")
    if not capabilities.arrow_ipc_new_file:
        unavailable.append("artifacts.arrow-ipc")
    return {
        "schemaVersion": SCHEMA_VERSION,
        "serviceVersion": SERVICE_VERSION,
        "generatedAt": _now(),
        "supportedJobKinds": ["forward"] if capabilities.forward_available else [],
        "supportedOutputs": ["radial-velocity"]
        if capabilities.forward_available
        else [],
        "supportedSamplers": [],
        "unavailableModelIds": unavailable,
    }


def _samples(start: float, end: float, cadence: float) -> tuple[float, ...]:
    if cadence <= 0 or end <= start:
        raise ContractError("forward offsets require end > start and cadence > 0")
    span = end - start
    intervals = span / cadence
    if not isfinite(span) or not isfinite(intervals):
        raise ContractError(
            "forward offsets and cadence must produce a finite sample count"
        )
    count = floor(intervals) + 1
    if count > MAX_FORWARD_SAMPLES:
        raise ContractError(
            f"forward jobs support at most {MAX_FORWARD_SAMPLES} samples"
        )
    samples = tuple(start + index * cadence for index in range(count))
    if any(
        not isfinite(sample) or sample <= previous
        for previous, sample in pairwise(samples)
    ):
        raise ContractError(
            "forward sample grid must be strictly increasing and representable as "
            "IEEE-754 double-precision values"
        )
    return samples


def _record(value: Any, path: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ContractError(f"{path} must be an object")
    return value


def _exact_keys(
    value: dict[str, Any],
    path: str,
    required: set[str],
    optional: set[str] | None = None,
) -> None:
    allowed = required | (optional or set())
    missing = sorted(required - value.keys())
    unknown = sorted(value.keys() - allowed)
    if missing:
        raise ContractError(f"{path} is missing required fields: {', '.join(missing)}")
    if unknown:
        raise ContractError(f"{path} contains unsupported fields: {', '.join(unknown)}")


def _string(value: Any, path: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ContractError(f"{path} must be a non-empty string")
    return value


def _number(value: Any, path: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ContractError(f"{path} must be a finite number")
    result = float(value)
    if not (float("-inf") < result < float("inf")):
        raise ContractError(f"{path} must be a finite number")
    return result


def _positive(value: Any, path: str) -> float:
    result = _number(value, path)
    if result <= 0:
        raise ContractError(f"{path} must be positive")
    return result


def _integer(value: Any, path: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or abs(value) > 2**53 - 1:
        raise ContractError(f"{path} must be a JavaScript-safe integer")
    return value


def _vector3(value: Any, path: str) -> tuple[float, float, float]:
    if not isinstance(value, list) or len(value) != 3:
        raise ContractError(f"{path} must contain exactly three finite numbers")
    return (
        _number(value[0], f"{path}[0]"),
        _number(value[1], f"{path}[1]"),
        _number(value[2], f"{path}[2]"),
    )


def _parse_body(value: Any, index: int) -> Body:
    path = f"request.scenario.bodies[{index}]"
    body = _record(value, path)
    _exact_keys(body, path, {"id", "kind", "massKg", "radiusM", "state"})
    kind = body["kind"]
    if kind not in ("star", "planet", "moon", "companion"):
        raise ContractError(f"{path}.kind is unsupported")
    state = _record(body["state"], f"{path}.state")
    _exact_keys(state, f"{path}.state", {"positionM", "velocityMps"})
    return Body(
        id=_string(body["id"], f"{path}.id"),
        kind=kind,
        mass_kg=_positive(body["massKg"], f"{path}.massKg"),
        radius_m=_positive(body["radiusM"], f"{path}.radiusM"),
        position_m=_vector3(state["positionM"], f"{path}.state.positionM"),
        velocity_m_s=_vector3(state["velocityMps"], f"{path}.state.velocityMps"),
    )


def _parse_bodies(value: Any) -> tuple[Body, ...]:
    if not isinstance(value, list) or len(value) < 2:
        raise ContractError("request.scenario.bodies must contain at least two bodies")
    if len(value) > MAX_FORWARD_BODIES:
        raise ContractError(
            f"request.scenario.bodies must contain at most {MAX_FORWARD_BODIES} bodies"
        )
    return tuple(_parse_body(body, index) for index, body in enumerate(value))


def _parse_observer(value: Any) -> Observer:
    path = "request.scenario.observer"
    observer = _record(value, path)
    _exact_keys(observer, path, {"lineOfSight", "targetBodyId"}, {"distanceM"})
    return Observer(
        line_of_sight=_vector3(observer["lineOfSight"], f"{path}.lineOfSight"),
        distance_m=(
            _positive(observer["distanceM"], f"{path}.distanceM")
            if "distanceM" in observer
            else None
        ),
        target_body_id=_string(observer["targetBodyId"], f"{path}.targetBodyId"),
    )


def _parse_integrator(value: Any) -> dict[str, Any]:
    path = "request.scenario.integrator"
    integrator = _record(value, path)
    _exact_keys(
        integrator,
        path,
        {
            "method",
            "positionToleranceM",
            "velocityToleranceMps",
            "relativeTolerance",
            "maxStepSec",
        },
    )
    if integrator["method"] != "DOP853":
        raise ContractError("current V5 backend requires DOP853")
    return integrator


def _forward_request(payload: dict[str, Any]) -> tuple[ForwardRunRequest, int]:
    payload = _record(payload, "request")
    _exact_keys(
        payload,
        "request",
        {
            "kind",
            "scenario",
            "startOffsetSec",
            "endOffsetSec",
            "sampleCadenceSec",
            "outputs",
            "seed",
        },
    )
    if payload["kind"] != "forward":
        raise ContractError("only forward jobs are implemented")
    if payload["outputs"] != ["radial-velocity"]:
        raise ContractError(
            "current V5 backend supports exactly the radial-velocity output"
        )
    scenario = _record(payload["scenario"], "request.scenario")
    _exact_keys(
        scenario,
        "request.scenario",
        {
            "schemaVersion",
            "id",
            "epochJdTdb",
            "timeScale",
            "bodies",
            "observer",
            "integrator",
        },
    )
    if scenario["schemaVersion"] != SCHEMA_VERSION or scenario["timeScale"] != "TDB":
        raise ContractError("scenario must use schema v5 and TDB")
    _string(scenario["id"], "request.scenario.id")
    integrator = _parse_integrator(scenario["integrator"])
    start_offset = _number(payload["startOffsetSec"], "request.startOffsetSec")
    end_offset = _number(payload["endOffsetSec"], "request.endOffsetSec")
    cadence = _positive(payload["sampleCadenceSec"], "request.sampleCadenceSec")
    sample_times = _samples(start_offset, end_offset, cadence)
    max_step = _positive(
        integrator["maxStepSec"], "request.scenario.integrator.maxStepSec"
    )
    positive_step_quotient = max(0.0, end_offset) / max_step
    negative_step_quotient = max(0.0, -start_offset) / max_step
    if not (isfinite(positive_step_quotient) and isfinite(negative_step_quotient)):
        raise ContractError(
            "request.scenario.integrator.maxStepSec and requested span require "
            f"more than {MAX_INTEGRATOR_STEPS} integration steps"
        )
    minimum_steps = ceil(positive_step_quotient) + ceil(negative_step_quotient)
    if minimum_steps > MAX_INTEGRATOR_STEPS:
        raise ContractError(
            "request.scenario.integrator.maxStepSec and requested span require "
            f"more than {MAX_INTEGRATOR_STEPS} integration steps"
        )
    request = ForwardRunRequest(
        bodies=_parse_bodies(scenario["bodies"]),
        sample_times_s=sample_times,
        observer=_parse_observer(scenario["observer"]),
        epoch_jd_tdb=_positive(scenario["epochJdTdb"], "request.scenario.epochJdTdb"),
        execution_mode="research",
        position_tolerance_m=_positive(
            integrator["positionToleranceM"],
            "request.scenario.integrator.positionToleranceM",
        ),
        velocity_tolerance_m_s=_positive(
            integrator["velocityToleranceMps"],
            "request.scenario.integrator.velocityToleranceMps",
        ),
        integrator_rtol=_positive(
            integrator["relativeTolerance"],
            "request.scenario.integrator.relativeTolerance",
        ),
        integrator_max_step_s=max_step,
    )
    return request, _integer(payload["seed"], "request.seed")


ArtifactPromotion = Callable[[str, Path, Path], bool]


def _raise_if_cancelled(cancel_requested: Callable[[], bool] | None) -> None:
    if cancel_requested is not None and cancel_requested():
        raise JobCancelledError("scientific job was cancelled")


def _arrow_modules() -> tuple[Any, Any]:
    try:
        import pyarrow as pa
        import pyarrow.ipc as ipc
    except ImportError as error:
        raise CapabilityUnavailableError(
            "Arrow IPC requires the 'artifacts' extra"
        ) from error
    return pa, ipc


def _arrow_schema(pa: Any) -> Any:
    return pa.schema(
        [
            ("time_offset_s", pa.float64()),
            ("radial_velocity_m_s", pa.float64()),
        ]
    )


def _write_arrow_batches(
    pa: Any,
    ipc: Any,
    result: Any,
    temporary_path: Path,
    cancel_requested: Callable[[], bool] | None,
) -> None:
    schema = _arrow_schema(pa)
    with (
        pa.OSFile(str(temporary_path), "wb") as sink,
        ipc.new_file(sink, schema) as writer,
    ):
        for start in range(0, len(result.samples), ARROW_BATCH_SIZE):
            _raise_if_cancelled(cancel_requested)
            batch = result.samples[start : start + ARROW_BATCH_SIZE]
            writer.write_batch(
                pa.record_batch(
                    [
                        pa.array(
                            (sample.time_offset_s for sample in batch),
                            type=pa.float64(),
                        ),
                        pa.array(
                            (sample.radial_velocity_m_s for sample in batch),
                            type=pa.float64(),
                        ),
                    ],
                    schema=schema,
                )
            )


def _hash_artifact(
    temporary_path: Path, cancel_requested: Callable[[], bool] | None
) -> str:
    digest = sha256()
    with temporary_path.open("rb") as artifact_file:
        while chunk := artifact_file.read(1024 * 1024):
            _raise_if_cancelled(cancel_requested)
            digest.update(chunk)
    return digest.hexdigest()


def _publish_artifact(
    artifact_id: str,
    temporary_path: Path,
    artifact_root: Path,
    cancel_requested: Callable[[], bool] | None,
    promote: ArtifactPromotion | None,
) -> None:
    _raise_if_cancelled(cancel_requested)
    destination = artifact_root / f"{artifact_id}.arrow"
    if promote is not None:
        if not promote(artifact_id, temporary_path, destination):
            raise JobCancelledError("scientific job was cancelled")
    else:
        os.replace(temporary_path, destination)


def _write_arrow(
    result: Any,
    artifact_root: Path,
    *,
    cancel_requested: Callable[[], bool] | None = None,
    promote: ArtifactPromotion | None = None,
) -> str:
    """Stream Arrow IPC to a same-filesystem temporary file, then atomically publish it."""

    pa, ipc = _arrow_modules()
    artifact_root.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(
        dir=artifact_root, prefix=".arrow-", suffix=".tmp", delete=False
    ) as temporary:
        temporary_path = Path(temporary.name)
    try:
        _raise_if_cancelled(cancel_requested)
        _write_arrow_batches(pa, ipc, result, temporary_path, cancel_requested)
        artifact_id = _hash_artifact(temporary_path, cancel_requested)
        _publish_artifact(
            artifact_id, temporary_path, artifact_root, cancel_requested, promote
        )
        return artifact_id
    finally:
        temporary_path.unlink(missing_ok=True)


@dataclass(slots=True)
class _ApiJob:
    status: dict[str, Any]
    result: dict[str, Any] | None
    cancel_requested: Event
    terminal: Event


class V5ApiService:
    """Own the bounded local job queue and immutable Scientific artifacts.

    A lock coordinates capacity, cancellation, and terminal-state retention
    while worker threads perform propagation and atomic Arrow publication.
    """

    def __init__(
        self,
        artifact_root: Path = Path(".science-cache"),
        max_workers: int = 1,
        *,
        max_outstanding_jobs: int = DEFAULT_MAX_OUTSTANDING_JOBS,
        max_terminal_jobs: int = DEFAULT_MAX_TERMINAL_JOBS,
    ) -> None:
        if max_workers < 1:
            raise ValueError("max_workers must be positive")
        if max_outstanding_jobs < max_workers:
            raise ValueError("max_outstanding_jobs must be at least max_workers")
        if max_terminal_jobs < 1:
            raise ValueError("max_terminal_jobs must be positive")
        self.artifact_root = artifact_root
        self.max_outstanding_jobs = max_outstanding_jobs
        self.max_terminal_jobs = max_terminal_jobs
        self.jobs: dict[str, _ApiJob] = {}
        self._futures: dict[str, Future[None]] = {}
        self._terminal_job_ids: deque[str] = deque()
        self._outstanding_jobs = 0
        self._closed = False
        self._lock = RLock()
        self._executor = ThreadPoolExecutor(
            max_workers=max_workers, thread_name_prefix="v5-science"
        )
        self._capabilities = _capability_snapshot()

    def capabilities(self) -> dict[str, Any]:
        return capability_manifest(self._capabilities)

    def submit(self, payload: dict[str, Any]) -> dict[str, Any]:
        if not self._capabilities.forward_available:
            raise CapabilityUnavailableError(
                "forward jobs require both the 'integrator' and 'artifacts' extras"
            )
        with self._lock:
            if self._closed:
                raise JobStateError("scientific job service is closed")
            if self._outstanding_jobs >= self.max_outstanding_jobs:
                raise JobCapacityError(
                    "scientific job capacity is exhausted "
                    f"({self.max_outstanding_jobs} outstanding jobs)"
                )

            # Reserve before materializing the sample grid. Concurrent submissions
            # therefore cannot allocate work beyond the configured bound.
            self._outstanding_jobs += 1
            job_id = f"job-{uuid4()}"
            try:
                request, seed = _forward_request(payload)
                fingerprint = sha256(
                    canonical_json(payload).encode("utf-8")
                ).hexdigest()
                started = _now()
                status = {
                    "id": job_id,
                    "kind": "forward",
                    "state": "queued",
                    "submittedAt": started,
                    "updatedAt": started,
                    "progress": 0,
                }
                job = _ApiJob(status, None, Event(), Event())
                self.jobs[job_id] = job
                future = self._executor.submit(
                    self._execute,
                    job_id,
                    job,
                    request,
                    seed,
                    fingerprint,
                    started,
                )
                self._futures[job_id] = future
                future.add_done_callback(
                    lambda completed, accepted_id=job_id, accepted_job=job: (
                        self._future_done(
                            accepted_id,
                            accepted_job,
                            completed,
                        )
                    )
                )
            except Exception:
                self.jobs.pop(job_id, None)
                self._futures.pop(job_id, None)
                self._outstanding_jobs -= 1
                raise
            return dict(status)

    def _execute(
        self,
        job_id: str,
        job: _ApiJob,
        request: ForwardRunRequest,
        seed: int,
        fingerprint: str,
        started: str,
    ) -> None:
        with self._lock:
            if job.terminal.is_set() or job.cancel_requested.is_set():
                return
            job.status.update(state="running", updatedAt=_now(), progress=0)
        deadline = monotonic() + MAX_FORWARD_WALL_TIME_SECONDS

        def cancellation_requested() -> bool:
            if job.cancel_requested.is_set():
                return True
            if monotonic() >= deadline:
                raise WorkBudgetError(
                    f"scientific run exceeded {MAX_FORWARD_WALL_TIME_SECONDS} seconds"
                )
            return False

        try:
            physical = run_forward(request, cancel_requested=cancellation_requested)
            if not physical.manifest.scientific_result:
                raise ContractError(
                    "HTTP scientific jobs may not return a non-scientific result"
                )
            if job.cancel_requested.is_set():
                raise JobCancelledError("scientific job was cancelled")
        except Exception as error:
            self._record_execution_failure(job_id, job, error)
            return

        try:
            _write_arrow(
                physical,
                self.artifact_root,
                cancel_requested=cancellation_requested,
                promote=lambda artifact_id, temporary, destination: (
                    self._promote_artifact(
                        job_id,
                        job,
                        artifact_id,
                        temporary,
                        destination,
                        physical,
                        fingerprint,
                        seed,
                        started,
                    )
                ),
            )
        except Exception as error:
            self._record_execution_failure(job_id, job, error)

    def _record_execution_failure(
        self, job_id: str, job: _ApiJob, error: Exception
    ) -> None:
        with self._lock:
            if job.terminal.is_set():
                return
            if job.cancel_requested.is_set() or isinstance(error, JobCancelledError):
                self._mark_cancelled_locked(job_id, job)
            else:
                self._mark_failed_locked(job_id, job, error)

    def _promote_artifact(
        self,
        job_id: str,
        job: _ApiJob,
        artifact_id: str,
        temporary: Path,
        destination: Path,
        physical: Any,
        fingerprint: str,
        seed: int,
        started: str,
    ) -> bool:
        """Publish and mark success in one cancellation-linearized critical section."""

        with self._lock:
            if job.terminal.is_set() or job.cancel_requested.is_set():
                return False
            os.replace(temporary, destination)
            completed = _now()
            job.result = self._result_payload(
                job_id, artifact_id, physical, fingerprint, seed, started, completed
            )
            job.status.update(state="succeeded", updatedAt=completed, progress=1)
            self._record_terminal_locked(job_id, job)
            return True

    @staticmethod
    def _result_payload(
        job_id: str,
        artifact_id: str,
        physical: Any,
        fingerprint: str,
        seed: int,
        started: str,
        completed: str,
    ) -> dict[str, Any]:
        manifest = physical.manifest
        return {
            "kind": "forward",
            "arrowArtifactId": artifact_id,
            "runManifest": {
                "schemaVersion": "science-run-manifest-v2",
                "runId": job_id,
                "inputHashSha256": fingerprint,
                "scientificResult": True,
                "implementation": {
                    "application": {
                        "name": "otherlight-science-backend",
                        "version": SERVICE_VERSION,
                        "build": os.environ.get("OTHERLIGHT_BUILD", SERVICE_VERSION),
                    },
                    "engine": {
                        "kind": "python-scipy",
                        "name": "DOP853",
                        "version": manifest.software_versions["scipy"],
                    },
                    "runtime": {
                        "name": "Python",
                        "version": manifest.software_versions["python"],
                    },
                    "artifactWriter": {
                        "name": "PyArrow",
                        "version": manifest.software_versions["pyarrow"],
                    },
                    "platform": {
                        "os": platform.system() or "unknown",
                        "architecture": platform.machine() or "unknown",
                    },
                },
                "gravitationalConstantM3KgS2": manifest.constants["G_SI"],
                "epochJdTdb": manifest.epoch_jd_tdb,
                "startedAt": started,
                "completedAt": completed,
                "capabilityManifestVersion": SERVICE_VERSION,
                "modelVersions": [
                    {"id": model_id, "version": version}
                    for model_id, version in manifest.model_versions.items()
                ],
                "numericalTolerances": manifest.numerical_tolerances,
                "datasets": [],
                "validityDomain": list(manifest.validity_domain),
                "warnings": list(manifest.warnings),
                "randomSeed": seed,
                "artifact": {
                    "idSha256": artifact_id,
                    "format": "arrow-ipc-file",
                    "schemaVersion": "radial-velocity-v1",
                    "rowCount": len(physical.samples),
                },
            },
        }

    def _record_terminal_locked(self, job_id: str, job: _ApiJob) -> None:
        if job.terminal.is_set():
            return
        job.terminal.set()
        self._terminal_job_ids.append(job_id)
        while len(self._terminal_job_ids) > self.max_terminal_jobs:
            evicted_id = self._terminal_job_ids.popleft()
            evicted = self.jobs.get(evicted_id)
            if evicted is not None and evicted.terminal.is_set():
                self.jobs.pop(evicted_id, None)

    def _mark_cancelled_locked(self, job_id: str, job: _ApiJob) -> None:
        if job.terminal.is_set():
            return
        job.cancel_requested.set()
        job.status.pop("error", None)
        job.status.update(state="cancelled", updatedAt=_now(), progress=1)
        job.result = None
        self._record_terminal_locked(job_id, job)

    def _mark_failed_locked(self, job_id: str, job: _ApiJob, error: Exception) -> None:
        if job.terminal.is_set():
            return
        if isinstance(error, ScientificBackendError):
            code = next(
                code
                for error_type, code in _PUBLIC_FAILURE_CODES
                if isinstance(error, error_type)
            )
            message = str(error)
        else:
            LOGGER.error(
                "unexpected scientific worker failure",
                exc_info=(type(error), error, error.__traceback__),
            )
            code = "internal-scientific-error"
            message = "an internal scientific error occurred"
        job.result = None
        job.status.update(
            state="failed",
            updatedAt=_now(),
            progress=1,
            error={"code": code, "message": message},
        )
        self._record_terminal_locked(job_id, job)

    def _future_done(
        self,
        job_id: str,
        job: _ApiJob,
        future: Future[None],
    ) -> None:
        exception: BaseException | None = None
        if not future.cancelled():
            with suppress(CancelledError):
                exception = future.exception()
        with self._lock:
            self._futures.pop(job_id, None)
            self._outstanding_jobs -= 1
            if job.terminal.is_set():
                return
            if future.cancelled() or job.cancel_requested.is_set():
                self._mark_cancelled_locked(job_id, job)
                return
            error = (
                exception
                if isinstance(exception, Exception)
                else JobStateError(
                    "scientific worker exited without a terminal job state"
                )
            )
            self._mark_failed_locked(job_id, job, error)

    def status(self, job_id: str) -> dict[str, Any]:
        with self._lock:
            if job_id not in self.jobs:
                raise KeyError(job_id)
            return dict(self.jobs[job_id].status)

    def result(self, job_id: str) -> dict[str, Any] | None:
        with self._lock:
            if job_id not in self.jobs:
                raise KeyError(job_id)
            return self.jobs[job_id].result

    def cancel(self, job_id: str) -> dict[str, Any]:
        with self._lock:
            if job_id not in self.jobs:
                raise KeyError(job_id)
            job = self.jobs[job_id]
            if job.status["state"] in TERMINAL_JOB_STATES:
                raise RuntimeError("job is already terminal")
            self._mark_cancelled_locked(job_id, job)
            status = dict(job.status)
            future = self._futures.get(job_id)
            if future is not None:
                future.cancel()
            return status

    def wait_for_terminal(
        self, job_id: str, timeout: float | None = None
    ) -> dict[str, Any]:
        with self._lock:
            if job_id not in self.jobs:
                raise KeyError(job_id)
            job = self.jobs[job_id]
        deadline = None if timeout is None else monotonic() + timeout
        if not job.terminal.wait(timeout):
            raise TimeoutError(f"job {job_id} did not reach a terminal state")
        with self._lock:
            future = self._futures.get(job_id)
        if future is not None:
            remaining = None if deadline is None else max(0.0, deadline - monotonic())
            with suppress(CancelledError):
                future.result(timeout=remaining)
        return dict(job.status)

    def close(self) -> None:
        with self._lock:
            if self._closed:
                return
            self._closed = True
            for job_id, job in list(self.jobs.items()):
                if job.status["state"] not in TERMINAL_JOB_STATES:
                    self._mark_cancelled_locked(job_id, job)
        self._executor.shutdown(wait=True, cancel_futures=True)


def _error(
    code: str, message: str, status_code: int, *, headers: dict[str, str] | None = None
):
    from fastapi.responses import JSONResponse

    return JSONResponse(
        status_code=status_code,
        content={"code": code, "message": message},
        headers=headers,
    )


def _fastapi_dependencies() -> tuple[Any, Any, Any, Any]:
    try:
        from fastapi import FastAPI
        from fastapi.exceptions import RequestValidationError
        from fastapi.middleware.cors import CORSMiddleware
        from fastapi.responses import FileResponse
    except ImportError as error:
        raise CapabilityUnavailableError(
            "HTTP service requires the 'service' extra (fastapi and uvicorn)"
        ) from error
    return FastAPI, RequestValidationError, CORSMiddleware, FileResponse


def _lifespan(jobs: V5ApiService, owns_service: bool) -> Callable[..., Any]:
    @asynccontextmanager
    async def lifespan(_: Any):
        try:
            yield
        finally:
            if owns_service:
                jobs.close()

    return lifespan


def _register_error_handlers(app: Any, validation_type: Any) -> None:
    @app.exception_handler(ContractError)
    async def contract_error(_: Any, error: ContractError):
        return _error("invalid-contract", str(error), 422)

    @app.exception_handler(CapabilityUnavailableError)
    async def capability_error(_: Any, error: CapabilityUnavailableError):
        return _error("capability-unavailable", str(error), 503)

    @app.exception_handler(JobCapacityError)
    async def job_capacity_error(_: Any, error: JobCapacityError):
        return _error(
            "job-capacity-exhausted", str(error), 429, headers={"Retry-After": "1"}
        )

    @app.exception_handler(validation_type)
    async def validation_error(_: Any, _error_details: Any):
        return _error("invalid-contract", "request body is invalid", 422)

    @app.exception_handler(Exception)
    async def unexpected_error(_: Any, unexpected: Exception):
        LOGGER.error(
            "unexpected HTTP scientific backend failure",
            exc_info=(type(unexpected), unexpected, unexpected.__traceback__),
        )
        return _error(
            "internal-scientific-error", "an internal scientific error occurred", 500
        )


def _register_job_routes(app: Any, jobs: V5ApiService) -> None:
    @app.get("/v1/jobs/{job_id}")
    def status(job_id: str):
        try:
            return jobs.status(job_id)
        except KeyError:
            return _error("unknown-job", "unknown job", 404)

    @app.get("/v1/jobs/{job_id}/result")
    def result(job_id: str):
        try:
            completed_result = jobs.result(job_id)
        except KeyError:
            return _error("unknown-job", "unknown job", 404)
        if completed_result is None:
            return _error("job-not-completed", "job has no completed result", 409)
        return completed_result

    @app.delete("/v1/jobs/{job_id}")
    def cancel(job_id: str):
        try:
            return jobs.cancel(job_id)
        except KeyError:
            return _error("unknown-job", "unknown job", 404)
        except RuntimeError:
            return _error("job-already-terminal", "job is already terminal", 409)


def _register_base_routes(app: Any, jobs: V5ApiService, file_response: Any) -> None:
    @app.get("/v1/capabilities")
    def capabilities():
        return jobs.capabilities()

    @app.post("/v1/jobs", status_code=201)
    def submit(payload: dict[str, Any]):
        return jobs.submit(payload)

    @app.get("/v1/artifacts/{artifact_id}")
    def artifact(artifact_id: str):
        valid_id = len(artifact_id) == 64 and all(
            character in "0123456789abcdef" for character in artifact_id
        )
        if not valid_id:
            return _error("unknown-artifact", "unknown artifact", 404)
        path = jobs.artifact_root / f"{artifact_id}.arrow"
        if not path.is_file():
            return _error("unknown-artifact", "unknown artifact", 404)
        return file_response(path, media_type="application/vnd.apache.arrow.file")


def create_app(service: V5ApiService | None = None):
    fastapi, request_validation_error, cors_middleware, file_response = (
        _fastapi_dependencies()
    )

    owns_service = service is None
    jobs = service if service is not None else V5ApiService()
    app = fastapi(
        title="Otherlight local science backend",
        version=SERVICE_VERSION,
        lifespan=_lifespan(jobs, owns_service),
    )
    app.add_middleware(
        cors_middleware,
        allow_origins=list(BROWSER_CORS_ORIGINS),
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["accept", "content-type"],
    )

    _register_error_handlers(app, request_validation_error)
    _register_base_routes(app, jobs, file_response)
    _register_job_routes(app, jobs)

    return app
