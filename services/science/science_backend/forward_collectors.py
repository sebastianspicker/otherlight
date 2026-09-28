"""Rich and service-compact projections from one propagated state."""

from __future__ import annotations

from collections.abc import Sequence

from .contracts import Body, ForwardRunRequest
from .forward_observables import dot, observable_sample
from .forward_types import CompactForwardSample, ForwardSample


def rich_sample(
    request: ForwardRunRequest,
    bodies: tuple[Body, ...],
    time: float,
    state: Sequence[float],
) -> ForwardSample:
    positions = {
        body.id: _vector(state, index * 6) for index, body in enumerate(bodies)
    }
    velocities = {
        body.id: _vector(state, index * 6 + 3) for index, body in enumerate(bodies)
    }
    return observable_sample(request, time, positions, velocities)


def compact_sample(
    request: ForwardRunRequest,
    bodies: tuple[Body, ...],
    time: float,
    state: Sequence[float],
) -> CompactForwardSample:
    target_index = next(
        index
        for index, body in enumerate(bodies)
        if body.id == request.observer.target_body_id
    )
    velocity = _vector(state, target_index * 6 + 3)
    return CompactForwardSample(
        time_offset_s=time,
        radial_velocity_m_s=-dot(velocity, request.observer.line_of_sight),
    )


def _vector(state: Sequence[float], start: int) -> tuple[float, float, float]:
    return (float(state[start]), float(state[start + 1]), float(state[start + 2]))
