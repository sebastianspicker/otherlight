"""Shared immutable result types and bounded execution accounting."""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from math import isfinite
from time import monotonic
from typing import Protocol

from .contracts import (
    MAX_FORWARD_WALL_TIME_SECONDS,
    MAX_INTEGRATOR_STEPS,
    MAX_RHS_EVALUATIONS,
    Vector3,
)
from .errors import JobCancelledError, WorkBudgetError

CancellationCheck = Callable[[], bool]


class DenseSolution(Protocol):
    def __call__(self, time: float) -> Sequence[float]: ...


class OdeSolution(Protocol):
    success: bool
    message: str
    sol: DenseSolution | None
    t: Sequence[float]
    t_events: Sequence[Sequence[float]]


class OptimizerResult(Protocol):
    success: bool
    fun: float
    x: float


class SciPyEvent(Protocol):
    def __call__(self, time: float, state: Sequence[float]) -> float: ...


@dataclass(slots=True)
class WorkBudget:
    """Count solver work independently of solver-specific diagnostics."""

    started_at: float
    rhs_evaluations: int = 0
    accepted_steps: int = 0

    @classmethod
    def start(cls) -> WorkBudget:
        return cls(monotonic())

    def check_elapsed(self) -> None:
        if monotonic() - self.started_at >= MAX_FORWARD_WALL_TIME_SECONDS:
            raise WorkBudgetError(
                f"scientific run exceeded {MAX_FORWARD_WALL_TIME_SECONDS} seconds"
            )

    def record_rhs_evaluation(self) -> None:
        self.check_elapsed()
        self.rhs_evaluations += 1
        if self.rhs_evaluations > MAX_RHS_EVALUATIONS:
            raise WorkBudgetError(
                f"scientific run exceeded {MAX_RHS_EVALUATIONS} RHS evaluations"
            )

    def record_accepted_steps(self, count: int) -> None:
        self.check_elapsed()
        self.accepted_steps += count
        if self.accepted_steps > MAX_INTEGRATOR_STEPS:
            raise WorkBudgetError(
                f"scientific run exceeded {MAX_INTEGRATOR_STEPS} accepted steps"
            )


@dataclass(frozen=True, slots=True)
class ForwardSample:
    time_offset_s: float
    positions_m: dict[str, Vector3]
    velocities_m_s: dict[str, Vector3]
    radial_velocity_m_s: float
    photocentre_offset_m: Vector3 | None
    photocentre_offset_rad: Vector3 | None


@dataclass(frozen=True, slots=True)
class RunManifest:
    schema_version: str
    request_sha256: str
    execution_mode: str
    engine: str
    scientific_result: bool
    coordinate_system: str
    time_scale: str
    epoch_jd_tdb: float
    constants: dict[str, float]
    software_versions: dict[str, str]
    model_versions: dict[str, str]
    numerical_tolerances: dict[str, float]
    datasets: dict[str, str]
    validity_domain: tuple[str, ...]
    warnings: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class ForwardRunResult:
    samples: tuple[ForwardSample, ...]
    manifest: RunManifest


def raise_if_cancelled(cancel_requested: CancellationCheck | None) -> None:
    if cancel_requested is not None and cancel_requested():
        raise JobCancelledError("scientific job was cancelled")


def finite_state(state: Sequence[float], message: str) -> None:
    if not all(isfinite(float(value)) for value in state):
        from .errors import CapabilityUnavailableError

        raise CapabilityUnavailableError(message)
