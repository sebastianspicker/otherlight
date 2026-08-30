"""Certified finite-radius audit for SciPy 1.18 DOP853 dense output.

This module deliberately accepts only the pinned SciPy private representation.
An unknown representation is not sampled or approximated: it is unavailable.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import comb, isfinite
from typing import Any, Literal

import numpy as np

from .contracts import Body
from .errors import CapabilityUnavailableError, CollisionDomainError
from .forward_types import CancellationCheck, WorkBudget, raise_if_cancelled

type Interval = tuple[float, float]
type PowerPolynomial = tuple[Interval, ...]

MAX_DEPTH = 32
MAX_NODES_PER_PAIR_STEP = 4_096
MAX_NODES_PER_RUN = 2_000_000
_DOP853_ORDER = 7
_SQUARED_DISTANCE_ORDER = 14


@dataclass(frozen=True, slots=True)
class _Segment:
    start: float
    end: float
    y_old: Any
    coefficients: Any


@dataclass(slots=True)
class _NodeCounter:
    total: int = 0
    pair_step: int = 0

    def visit(
        self, cancel_requested: CancellationCheck | None, budget: WorkBudget
    ) -> bool:
        self.total += 1
        self.pair_step += 1
        if self.total > MAX_NODES_PER_RUN or self.pair_step > MAX_NODES_PER_PAIR_STEP:
            return False
        if self.pair_step % 64 == 0:
            raise_if_cancelled(cancel_requested)
            budget.check_elapsed()
        return True


def audit_dop853_dense_solution(
    bodies: tuple[Body, ...],
    dense_solution: object,
    cancel_requested: CancellationCheck | None,
    budget: WorkBudget,
) -> None:
    """Prove every certified DOP853 step avoids all finite-radius contacts."""
    state_size = len(bodies) * 6
    segments = _adapt_pinned_scipy_solution(dense_solution, state_size)
    counter = _NodeCounter()
    for segment in segments:
        for first in range(len(bodies)):
            for second in range(first + 1, len(bodies)):
                raise_if_cancelled(cancel_requested)
                budget.check_elapsed()
                counter.pair_step = 0
                polynomial = _squared_distance_polynomial(
                    segment,
                    first,
                    second,
                    bodies[first].radius_m + bodies[second].radius_m,
                )
                verdict = _certify_positive(
                    polynomial, counter, cancel_requested, budget
                )
                if verdict == "safe":
                    continue
                names = f"between {bodies[first].id!r} and {bodies[second].id!r}"
                if verdict == "contact":
                    raise CollisionDomainError(f"finite-radius contact {names}")
                raise CollisionDomainError(f"collision-safety-indeterminate {names}")


def _adapt_pinned_scipy_solution(
    dense_solution: object, state_size: int
) -> tuple[_Segment, ...]:
    try:
        import scipy
        from scipy.integrate._ivp.common import OdeSolution as SciPyOdeSolution
        from scipy.integrate._ivp.rk import Dop853DenseOutput
    except ImportError as error:
        raise CapabilityUnavailableError(
            "DOP853 collision audit requires scipy==1.18.0"
        ) from error
    if scipy.__version__ != "1.18.0":
        raise CapabilityUnavailableError(
            "DOP853 collision audit requires pinned scipy==1.18.0"
        )
    if type(dense_solution) is not SciPyOdeSolution:
        raise CapabilityUnavailableError(
            "DOP853 collision audit rejected an unknown dense solution"
        )
    solution = dense_solution
    if type(solution.n_segments) is not int or solution.n_segments < 1:
        raise CapabilityUnavailableError(
            "DOP853 collision audit rejected the segment count"
        )
    timestamps = solution.ts
    interpolants = solution.interpolants
    if not _valid_solution_metadata(timestamps, interpolants, solution.n_segments):
        raise CapabilityUnavailableError(
            "DOP853 collision audit rejected dense metadata"
        )
    direction = np.diff(timestamps)
    if not (np.all(direction > 0.0) or np.all(direction < 0.0)):
        raise CapabilityUnavailableError(
            "DOP853 collision audit rejected dense timestamps"
        )
    segments: list[_Segment] = []
    for index, interpolant in enumerate(interpolants):
        if type(interpolant) is not Dop853DenseOutput:
            raise CapabilityUnavailableError(
                "DOP853 collision audit rejected an interpolant"
            )
        start, end, h = (
            float(interpolant.t_old),
            float(interpolant.t),
            float(interpolant.h),
        )
        coefficients, y_old = interpolant.F, interpolant.y_old
        if not _valid_segment_data(
            timestamps, index, start, end, h, coefficients, y_old, state_size
        ):
            raise CapabilityUnavailableError(
                "DOP853 collision audit rejected segment data"
            )
        _verify_local_evaluator(interpolant, start, h, y_old, coefficients)
        segments.append(_Segment(start, end, y_old, coefficients))
    return tuple(segments)


def _valid_solution_metadata(
    timestamps: Any, interpolants: Any, segment_count: int
) -> bool:
    if not _valid_timestamp_array(timestamps, segment_count):
        return False
    return _valid_interpolant_list(interpolants, segment_count)


def _valid_timestamp_array(timestamps: Any, segment_count: int) -> bool:
    if type(timestamps) is not np.ndarray:
        return False
    if timestamps.dtype != np.dtype(np.float64):
        return False
    if timestamps.ndim != 1:
        return False
    if timestamps.shape[0] != segment_count + 1:
        return False
    return bool(np.isfinite(timestamps).all())


def _valid_interpolant_list(interpolants: Any, segment_count: int) -> bool:
    if type(interpolants) is not list:
        return False
    return len(interpolants) == segment_count


def _valid_segment_data(
    timestamps: Any,
    index: int,
    start: float,
    end: float,
    h: float,
    coefficients: Any,
    y_old: Any,
    state_size: int,
) -> bool:
    if not _valid_segment_interval(timestamps, index, start, end, h):
        return False
    return _valid_segment_arrays(coefficients, y_old, state_size)


def _valid_segment_interval(
    timestamps: Any, index: int, start: float, end: float, h: float
) -> bool:
    if not all(isfinite(value) for value in (start, end, h)) or h == 0.0:
        return False
    expected_h = end - start
    if not isfinite(expected_h) or not np.array_equal(
        np.asarray((h,), dtype=np.float64), np.asarray((expected_h,), dtype=np.float64)
    ):
        return False
    return bool(
        np.array_equal(
            timestamps[index : index + 2], np.asarray((start, end), dtype=np.float64)
        )
    )


def _valid_segment_arrays(coefficients: Any, y_old: Any, state_size: int) -> bool:
    if not _valid_float64_array(coefficients, (_DOP853_ORDER, state_size)):
        return False
    return _valid_float64_array(y_old, (state_size,))


def _valid_float64_array(values: Any, expected_shape: tuple[int, ...]) -> bool:
    if type(values) is not np.ndarray:
        return False
    if values.dtype != np.dtype(np.float64):
        return False
    if values.shape != expected_shape:
        return False
    return bool(np.isfinite(values).all())


def _verify_local_evaluator(
    interpolant: Any, start: float, h: float, y_old: Any, coefficients: Any
) -> None:
    for normalized_time in (0.0, 0.125, 0.5, 0.875, 1.0):
        time = start + h * normalized_time
        # Recompute x exactly as SciPy's private evaluator does.  Reusing the
        # nominal fraction would be allowed to differ by one rounding step.
        local = _evaluate_dop853(y_old, coefficients, (time - start) / h)
        observed = interpolant(time)
        if (
            type(observed) is not np.ndarray
            or observed.dtype != np.dtype(np.float64)
            or observed.shape != y_old.shape
            or not np.array_equal(local, observed)
        ):
            raise CapabilityUnavailableError(
                "DOP853 collision audit evaluator mismatch"
            )


def _evaluate_dop853(y_old: Any, coefficients: Any, normalized_time: float) -> Any:
    value = np.zeros_like(y_old)
    for index, coefficient in enumerate(reversed(coefficients)):
        value += coefficient
        value *= normalized_time if index % 2 == 0 else 1.0 - normalized_time
    value += y_old
    return value


def _squared_distance_polynomial(
    segment: _Segment, first: int, second: int, radius: float
) -> PowerPolynomial:
    if not isfinite(radius) or radius <= 0.0:
        raise CapabilityUnavailableError(
            "DOP853 collision audit received an invalid radius"
        )
    result = [_point(0.0) for _ in range(_SQUARED_DISTANCE_ORDER + 1)]
    for axis in range(3):
        polynomial = _relative_axis_power(segment, first * 6 + axis, second * 6 + axis)
        for left, left_value in enumerate(polynomial):
            for right, right_value in enumerate(polynomial):
                index = left + right
                result[index] = _add(result[index], _multiply(left_value, right_value))
    result[0] = _subtract(result[0], _multiply(_point(radius), _point(radius)))
    return tuple(result)


def _relative_axis_power(segment: _Segment, left: int, right: int) -> PowerPolynomial:
    d0 = _subtract(
        _point(float(segment.y_old[right])), _point(float(segment.y_old[left]))
    )
    g = tuple(
        _subtract(
            _point(float(segment.coefficients[index, right])),
            _point(float(segment.coefficients[index, left])),
        )
        for index in range(_DOP853_ORDER)
    )
    return (
        d0,
        _add(g[0], g[1]),
        _add(_add(_negate(g[1]), g[2]), g[3]),
        _add(_add(_add(_negate(g[2]), _scale(g[3], -2)), g[4]), g[5]),
        _add(_add(_add(g[3], _scale(g[4], -2)), _scale(g[5], -3)), g[6]),
        _add(_add(g[4], _scale(g[5], 3)), _scale(g[6], -3)),
        _add(_negate(g[5]), _scale(g[6], 3)),
        _negate(g[6]),
    )


def _certify_positive(
    power: PowerPolynomial,
    counter: _NodeCounter,
    cancel_requested: CancellationCheck | None,
    budget: WorkBudget,
) -> Literal["safe", "contact", "indeterminate"]:
    stack: list[tuple[tuple[Interval, ...], int]] = [(_power_to_bernstein(power), 0)]
    while stack:
        bounds, depth = stack.pop()
        if not counter.visit(cancel_requested, budget):
            return "indeterminate"
        if all(lower > 0.0 for lower, _ in bounds):
            continue
        left, right, midpoint = _split_bernstein(bounds)
        if bounds[0][1] <= 0.0 or bounds[-1][1] <= 0.0 or midpoint[1] <= 0.0:
            return "contact"
        if depth >= MAX_DEPTH:
            return "indeterminate"
        stack.append((right, depth + 1))
        stack.append((left, depth + 1))
    return "safe"


def _power_to_bernstein(power: PowerPolynomial) -> tuple[Interval, ...]:
    bounds: list[Interval] = []
    for degree in range(_SQUARED_DISTANCE_ORDER + 1):
        total = _point(0.0)
        for exponent in range(degree + 1):
            total = _add(
                total,
                _scale_ratio(
                    power[exponent],
                    comb(degree, exponent),
                    comb(_SQUARED_DISTANCE_ORDER, exponent),
                ),
            )
        bounds.append(total)
    return tuple(bounds)


def _split_bernstein(
    bounds: tuple[Interval, ...],
) -> tuple[tuple[Interval, ...], tuple[Interval, ...], Interval]:
    layer = list(bounds)
    left, right = [layer[0]], [layer[-1]]
    while len(layer) > 1:
        layer = [
            _divide_positive(_add(layer[index], layer[index + 1]), 2)
            for index in range(len(layer) - 1)
        ]
        left.append(layer[0])
        right.append(layer[-1])
    return tuple(left), tuple(reversed(right)), layer[0]


def _point(value: float) -> Interval:
    _require_finite(value)
    return _down(value), _up(value)


def _add(left: Interval, right: Interval) -> Interval:
    return _down(left[0] + right[0]), _up(left[1] + right[1])


def _subtract(left: Interval, right: Interval) -> Interval:
    return _down(left[0] - right[1]), _up(left[1] - right[0])


def _negate(value: Interval) -> Interval:
    return _down(-value[1]), _up(-value[0])


def _multiply(left: Interval, right: Interval) -> Interval:
    values = (
        left[0] * right[0],
        left[0] * right[1],
        left[1] * right[0],
        left[1] * right[1],
    )
    return _down(min(values)), _up(max(values))


def _scale(value: Interval, scalar: int) -> Interval:
    return _multiply(value, _point(float(scalar)))


def _scale_ratio(value: Interval, numerator: int, denominator: int) -> Interval:
    return _divide_positive(_scale(value, numerator), denominator)


def _divide_positive(value: Interval, divisor: int) -> Interval:
    if divisor <= 0:
        raise CapabilityUnavailableError(
            "DOP853 collision audit received an invalid divisor"
        )
    return _down(value[0] / divisor), _up(value[1] / divisor)


def _down(value: float) -> float:
    _require_finite(value)
    rounded = float(np.nextafter(np.float64(value), np.float64(-np.inf)))
    _require_finite(rounded)
    return rounded


def _up(value: float) -> float:
    _require_finite(value)
    rounded = float(np.nextafter(np.float64(value), np.float64(np.inf)))
    _require_finite(rounded)
    return rounded


def _require_finite(value: float) -> None:
    if not isfinite(value):
        raise CapabilityUnavailableError(
            "DOP853 collision audit encountered non-finite arithmetic"
        )
