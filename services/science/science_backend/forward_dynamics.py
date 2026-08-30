"""SciPy DOP853 propagation and finite-radius collision safety."""

from __future__ import annotations

from collections.abc import Callable, Sequence
from math import isfinite
from typing import cast

from .contracts import G_SI, Body, ForwardRunRequest, Vector3
from .errors import CapabilityUnavailableError, CollisionDomainError
from .forward_observables import norm, observable_sample, subtract
from .forward_types import (
    CancellationCheck,
    ForwardSample,
    OdeSolution,
    SciPyEvent,
    WorkBudget,
    finite_state,
    raise_if_cancelled,
)


class ContactEvent:
    """A directional event suitable for SciPy's finite-radius boundary."""

    direction = -1
    terminal = True

    def __init__(self, bodies: tuple[Body, ...], left: int, right: int) -> None:
        self.bodies, self.left, self.right = bodies, left, right

    def __call__(self, time: float, state: Sequence[float]) -> float:
        left = state_vector(state, self.left * 6)
        right = state_vector(state, self.right * 6)
        return norm(subtract(right, left)) - (
            self.bodies[self.left].radius_m + self.bodies[self.right].radius_m
        )


def state_vector(state: Sequence[float], start: int) -> Vector3:
    return (float(state[start]), float(state[start + 1]), float(state[start + 2]))


def scipy_propagate(
    request: ForwardRunRequest,
    cancel_requested: CancellationCheck | None = None,
) -> tuple[ForwardSample, ...]:
    solve_ivp = scipy_functions()
    budget = WorkBudget.start()
    bodies = tuple(request.bodies)
    states: dict[float, tuple[dict[str, Vector3], dict[str, Vector3]]] = {}
    initial = initial_state(bodies)
    if 0.0 in request.sample_times_s:
        record_state(states, bodies, 0.0, initial)
    pairs = [
        (left, right)
        for left in range(len(bodies))
        for right in range(left + 1, len(bodies))
    ]
    events = [ContactEvent(bodies, left, right) for left, right in pairs]
    derivative = newtonian_derivative(bodies, cancel_requested, budget)
    future = tuple(sorted(time for time in request.sample_times_s if time > 0.0))
    past = tuple(
        sorted((time for time in request.sample_times_s if time < 0.0), reverse=True)
    )
    integrate_sample_times(
        future,
        request,
        bodies,
        initial,
        derivative,
        pairs,
        events,
        solve_ivp,
        states,
        cancel_requested,
        budget,
    )
    integrate_sample_times(
        past,
        request,
        bodies,
        initial,
        derivative,
        pairs,
        events,
        solve_ivp,
        states,
        cancel_requested,
        budget,
    )
    return tuple(
        observable_sample(request, time, *states[time])
        for time in request.sample_times_s
    )


def scipy_functions() -> Callable[..., OdeSolution]:
    try:
        from scipy.integrate import solve_ivp  # pyright: ignore[reportMissingImports]
    except ImportError as error:
        raise CapabilityUnavailableError(
            "bounded scientific forward runs require pinned scipy==1.18.0 for certified DOP853 dense output; install the 'integrator' extra"
        ) from error
    return cast(Callable[..., OdeSolution], solve_ivp)


def initial_state(bodies: tuple[Body, ...]) -> list[float]:
    return [
        coordinate
        for body in bodies
        for coordinate in (*body.position_m, *body.velocity_m_s)
    ]


def newtonian_derivative(
    bodies: tuple[Body, ...],
    cancel_requested: CancellationCheck | None,
    budget: WorkBudget,
) -> Callable[[float, Sequence[float]], list[float]]:
    def derivative(time: float, state: Sequence[float]) -> list[float]:
        raise_if_cancelled(cancel_requested)
        budget.record_rhs_evaluation()
        finite_state(state, "DOP853 produced a non-finite state")
        positions = [state_vector(state, index * 6) for index in range(len(bodies))]
        velocities = [
            state_vector(state, index * 6 + 3) for index in range(len(bodies))
        ]
        accelerations = [
            acceleration(bodies, positions, index, time) for index in range(len(bodies))
        ]
        return [
            value
            for velocity, acceleration_value in zip(
                velocities, accelerations, strict=True
            )
            for value in (*velocity, *acceleration_value)
        ]

    return derivative


def acceleration(
    bodies: tuple[Body, ...], positions: list[Vector3], index: int, time: float
) -> Vector3:
    acceleration_value = [0.0, 0.0, 0.0]
    for other, other_position in enumerate(positions):
        if index == other:
            continue
        displacement = subtract(other_position, positions[index])
        distance = norm(displacement)
        contact = bodies[index].radius_m + bodies[other].radius_m
        if distance <= contact:
            raise CollisionDomainError(
                f"finite-radius contact between {bodies[index].id!r} and {bodies[other].id!r} at offset {time} s"
            )
        factor = G_SI * bodies[other].mass_kg / distance**3
        for axis in range(3):
            acceleration_value[axis] += factor * displacement[axis]
    if not all(isfinite(value) for value in acceleration_value):
        raise CapabilityUnavailableError("DOP853 produced a non-finite acceleration")
    return cast(Vector3, tuple(acceleration_value))


def record_state(
    states: dict[float, tuple[dict[str, Vector3], dict[str, Vector3]]],
    bodies: tuple[Body, ...],
    time: float,
    state: Sequence[float],
) -> None:
    finite_state(state, "DOP853 produced a non-finite state")
    positions = {
        body.id: state_vector(state, index * 6) for index, body in enumerate(bodies)
    }
    velocities = {
        body.id: state_vector(state, index * 6 + 3) for index, body in enumerate(bodies)
    }
    states[time] = positions, velocities


def absolute_tolerances(request: ForwardRunRequest, body_count: int) -> list[float]:
    return [
        value
        for _ in range(body_count)
        for value in (
            request.position_tolerance_m,
            request.position_tolerance_m,
            request.position_tolerance_m,
            request.velocity_tolerance_m_s,
            request.velocity_tolerance_m_s,
            request.velocity_tolerance_m_s,
        )
    ]


def integrate_sample_times(
    times: tuple[float, ...],
    request: ForwardRunRequest,
    bodies: tuple[Body, ...],
    initial: list[float],
    derivative: Callable[[float, Sequence[float]], list[float]],
    pairs: list[tuple[int, int]],
    events: Sequence[SciPyEvent],
    solve_ivp: Callable[..., OdeSolution],
    states: dict[float, tuple[dict[str, Vector3], dict[str, Vector3]]],
    cancel_requested: CancellationCheck | None,
    budget: WorkBudget,
) -> None:
    if not times:
        return
    raise_if_cancelled(cancel_requested)
    solution = solve_ivp(
        derivative,
        (0.0, times[-1]),
        initial,
        method="DOP853",
        rtol=request.integrator_rtol,
        atol=absolute_tolerances(request, len(bodies)),
        max_step=request.integrator_max_step_s,
        events=events,
        dense_output=True,
    )
    raise_if_cancelled(cancel_requested)
    if not solution.success:
        raise CapabilityUnavailableError(f"DOP853 failed: {solution.message}")
    budget.record_accepted_steps(max(len(solution.t) - 1, 0))
    raise_for_contact_events(bodies, pairs, solution.t_events)
    assert_dense_solution_avoids_contact(bodies, solution, cancel_requested, budget)
    if solution.sol is None:
        raise CapabilityUnavailableError(
            "DOP853 did not provide the required dense solution"
        )
    for time in times:
        raise_if_cancelled(cancel_requested)
        budget.check_elapsed()
        record_state(states, bodies, float(time), solution.sol(time))


def raise_for_contact_events(
    bodies: tuple[Body, ...],
    pairs: list[tuple[int, int]],
    event_times: Sequence[Sequence[float]],
) -> None:
    for pair, contacts in zip(pairs, event_times, strict=True):
        if len(contacts) > 0:
            left, right = (bodies[index] for index in pair)
            raise CollisionDomainError(
                f"finite-radius contact between {left.id!r} and {right.id!r} at offset {float(contacts[0])} s"
            )


def assert_dense_solution_avoids_contact(
    bodies: tuple[Body, ...],
    solution: OdeSolution,
    cancel_requested: CancellationCheck | None,
    work_budget: WorkBudget | None = None,
) -> None:
    """Fail closed unless the pinned dense interpolants prove every pair safe."""
    if solution.sol is None:
        raise CapabilityUnavailableError(
            "DOP853 did not provide the required dense solution"
        )
    from .dop853_collision_audit import audit_dop853_dense_solution

    budget = work_budget or WorkBudget.start()
    audit_dop853_dense_solution(bodies, solution.sol, cancel_requested, budget)


def minimum_separation_squared(*_: object) -> tuple[float, float]:
    """Retired private hook retained solely for import compatibility."""
    raise CapabilityUnavailableError(
        "optimizer collision safety was removed; DOP853 dense certification is required"
    )
