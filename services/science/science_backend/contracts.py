"""Schema-aligned immutable contracts for local scientific jobs.

All Cartesian positions and velocities are barycentric SI values. A request
must declare whether it uses the dependency-required ``research`` engine mode
or the test engine mode. The historical internal name ``research`` selects the
SciPy/DOP853 path; it does not assert independent research validation. A
test-only analytic fallback is intentionally never returned as bounded
scientific output.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import asdict, dataclass
from hashlib import sha256
from math import isfinite, sqrt
from sys import float_info
from typing import Literal

from .canonical_json import canonical_json
from .errors import ContractError

Vector3 = tuple[float, float, float]
# CODATA 2022 central value [m^3 kg^-1 s^-2].
G_SI = 6.67430e-11
MIN_RELATIVE_TOLERANCE = 100 * float_info.epsilon
MAX_FORWARD_SAMPLES = 100_000
MAX_FORWARD_BODIES = 3
MAX_INTEGRATOR_STEPS = 500_000
MAX_RHS_EVALUATIONS = 8_000_000
MAX_FORWARD_WALL_TIME_SECONDS = 60
BARYCENTRE_RELATIVE_TOLERANCE = 1e-12
BARYCENTRE_POSITION_FLOOR_M = 1e-3
BARYCENTRE_VELOCITY_FLOOR_M_S = 1e-9
BodyKind = Literal["star", "planet", "moon", "companion"]


def _vector3(value: Sequence[float], field_name: str) -> Vector3:
    if len(value) != 3 or not all(isfinite(float(component)) for component in value):
        raise ContractError(f"{field_name} must contain exactly three finite values")
    return (float(value[0]), float(value[1]), float(value[2]))


@dataclass(frozen=True, slots=True)
class Body:
    """A finite-radius mass in the canonical barycentric Cartesian state."""

    id: str
    kind: BodyKind
    mass_kg: float
    radius_m: float
    position_m: Vector3
    velocity_m_s: Vector3
    luminosity_w: float | None = None

    def __post_init__(self) -> None:
        if not self.id:
            raise ContractError("body.id must not be empty")
        if self.kind not in ("star", "planet", "moon", "companion"):
            raise ContractError(f"body {self.id!r} kind is unsupported")
        if not isfinite(self.mass_kg) or self.mass_kg <= 0:
            raise ContractError(f"body {self.id!r} mass_kg must be finite and positive")
        if not isfinite(self.radius_m) or self.radius_m <= 0:
            raise ContractError(
                f"body {self.id!r} radius_m must be finite and positive"
            )
        object.__setattr__(self, "position_m", _vector3(self.position_m, "position_m"))
        object.__setattr__(
            self, "velocity_m_s", _vector3(self.velocity_m_s, "velocity_m_s")
        )
        if self.luminosity_w is not None and (
            not isfinite(self.luminosity_w) or self.luminosity_w < 0
        ):
            raise ContractError(
                "luminosity_w must be finite and non-negative when supplied"
            )


@dataclass(frozen=True, slots=True)
class Observer:
    """Observer geometry; line of sight points from the system toward observer."""

    target_body_id: str
    line_of_sight: Vector3 = (0.0, 0.0, 1.0)
    distance_m: float | None = None

    def __post_init__(self) -> None:
        if not self.target_body_id:
            raise ContractError("observer.target_body_id must not be empty")
        los = _vector3(self.line_of_sight, "line_of_sight")
        norm_sq = sum(component * component for component in los)
        if norm_sq == 0:
            raise ContractError("line_of_sight must be non-zero")
        norm = norm_sq**0.5
        if abs(norm - 1.0) > 1e-12:
            raise ContractError("line_of_sight must be a unit vector within 1e-12")
        object.__setattr__(self, "line_of_sight", los)
        if self.distance_m is not None and (
            not isfinite(self.distance_m) or self.distance_m <= 0
        ):
            raise ContractError("distance_m must be finite and positive when supplied")


ExecutionMode = Literal["research", "test"]


@dataclass(frozen=True, slots=True)
class ForwardRunRequest:
    """A deterministic Newtonian forward-model request.

    In internal ``research`` engine mode SciPy/DOP853 is required. ``test``
    mode may opt in to an exact circular two-body fallback solely to test data
    plumbing. The engine-mode name is not an evidence classification.
    """

    bodies: Sequence[Body]
    sample_times_s: Sequence[float]
    observer: Observer
    epoch_jd_tdb: float
    execution_mode: ExecutionMode = "research"
    allow_analytic_two_body_test_fallback: bool = False
    integrator_rtol: float = 1e-11
    position_tolerance_m: float = 1e-3
    velocity_tolerance_m_s: float = 1e-6
    integrator_max_step_s: float = 3600.0

    def __post_init__(self) -> None:
        bodies = tuple(self.bodies)
        times = tuple(float(value) for value in self.sample_times_s)
        object.__setattr__(self, "bodies", bodies)
        object.__setattr__(self, "sample_times_s", times)
        _validate_bodies(bodies)
        _validate_times(times)
        _validate_forward_settings(self)


def _norm(vector: Vector3) -> float:
    return sqrt(sum(component * component for component in vector))


def _validate_bodies(bodies: tuple[Body, ...]) -> None:
    if len(bodies) < 2:
        raise ContractError("forward runs require at least two bodies")
    if len(bodies) > MAX_FORWARD_BODIES:
        raise ContractError(f"forward runs support at most {MAX_FORWARD_BODIES} bodies")
    if len({body.id for body in bodies}) != len(bodies):
        raise ContractError("body ids must be unique")


def _validate_times(times: tuple[float, ...]) -> None:
    if not times:
        raise ContractError("sample_times_s must not be empty")
    if len(times) > MAX_FORWARD_SAMPLES:
        raise ContractError(
            f"sample_times_s must contain at most {MAX_FORWARD_SAMPLES} values"
        )
    if not all(isfinite(value) for value in times):
        raise ContractError("sample_times_s must be finite")
    if len(set(times)) != len(times):
        raise ContractError("sample_times_s must be unique")


def _validate_forward_settings(request: ForwardRunRequest) -> None:
    if not isfinite(request.epoch_jd_tdb) or request.epoch_jd_tdb <= 0:
        raise ContractError("epoch_jd_tdb must be finite and positive")
    _validate_execution_mode(request)
    _validate_integrator_settings(request)
    _validate_observer_and_state(request)


def _validate_execution_mode(request: ForwardRunRequest) -> None:
    if request.execution_mode not in ("research", "test"):
        raise ContractError("execution_mode must be 'research' or 'test'")
    if (
        request.allow_analytic_two_body_test_fallback
        and request.execution_mode != "test"
    ):
        raise ContractError("analytic two-body fallback is permitted only in test mode")


def _validate_integrator_settings(request: ForwardRunRequest) -> None:
    if not MIN_RELATIVE_TOLERANCE <= request.integrator_rtol < 1 or not isfinite(
        request.integrator_rtol
    ):
        raise ContractError(
            f"integrator_rtol must be finite and in [{MIN_RELATIVE_TOLERANCE}, 1)"
        )
    for value, field_name in (
        (request.position_tolerance_m, "position_tolerance_m"),
        (request.velocity_tolerance_m_s, "velocity_tolerance_m_s"),
        (request.integrator_max_step_s, "integrator_max_step_s"),
    ):
        if not isfinite(value) or value <= 0:
            raise ContractError(f"{field_name} must be finite and positive")


def _validate_observer_and_state(request: ForwardRunRequest) -> None:
    if request.observer.target_body_id not in {body.id for body in request.bodies}:
        raise ContractError("observer.target_body_id must identify a body")
    _assert_barycentric_state(request.bodies)
    _assert_no_initial_overlaps(request.bodies)


def _mass_weighted_residual(bodies: Sequence[Body], field_name: str) -> Vector3:
    return tuple(
        sum(body.mass_kg * getattr(body, field_name)[axis] for body in bodies)
        for axis in range(3)
    )  # type: ignore[return-value]


def _assert_barycentric_state(bodies: Sequence[Body]) -> None:
    total_mass = sum(body.mass_kg for body in bodies)
    if not isfinite(total_mass):
        raise ContractError("system total mass must be finite")
    position_residual_m = (
        _norm(_mass_weighted_residual(bodies, "position_m")) / total_mass
    )
    momentum_residual_m_s = (
        _norm(_mass_weighted_residual(bodies, "velocity_m_s")) / total_mass
    )
    position_scale_m = max(_norm(body.position_m) for body in bodies)
    velocity_scale_m_s = max(_norm(body.velocity_m_s) for body in bodies)
    position_limit_m = max(
        BARYCENTRE_POSITION_FLOOR_M,
        BARYCENTRE_RELATIVE_TOLERANCE * position_scale_m,
    )
    velocity_limit_m_s = max(
        BARYCENTRE_VELOCITY_FLOOR_M_S,
        BARYCENTRE_RELATIVE_TOLERANCE * velocity_scale_m_s,
    )
    if not isfinite(position_residual_m) or position_residual_m > position_limit_m:
        raise ContractError(
            "initial state is not barycentric in position: "
            f"offset {position_residual_m} m exceeds {position_limit_m} m"
        )
    if (
        not isfinite(momentum_residual_m_s)
        or momentum_residual_m_s > velocity_limit_m_s
    ):
        raise ContractError(
            "initial state does not have zero total momentum: "
            f"centre-of-mass speed {momentum_residual_m_s} m/s exceeds {velocity_limit_m_s} m/s"
        )


def _assert_no_initial_overlaps(bodies: Sequence[Body]) -> None:
    for left_index, left in enumerate(bodies):
        for right in bodies[left_index + 1 :]:
            separation_m = _norm(
                tuple(
                    right.position_m[axis] - left.position_m[axis] for axis in range(3)
                )  # type: ignore[arg-type]
            )
            contact_m = left.radius_m + right.radius_m
            if separation_m <= contact_m:
                raise ContractError(
                    f"initial finite-radius overlap/contact between {left.id!r} and {right.id!r}: "
                    f"separation {separation_m} m <= {contact_m} m"
                )


@dataclass(frozen=True, slots=True)
class ReducedObservation:
    value: float
    model_value: float
    sigma: float | None = None

    def __post_init__(self) -> None:
        if not (isfinite(self.value) and isfinite(self.model_value)):
            raise ContractError("observation and model values must be finite")
        if self.sigma is not None and (not isfinite(self.sigma) or self.sigma <= 0):
            raise ContractError("sigma must be finite and positive when supplied")


@dataclass(frozen=True, slots=True)
class InferenceRequest:
    """Reduced-data Gaussian likelihood request, diagonal or full covariance."""

    observations: Sequence[ReducedObservation]
    covariance: Sequence[Sequence[float]] | None = None
    sampler: str | None = None
    seed: int = 0

    def __post_init__(self) -> None:
        observations = tuple(self.observations)
        covariance = _canonical_covariance(self.covariance)
        object.__setattr__(self, "observations", observations)
        object.__setattr__(self, "covariance", covariance)
        _validate_inference_request(observations, covariance)


def _canonical_covariance(
    covariance: Sequence[Sequence[float]] | None,
) -> tuple[tuple[float, ...], ...] | None:
    if covariance is None:
        return None
    return tuple(tuple(float(value) for value in row) for row in covariance)


def _validate_inference_request(
    observations: tuple[ReducedObservation, ...],
    covariance: tuple[tuple[float, ...], ...] | None,
) -> None:
    if not observations:
        raise ContractError("at least one reduced observation is required")
    if covariance is None:
        if any(observation.sigma is None for observation in observations):
            raise ContractError(
                "diagonal likelihood requires sigma for every observation"
            )
        return
    size = len(observations)
    if len(covariance) != size or any(len(row) != size for row in covariance):
        raise ContractError("covariance must be square and match observations")
    if any(not isfinite(value) for row in covariance for value in row):
        raise ContractError("covariance must contain finite values")


def request_fingerprint(request: ForwardRunRequest | InferenceRequest) -> str:
    """Stable SHA-256 provenance hash for an immutable request."""

    encoded = canonical_json(asdict(request))
    return sha256(encoded.encode("utf-8")).hexdigest()
