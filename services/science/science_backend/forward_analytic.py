"""Explicitly non-scientific circular two-body test propagation."""

from __future__ import annotations

from collections.abc import Callable, Sequence
from math import cos, isclose, sin, sqrt
from typing import cast

from .contracts import G_SI, Body, ForwardRunRequest
from .errors import CapabilityUnavailableError, ContractError
from .forward_collectors import compact_sample, rich_sample
from .forward_observables import add, dot, norm, scale, subtract
from .forward_types import (
    CancellationCheck,
    CompactForwardSample,
    ForwardSample,
    raise_if_cancelled,
)

CollectedSample = ForwardSample | CompactForwardSample
SampleCollector = Callable[
    [ForwardRunRequest, tuple[Body, ...], float, Sequence[float]], CollectedSample
]


def circular_two_body_test_propagate(
    request: ForwardRunRequest,
    cancel_requested: CancellationCheck | None = None,
) -> tuple[ForwardSample, ...]:
    return cast(
        tuple[ForwardSample, ...],
        _circular_two_body_test_propagate(request, cancel_requested, rich_sample),
    )


def circular_two_body_test_propagate_compact(
    request: ForwardRunRequest,
    cancel_requested: CancellationCheck | None = None,
) -> tuple[CompactForwardSample, ...]:
    return cast(
        tuple[CompactForwardSample, ...],
        _circular_two_body_test_propagate(request, cancel_requested, compact_sample),
    )


def _circular_two_body_test_propagate(
    request: ForwardRunRequest,
    cancel_requested: CancellationCheck | None,
    collector: SampleCollector,
) -> tuple[CollectedSample, ...]:
    if len(request.bodies) != 2:
        raise CapabilityUnavailableError(
            "analytic test fallback supports exactly two bodies"
        )
    first, second = request.bodies
    relative_position = subtract(second.position_m, first.position_m)
    relative_velocity = subtract(second.velocity_m_s, first.velocity_m_s)
    separation, speed = norm(relative_position), norm(relative_velocity)
    mu = G_SI * (first.mass_kg + second.mass_kg)
    if (
        separation == 0
        or abs(dot(relative_position, relative_velocity)) > 1e-10 * separation * speed
    ):
        raise ContractError(
            "analytic test fallback requires a non-zero circular relative state"
        )
    if not isclose(speed, sqrt(mu / separation), rel_tol=1e-8, abs_tol=0.0):
        raise ContractError(
            "analytic test fallback requires the circular two-body speed"
        )
    basis_r, basis_t = (
        scale(relative_position, 1.0 / separation),
        scale(relative_velocity, 1.0 / speed),
    )
    omega, total_mass = sqrt(mu / separation**3), first.mass_kg + second.mass_kg
    centre_position = scale(
        add(
            scale(first.position_m, first.mass_kg),
            scale(second.position_m, second.mass_kg),
        ),
        1.0 / total_mass,
    )
    centre_velocity = scale(
        add(
            scale(first.velocity_m_s, first.mass_kg),
            scale(second.velocity_m_s, second.mass_kg),
        ),
        1.0 / total_mass,
    )
    bodies = tuple(request.bodies)
    samples: list[CollectedSample] = []
    for time in request.sample_times_s:
        raise_if_cancelled(cancel_requested)
        phase = omega * time
        relative = scale(
            add(scale(basis_r, cos(phase)), scale(basis_t, sin(phase))), separation
        )
        relative_v = scale(
            add(scale(basis_r, -sin(phase)), scale(basis_t, cos(phase))),
            separation * omega,
        )
        centre = add(centre_position, scale(centre_velocity, time))
        first_position = subtract(centre, scale(relative, second.mass_kg / total_mass))
        second_position = add(centre, scale(relative, first.mass_kg / total_mass))
        first_velocity = subtract(
            centre_velocity, scale(relative_v, second.mass_kg / total_mass)
        )
        second_velocity = add(
            centre_velocity, scale(relative_v, first.mass_kg / total_mass)
        )
        state = (
            *first_position,
            *first_velocity,
            *second_position,
            *second_velocity,
        )
        samples.append(collector(request, bodies, time, state))
    return tuple(samples)
