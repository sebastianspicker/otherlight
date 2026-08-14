"""Observable projection for propagated barycentric states."""

from __future__ import annotations

from math import sqrt

from .contracts import Body, ForwardRunRequest, Vector3
from .forward_types import ForwardSample


def add(left: Vector3, right: Vector3) -> Vector3:
    return tuple(left[index] + right[index] for index in range(3))  # type: ignore[return-value]


def subtract(left: Vector3, right: Vector3) -> Vector3:
    return tuple(left[index] - right[index] for index in range(3))  # type: ignore[return-value]


def scale(vector: Vector3, scalar: float) -> Vector3:
    return tuple(value * scalar for value in vector)  # type: ignore[return-value]


def dot(left: Vector3, right: Vector3) -> float:
    return sum(left[index] * right[index] for index in range(3))


def norm(vector: Vector3) -> float:
    return sqrt(dot(vector, vector))


def observable_sample(
    request: ForwardRunRequest,
    time: float,
    positions: dict[str, Vector3],
    velocities: dict[str, Vector3],
) -> ForwardSample:
    target = request.observer.target_body_id
    radial_velocity = -dot(velocities[target], request.observer.line_of_sight)
    offset_m, offset_rad = photocentre_offsets(request, positions)
    return ForwardSample(
        time, positions, velocities, radial_velocity, offset_m, offset_rad
    )


def photocentre_offsets(
    request: ForwardRunRequest, positions: dict[str, Vector3]
) -> tuple[Vector3 | None, Vector3 | None]:
    luminous = [body for body in request.bodies if body.luminosity_w is not None]
    luminosity = sum(body.luminosity_w or 0.0 for body in luminous)
    if not luminous or luminosity <= 0:
        return None, None
    photocentre = luminosity_weighted_position(luminous, positions, luminosity)
    line_of_sight_component = dot(photocentre, request.observer.line_of_sight)
    offset_m = subtract(
        photocentre, scale(request.observer.line_of_sight, line_of_sight_component)
    )
    distance = request.observer.distance_m
    if distance is None:
        return offset_m, None
    return offset_m, scale(offset_m, 1.0 / distance)


def luminosity_weighted_position(
    bodies: list[Body], positions: dict[str, Vector3], luminosity: float
) -> Vector3:
    return tuple(
        sum((body.luminosity_w or 0.0) * positions[body.id][axis] for body in bodies)
        / luminosity
        for axis in range(3)
    )  # type: ignore[return-value]
