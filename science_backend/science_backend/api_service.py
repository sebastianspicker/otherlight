"""Bounded local job lifecycle with cancellation-linearized publication."""

from __future__ import annotations

import logging
import os
from collections import deque
from collections.abc import Callable
from concurrent.futures import CancelledError, Future, ThreadPoolExecutor
from contextlib import suppress
from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path
from threading import Event, RLock
from time import monotonic
from typing import Any
from uuid import uuid4

from .api_artifacts import write_arrow
from .api_contract import (
    CapabilitySnapshot,
    capability_manifest,
    capability_snapshot,
    forward_request,
    now,
)
from .api_manifest import result_payload
from .canonical_json import canonical_json
from .contracts import MAX_FORWARD_WALL_TIME_SECONDS, ForwardRunRequest
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
from .forward import ForwardRunResult, run_forward

LOGGER = logging.getLogger(__name__)
TERMINAL_JOB_STATES = frozenset({"succeeded", "failed", "cancelled"})
DEFAULT_MAX_OUTSTANDING_JOBS = 8
DEFAULT_MAX_TERMINAL_JOBS = 128
ForwardRunner = Callable[..., ForwardRunResult]
ArtifactWriter = Callable[..., str]
_PUBLIC_FAILURE_CODES = (
    (ContractError, "invalid-contract"),
    (CapabilityUnavailableError, "capability-unavailable"),
    (CollisionDomainError, "collision-domain"),
    (JobCancelledError, "job-cancelled"),
    (JobCapacityError, "job-capacity-exhausted"),
    (JobStateError, "job-state-invalid"),
    (WorkBudgetError, "work-budget-exhausted"),
)


@dataclass(slots=True)
class ApiJob:
    status: dict[str, Any]
    result: dict[str, Any] | None
    cancel_requested: Event
    terminal: Event


class V5ApiService:
    """Own the bounded queue and immutable Arrow artifacts for V5 forward jobs."""

    def __init__(
        self,
        artifact_root: Path = Path(".science-cache"),
        max_workers: int = 1,
        *,
        max_outstanding_jobs: int = DEFAULT_MAX_OUTSTANDING_JOBS,
        max_terminal_jobs: int = DEFAULT_MAX_TERMINAL_JOBS,
        runner: ForwardRunner = run_forward,
        artifact_writer: ArtifactWriter = write_arrow,
        capabilities: CapabilitySnapshot | None = None,
        wall_time_seconds: float = MAX_FORWARD_WALL_TIME_SECONDS,
    ) -> None:
        if max_workers < 1:
            raise ValueError("max_workers must be positive")
        if max_outstanding_jobs < max_workers:
            raise ValueError("max_outstanding_jobs must be at least max_workers")
        if max_terminal_jobs < 1:
            raise ValueError("max_terminal_jobs must be positive")
        self.artifact_root, self.max_outstanding_jobs, self.max_terminal_jobs = (
            artifact_root,
            max_outstanding_jobs,
            max_terminal_jobs,
        )
        self.jobs: dict[str, ApiJob] = {}
        self._futures: dict[str, Future[None]] = {}
        self._terminal_job_ids: deque[str] = deque()
        self._outstanding_jobs, self._closed = 0, False
        self._lock = RLock()
        self._executor = ThreadPoolExecutor(
            max_workers=max_workers, thread_name_prefix="v5-science"
        )
        self._runner, self._artifact_writer = runner, artifact_writer
        self._capabilities, self._wall_time_seconds = (
            capabilities or capability_snapshot(),
            wall_time_seconds,
        )

    def capabilities(self) -> dict[str, Any]:
        return capability_manifest(self._capabilities)

    def submit(self, payload: dict[str, Any]) -> dict[str, Any]:
        if not self._capabilities.forward_available:
            raise CapabilityUnavailableError(
                "forward jobs require both the 'integrator' and 'artifacts' extras"
            )
        with self._lock:
            self._assert_can_submit_locked()
            self._outstanding_jobs += 1
            job_id = f"job-{uuid4()}"
            try:
                request, seed = forward_request(payload)
                fingerprint, started = (
                    sha256(canonical_json(payload).encode("utf-8")).hexdigest(),
                    now(),
                )
                status = {
                    "id": job_id,
                    "kind": "forward",
                    "state": "queued",
                    "submittedAt": started,
                    "updatedAt": started,
                    "progress": 0,
                }
                job = ApiJob(status, None, Event(), Event())
                self.jobs[job_id] = job
                future = self._executor.submit(
                    self._execute, job_id, job, request, seed, fingerprint, started
                )
                self._futures[job_id] = future
                future.add_done_callback(
                    lambda completed, accepted_id=job_id, accepted_job=job: (
                        self._future_done(accepted_id, accepted_job, completed)
                    )
                )
            except Exception:
                self.jobs.pop(job_id, None)
                self._futures.pop(job_id, None)
                self._outstanding_jobs -= 1
                raise
            return dict(status)

    def _assert_can_submit_locked(self) -> None:
        if self._closed:
            raise JobStateError("scientific job service is closed")
        if self._outstanding_jobs >= self.max_outstanding_jobs:
            raise JobCapacityError(
                f"scientific job capacity is exhausted ({self.max_outstanding_jobs} outstanding jobs)"
            )

    def _execute(
        self,
        job_id: str,
        job: ApiJob,
        request: ForwardRunRequest,
        seed: int,
        fingerprint: str,
        started: str,
    ) -> None:
        with self._lock:
            if job.terminal.is_set() or job.cancel_requested.is_set():
                return
            job.status.update(state="running", updatedAt=now(), progress=0)
        deadline = monotonic() + self._wall_time_seconds

        def cancellation_requested() -> bool:
            if job.cancel_requested.is_set():
                return True
            if monotonic() >= deadline:
                raise WorkBudgetError(
                    f"scientific run exceeded {self._wall_time_seconds} seconds"
                )
            return False

        try:
            physical = self._runner(request, cancel_requested=cancellation_requested)
            if not physical.manifest.scientific_result:
                raise ContractError(
                    "HTTP scientific jobs may not return a non-scientific result"
                )
            if job.cancel_requested.is_set():
                raise JobCancelledError("scientific job was cancelled")
            self._artifact_writer(
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

    def _promote_artifact(
        self,
        job_id: str,
        job: ApiJob,
        artifact_id: str,
        temporary: Path,
        destination: Path,
        physical: ForwardRunResult,
        fingerprint: str,
        seed: int,
        started: str,
    ) -> bool:
        with self._lock:
            if job.terminal.is_set() or job.cancel_requested.is_set():
                return False
            os.replace(temporary, destination)
            completed = now()
            job.result = result_payload(
                job_id, artifact_id, physical, fingerprint, seed, started, completed
            )
            job.status.update(state="succeeded", updatedAt=completed, progress=1)
            self._record_terminal_locked(job_id, job)
            return True

    def _record_execution_failure(
        self, job_id: str, job: ApiJob, error: Exception
    ) -> None:
        with self._lock:
            if job.terminal.is_set():
                return
            if job.cancel_requested.is_set() or isinstance(error, JobCancelledError):
                self._mark_cancelled_locked(job_id, job)
            else:
                self._mark_failed_locked(job_id, job, error)

    def _record_terminal_locked(self, job_id: str, job: ApiJob) -> None:
        if job.terminal.is_set():
            return
        job.terminal.set()
        self._terminal_job_ids.append(job_id)
        while len(self._terminal_job_ids) > self.max_terminal_jobs:
            evicted = self.jobs.get(self._terminal_job_ids.popleft())
            if evicted is not None and evicted.terminal.is_set():
                self.jobs.pop(evicted.status["id"], None)

    def _mark_cancelled_locked(self, job_id: str, job: ApiJob) -> None:
        if job.terminal.is_set():
            return
        job.cancel_requested.set()
        job.status.pop("error", None)
        job.status.update(state="cancelled", updatedAt=now(), progress=1)
        job.result = None
        self._record_terminal_locked(job_id, job)

    def _mark_failed_locked(self, job_id: str, job: ApiJob, error: Exception) -> None:
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
            code, message = (
                "internal-scientific-error",
                "an internal scientific error occurred",
            )
        job.result = None
        job.status.update(
            state="failed",
            updatedAt=now(),
            progress=1,
            error={"code": code, "message": message},
        )
        self._record_terminal_locked(job_id, job)

    def _future_done(self, job_id: str, job: ApiJob, future: Future[None]) -> None:
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
            else:
                self._mark_failed_locked(
                    job_id,
                    job,
                    exception
                    if isinstance(exception, Exception)
                    else JobStateError(
                        "scientific worker exited without a terminal job state"
                    ),
                )

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
            future = self._futures.get(job_id)
            if future is not None:
                future.cancel()
            return dict(job.status)

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
            with suppress(CancelledError):
                future.result(
                    timeout=None
                    if deadline is None
                    else max(0.0, deadline - monotonic())
                )
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
