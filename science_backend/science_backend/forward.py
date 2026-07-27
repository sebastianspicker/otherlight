"""Deterministic barycentric Newtonian forward propagation."""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from importlib.metadata import PackageNotFoundError, version
from itertools import pairwise
from math import cos, isclose, isfinite, sin, sqrt
from platform import python_version
from time import monotonic
from typing import Protocol, cast

from .contracts import (
    G_SI,
    MAX_FORWARD_WALL_TIME_SECONDS,
    MAX_INTEGRATOR_STEPS,
    MAX_RHS_EVALUATIONS,
    Body,
    ForwardRunRequest,
    Vector3,
    request_fingerprint,
)
from .errors import (
    CapabilityUnavailableError,
    CollisionDomainError,
    ContractError,
    JobCancelledError,
    WorkBudgetError,
)

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
    message: str
    fun: float
    x: float


class SciPyEvent(Protocol):
    terminal: bool
    direction: float

    def __call__(self, time: float, state: Sequence[float]) -> float: ...


@dataclass(slots=True)
class _WorkBudget:
    started: float
    rhs_evaluations: int = 0
    accepted_steps: int = 0

    @classmethod
    def start(cls) -> _WorkBudget:
        return cls(monotonic())

    def check_elapsed(self) -> None:
        if monotonic() - self.started > MAX_FORWARD_WALL_TIME_SECONDS:
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
class _ContactEvent:
    bodies: tuple[Body, ...]
    left_index: int
    right_index: int
    terminal: bool = True
    direction: float = 0.0

    def __call__(self, _: float, state: Sequence[float]) -> float:
        left = _state_vector(state, self.left_index * 6)
        right = _state_vector(state, self.right_index * 6)
        return _norm(_subtract(right, left)) - (
            self.bodies[self.left_index].radius_m
            + self.bodies[self.right_index].radius_m
        )


def _raise_if_cancelled(cancel_requested: CancellationCheck | None) -> None:
    if cancel_requested is not None and cancel_requested():
        raise JobCancelledError("scientific job was cancelled")


def _add(a: Vector3, b: Vector3) -> Vector3:
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def _subtract(a: Vector3, b: Vector3) -> Vector3:
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _scale(a: Vector3, scalar: float) -> Vector3:
    return (a[0] * scalar, a[1] * scalar, a[2] * scalar)


def _dot(a: Vector3, b: Vector3) -> float:
    return sum(left * right for left, right in zip(a, b, strict=True))


def _norm(a: Vector3) -> float:
    return sqrt(_dot(a, a))


def _state_vector(state: Sequence[float], start: int) -> Vector3:
    return (float(state[start]), float(state[start + 1]), float(state[start + 2]))


@dataclass(frozen=True, slots=True)
class ForwardSample:
    time_offset_s: float
    positions_m: dict[str, Vector3]
    velocities_m_s: dict[str, Vector3]
    radial_velocity_m_s: float | None
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


def _assert_dense_solution_avoids_contact(
    bodies: tuple[Body, ...],
    solution: OdeSolution,
    minimize_scalar: Callable[..., OptimizerResult],
    cancel_requested: CancellationCheck | None,
    work_budget: _WorkBudget | None = None,
) -> None:
    """Check every accepted DOP853 step, including fast in-and-out encounters."""

    dense_solution = solution.sol
    if dense_solution is None:
        raise CapabilityUnavailableError(
            "DOP853 did not provide the required dense solution"
        )
    budget = work_budget or _WorkBudget.start()
    subdivisions = 16
    for raw_left, raw_right in pairwise(solution.t):
        _raise_if_cancelled(cancel_requested)
        budget.check_elapsed()
        interval_left, interval_right = sorted((float(raw_left), float(raw_right)))
        if interval_left == interval_right:
            continue
        boundaries = [
            interval_left + (interval_right - interval_left) * index / subdivisions
            for index in range(subdivisions + 1)
        ]
        for left_index in range(len(bodies)):
            for right_index in range(left_index + 1, len(bodies)):
                contact_squared = (
                    bodies[left_index].radius_m + bodies[right_index].radius_m
                ) ** 2

                for segment_left, segment_right in pairwise(boundaries):
                    minimum_squared, minimum_time = _minimum_separation_squared(
                        dense_solution,
                        left_index,
                        right_index,
                        segment_left,
                        segment_right,
                        minimize_scalar,
                        cancel_requested,
                        budget,
                    )
                    if minimum_squared <= contact_squared:
                        raise CollisionDomainError(
                            f"finite-radius contact between {bodies[left_index].id!r} and "
                            f"{bodies[right_index].id!r} at offset {minimum_time} s"
                        )


def _minimum_separation_squared(
    dense_solution: DenseSolution,
    left_index: int,
    right_index: int,
    segment_left: float,
    segment_right: float,
    minimize_scalar: Callable[..., OptimizerResult],
    cancel_requested: CancellationCheck | None,
    budget: _WorkBudget,
) -> tuple[float, float]:
    def separation_squared(time: float) -> float:
        _raise_if_cancelled(cancel_requested)
        state = dense_solution(time)
        squared = sum(
            (
                float(state[right_index * 6 + axis])
                - float(state[left_index * 6 + axis])
            )
            ** 2
            for axis in range(3)
        )
        if not isfinite(squared):
            raise CapabilityUnavailableError(
                "collision safety optimizer received a non-finite dense state"
            )
        return squared

    _raise_if_cancelled(cancel_requested)
    budget.check_elapsed()
    minimum = minimize_scalar(
        separation_squared,
        bounds=(segment_left, segment_right),
        method="bounded",
    )
    _raise_if_cancelled(cancel_requested)
    if (
        not minimum.success
        or not isfinite(float(minimum.fun))
        or not isfinite(float(minimum.x))
    ):
        raise CapabilityUnavailableError(
            "collision safety optimizer failed to find a finite minimum"
        )
    candidates = (
        (float(minimum.fun), float(minimum.x)),
        (separation_squared(segment_left), segment_left),
        (separation_squared(segment_right), segment_right),
    )
    return min(candidates, key=lambda candidate: candidate[0])


def _scipy_functions() -> tuple[
    Callable[..., OdeSolution], Callable[..., OptimizerResult]
]:
    try:
        from scipy.integrate import solve_ivp
        from scipy.optimize import minimize_scalar
    except ImportError as error:
        raise CapabilityUnavailableError(
            "bounded scientific forward runs require scipy>=1.13 for DOP853; "
            "install the 'integrator' extra"
        ) from error
    return cast(Callable[..., OdeSolution], solve_ivp), cast(
        Callable[..., OptimizerResult], minimize_scalar
    )


def _initial_state(bodies: tuple[Body, ...]) -> list[float]:
    return [
        coordinate
        for body in bodies
        for coordinate in (*body.position_m, *body.velocity_m_s)
    ]


def _newtonian_derivative(
    bodies: tuple[Body, ...],
    cancel_requested: CancellationCheck | None,
    work_budget: _WorkBudget,
) -> Callable[[float, Sequence[float]], list[float]]:
    count = len(bodies)

    def derivative(time: float, state: Sequence[float]) -> list[float]:
        _raise_if_cancelled(cancel_requested)
        work_budget.record_rhs_evaluation()
        if not all(isfinite(float(value)) for value in state):
            raise CapabilityUnavailableError("DOP853 produced a non-finite state")
        positions = [_state_vector(state, index * 6) for index in range(count)]
        velocities = [_state_vector(state, index * 6 + 3) for index in range(count)]
        accelerations = [
            _acceleration(bodies, positions, index, time) for index in range(count)
        ]
        return [
            value
            for velocity, acceleration in zip(velocities, accelerations, strict=True)
            for value in (*velocity, *acceleration)
        ]

    return derivative


def _acceleration(
    bodies: tuple[Body, ...], positions: list[Vector3], index: int, time: float
) -> Vector3:
    ax = ay = az = 0.0
    for other_index, other_position in enumerate(positions):
        if index == other_index:
            continue
        displacement = _subtract(other_position, positions[index])
        distance = _norm(displacement)
        contact_distance = bodies[index].radius_m + bodies[other_index].radius_m
        if distance <= contact_distance:
            raise CollisionDomainError(
                f"finite-radius contact between {bodies[index].id!r} and "
                f"{bodies[other_index].id!r} at offset {time} s"
            )
        factor = G_SI * bodies[other_index].mass_kg / distance**3
        ax += factor * displacement[0]
        ay += factor * displacement[1]
        az += factor * displacement[2]
    acceleration = (ax, ay, az)
    if not all(isfinite(value) for value in acceleration):
        raise CapabilityUnavailableError("DOP853 produced a non-finite acceleration")
    return acceleration


def _record_state(
    states_by_time: dict[float, tuple[dict[str, Vector3], dict[str, Vector3]]],
    bodies: tuple[Body, ...],
    time: float,
    state: Sequence[float],
) -> None:
    if not all(isfinite(float(value)) for value in state):
        raise CapabilityUnavailableError("DOP853 produced a non-finite state")
    positions = {
        body.id: _state_vector(state, index * 6) for index, body in enumerate(bodies)
    }
    velocities = {
        body.id: _state_vector(state, index * 6 + 3)
        for index, body in enumerate(bodies)
    }
    states_by_time[time] = (positions, velocities)


def _absolute_tolerances(request: ForwardRunRequest, body_count: int) -> list[float]:
    return [
        tolerance
        for _ in range(body_count)
        for tolerance in (
            request.position_tolerance_m,
            request.position_tolerance_m,
            request.position_tolerance_m,
            request.velocity_tolerance_m_s,
            request.velocity_tolerance_m_s,
            request.velocity_tolerance_m_s,
        )
    ]


def _raise_for_contact_events(
    bodies: tuple[Body, ...],
    contact_pairs: list[tuple[int, int]],
    event_times: Sequence[Sequence[float]],
) -> None:
    for pair, contacts in zip(contact_pairs, event_times, strict=True):
        if len(contacts) > 0:
            left, right = (bodies[index] for index in pair)
            raise CollisionDomainError(
                f"finite-radius contact between {left.id!r} and {right.id!r} "
                f"at offset {float(contacts[0])} s"
            )


def _integrate_sample_times(
    times: tuple[float, ...],
    request: ForwardRunRequest,
    bodies: tuple[Body, ...],
    initial: list[float],
    derivative: Callable[[float, Sequence[float]], list[float]],
    contact_pairs: list[tuple[int, int]],
    contact_events: list[_ContactEvent],
    solve_ivp: Callable[..., OdeSolution],
    minimize_scalar: Callable[..., OptimizerResult],
    states_by_time: dict[float, tuple[dict[str, Vector3], dict[str, Vector3]]],
    cancel_requested: CancellationCheck | None,
    work_budget: _WorkBudget,
) -> None:
    if not times:
        return
    _raise_if_cancelled(cancel_requested)
    solution = solve_ivp(
        derivative,
        (0.0, times[-1]),
        initial,
        method="DOP853",
        rtol=request.integrator_rtol,
        atol=_absolute_tolerances(request, len(bodies)),
        max_step=request.integrator_max_step_s,
        events=contact_events,
        dense_output=True,
    )
    _raise_if_cancelled(cancel_requested)
    if not solution.success:
        raise CapabilityUnavailableError(f"DOP853 failed: {solution.message}")
    work_budget.record_accepted_steps(max(len(solution.t) - 1, 0))
    _raise_for_contact_events(bodies, contact_pairs, solution.t_events)
    _assert_dense_solution_avoids_contact(
        bodies, solution, minimize_scalar, cancel_requested, work_budget
    )
    dense_solution = solution.sol
    if dense_solution is None:
        raise CapabilityUnavailableError(
            "DOP853 did not provide the required dense solution"
        )
    for raw_time in times:
        _raise_if_cancelled(cancel_requested)
        work_budget.check_elapsed()
        _record_state(states_by_time, bodies, float(raw_time), dense_solution(raw_time))


def _scipy_propagate(
    request: ForwardRunRequest,
    cancel_requested: CancellationCheck | None = None,
) -> tuple[ForwardSample, ...]:
    solve_ivp, minimize_scalar = _scipy_functions()
    work_budget = _WorkBudget.start()

    bodies = tuple(request.bodies)
    states_by_time: dict[float, tuple[dict[str, Vector3], dict[str, Vector3]]] = {}
    if 0.0 in request.sample_times_s:
        _record_state(states_by_time, bodies, 0.0, _initial_state(bodies))
    contact_pairs = [
        (left_index, right_index)
        for left_index in range(len(bodies))
        for right_index in range(left_index + 1, len(bodies))
    ]
    contact_events = [
        _ContactEvent(bodies, left_index, right_index)
        for left_index, right_index in contact_pairs
    ]
    future = tuple(sorted(time for time in request.sample_times_s if time > 0.0))
    past = tuple(
        sorted(
            (time for time in request.sample_times_s if time < 0.0),
            reverse=True,
        )
    )
    derivative = _newtonian_derivative(bodies, cancel_requested, work_budget)
    initial = _initial_state(bodies)
    _integrate_sample_times(
        future,
        request,
        bodies,
        initial,
        derivative,
        contact_pairs,
        contact_events,
        solve_ivp,
        minimize_scalar,
        states_by_time,
        cancel_requested,
        work_budget,
    )
    _integrate_sample_times(
        past,
        request,
        bodies,
        initial,
        derivative,
        contact_pairs,
        contact_events,
        solve_ivp,
        minimize_scalar,
        states_by_time,
        cancel_requested,
        work_budget,
    )

    return tuple(
        _observable_sample(request, time, *states_by_time[time])
        for time in request.sample_times_s
    )


def _circular_two_body_test_propagate(
    request: ForwardRunRequest,
    cancel_requested: CancellationCheck | None = None,
) -> tuple[ForwardSample, ...]:
    if len(request.bodies) != 2:
        raise CapabilityUnavailableError(
            "analytic test fallback supports exactly two bodies"
        )
    first, second = request.bodies
    relative_position = _subtract(second.position_m, first.position_m)
    relative_velocity = _subtract(second.velocity_m_s, first.velocity_m_s)
    separation = _norm(relative_position)
    speed = _norm(relative_velocity)
    mu = G_SI * (first.mass_kg + second.mass_kg)
    if (
        separation == 0
        or abs(_dot(relative_position, relative_velocity)) > 1e-10 * separation * speed
    ):
        raise ContractError(
            "analytic test fallback requires a non-zero circular relative state"
        )
    expected_speed = sqrt(mu / separation)
    if not isclose(speed, expected_speed, rel_tol=1e-8, abs_tol=0.0):
        raise ContractError(
            "analytic test fallback requires the circular two-body speed"
        )
    basis_r = _scale(relative_position, 1.0 / separation)
    basis_t = _scale(relative_velocity, 1.0 / speed)
    omega = sqrt(mu / separation**3)
    total_mass = first.mass_kg + second.mass_kg
    centre_position = _scale(
        _add(
            _scale(first.position_m, first.mass_kg),
            _scale(second.position_m, second.mass_kg),
        ),
        1.0 / total_mass,
    )
    centre_velocity = _scale(
        _add(
            _scale(first.velocity_m_s, first.mass_kg),
            _scale(second.velocity_m_s, second.mass_kg),
        ),
        1.0 / total_mass,
    )
    samples = []
    for time in request.sample_times_s:
        _raise_if_cancelled(cancel_requested)
        phase = omega * time
        relative = _scale(
            _add(_scale(basis_r, cos(phase)), _scale(basis_t, sin(phase))), separation
        )
        relative_v = _scale(
            _add(_scale(basis_r, -sin(phase)), _scale(basis_t, cos(phase))),
            separation * omega,
        )
        centre = _add(centre_position, _scale(centre_velocity, time))
        positions = {
            first.id: _subtract(centre, _scale(relative, second.mass_kg / total_mass)),
            second.id: _add(centre, _scale(relative, first.mass_kg / total_mass)),
        }
        velocities = {
            first.id: _subtract(
                centre_velocity, _scale(relative_v, second.mass_kg / total_mass)
            ),
            second.id: _add(
                centre_velocity, _scale(relative_v, first.mass_kg / total_mass)
            ),
        }
        samples.append(_observable_sample(request, time, positions, velocities))
    return tuple(samples)


def _observable_sample(
    request: ForwardRunRequest,
    time: float,
    positions: dict[str, Vector3],
    velocities: dict[str, Vector3],
) -> ForwardSample:
    target = request.observer.target_body_id
    # The line-of-sight unit vector points from the system to the observer.
    # Spectroscopic radial velocity is positive for recession, hence the minus.
    radial_velocity = -_dot(velocities[target], request.observer.line_of_sight)
    offset_m, offset_rad = _photocentre_offsets(request, positions)
    return ForwardSample(
        time, positions, velocities, radial_velocity, offset_m, offset_rad
    )


def _photocentre_offsets(
    request: ForwardRunRequest, positions: dict[str, Vector3]
) -> tuple[Vector3 | None, Vector3 | None]:
    luminous = [body for body in request.bodies if body.luminosity_w is not None]
    luminosity = sum(body.luminosity_w or 0.0 for body in luminous)
    if not luminous or luminosity <= 0:
        return None, None
    photocentre = _luminosity_weighted_position(luminous, positions, luminosity)
    los_component = _dot(photocentre, request.observer.line_of_sight)
    offset_m = _subtract(
        photocentre,
        _scale(request.observer.line_of_sight, los_component),
    )
    return offset_m, _angular_offset(offset_m, request.observer.distance_m)


def _luminosity_weighted_position(
    bodies: list[Body], positions: dict[str, Vector3], luminosity: float
) -> Vector3:
    return (
        sum((body.luminosity_w or 0.0) * positions[body.id][0] for body in bodies)
        / luminosity,
        sum((body.luminosity_w or 0.0) * positions[body.id][1] for body in bodies)
        / luminosity,
        sum((body.luminosity_w or 0.0) * positions[body.id][2] for body in bodies)
        / luminosity,
    )


def _angular_offset(offset_m: Vector3, distance_m: float | None) -> Vector3 | None:
    if distance_m is None:
        return None
    return (
        offset_m[0] / distance_m,
        offset_m[1] / distance_m,
        offset_m[2] / distance_m,
    )


def _package_version(package: str) -> str:
    try:
        return version(package)
    except PackageNotFoundError:
        return "unavailable"


def run_forward(
    request: ForwardRunRequest,
    *,
    cancel_requested: CancellationCheck | None = None,
) -> ForwardRunResult:
    """Propagate one immutable request with explicit engine-mode semantics.

    Research-mode requests require SciPy and fail closed; the analytic circular
    fallback is available only when a test request explicitly permits it.
    """

    if request.execution_mode == "research":
        samples = _scipy_propagate(request, cancel_requested)
        engine, scientific = "scipy-dop853", True
    elif request.allow_analytic_two_body_test_fallback:
        samples = _circular_two_body_test_propagate(request, cancel_requested)
        engine, scientific = "analytic-circular-two-body-test", False
    else:
        raise CapabilityUnavailableError(
            "test mode requires explicit analytic fallback opt-in"
        )
    return ForwardRunResult(
        samples=samples,
        manifest=RunManifest(
            schema_version="v5",
            request_sha256=request_fingerprint(request),
            execution_mode=request.execution_mode,
            engine=engine,
            scientific_result=scientific,
            coordinate_system="barycentric-cartesian-si",
            time_scale="TDB Julian Date epoch plus SI-second offsets",
            epoch_jd_tdb=request.epoch_jd_tdb,
            constants={"G_SI": G_SI},
            software_versions={
                "backend": _package_version("otherlight-science-backend"),
                "engine": (
                    f"SciPy {_package_version('scipy')} DOP853"
                    if scientific
                    else "analytic-circular-two-body-test-v1"
                ),
                "python": python_version(),
                "scipy": _package_version("scipy"),
                "pyarrow": _package_version("pyarrow"),
            },
            model_versions={
                "dynamics": "newtonian-point-mass-finite-radius-boundary-v2",
                "radial_velocity": "barycentric-positive-receding-v1",
                "photocentre": "luminosity-weighted-sky-plane-v1",
            },
            numerical_tolerances={
                "requestedPositionToleranceM": request.position_tolerance_m,
                "effectivePositionToleranceM": request.position_tolerance_m,
                "requestedVelocityToleranceMps": request.velocity_tolerance_m_s,
                "effectiveVelocityToleranceMps": request.velocity_tolerance_m_s,
                "requestedRelativeTolerance": request.integrator_rtol,
                "effectiveRelativeTolerance": request.integrator_rtol,
                "requestedMaxStepSec": request.integrator_max_step_s,
                "effectiveMaxStepSec": request.integrator_max_step_s,
            },
            datasets={},
            validity_domain=(
                "Newtonian gravitating masses with finite radii used as a contact boundary",
                "propagation terminates before finite-radius contact; no collision physics",
                "observer fixed at effectively infinite direction",
            ),
            warnings=(
                ("test-only analytic propagation; not a scientific result",)
                if not scientific
                else ()
            ),
        ),
    )
