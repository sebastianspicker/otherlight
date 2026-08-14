"""Certificate tests for the pinned SciPy DOP853 collision auditor."""

from __future__ import annotations

from fractions import Fraction
from math import comb
from random import Random
from typing import Any

import numpy as np
import pytest

from science_backend.contracts import Body
from science_backend.dop853_collision_audit import (
    _certify_positive,
    _NodeCounter,
    _point,
    _power_to_bernstein,
    audit_dop853_dense_solution,
)
from science_backend.errors import CapabilityUnavailableError, CollisionDomainError
from science_backend.forward_types import WorkBudget


def bodies(radius: float) -> tuple[Body, Body]:
    return (
        Body("left", "planet", 1.0, radius / 2, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
        Body("right", "planet", 1.0, radius / 2, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
    )


def dense_solution(
    coefficients: tuple[float, ...], *, start: float = 0.0, end: float = 1.0
) -> Any:
    """Make an exact SciPy private interpolant for one relative x polynomial."""
    from scipy.integrate._ivp.common import OdeSolution
    from scipy.integrate._ivp.rk import Dop853DenseOutput

    power = coefficients + (0.0,) * (8 - len(coefficients))
    g6 = -power[7]
    g5 = 3 * g6 - power[6]
    g4 = power[5] - 3 * g5 + 3 * g6
    g3 = power[4] + 2 * g4 + 3 * g5 - g6
    g2 = -power[3] - 2 * g3 + g4 + g5
    g1 = -power[2] + g2 + g3
    g0 = power[1] - g1
    y_old = np.zeros(12, dtype=np.float64)
    y_old[6] = power[0]
    dense_coefficients = np.zeros((7, 12), dtype=np.float64)
    dense_coefficients[:, 6] = (g0, g1, g2, g3, g4, g5, g6)
    interpolant = Dop853DenseOutput(start, end, y_old, dense_coefficients)
    return OdeSolution(np.asarray((start, end), dtype=np.float64), [interpolant])


def audit(coefficients: tuple[float, ...], radius: float, **times: float) -> None:
    audit_dop853_dense_solution(
        bodies(radius), dense_solution(coefficients, **times), None, WorkBudget.start()
    )


def test_constant_separation_is_certified_safe() -> None:
    audit((0.01,), 0.003)


def test_constant_contact_is_rejected() -> None:
    with pytest.raises(CollisionDomainError, match="finite-radius contact"):
        audit((0.002,), 0.003)


def test_narrow_interior_contact_is_not_missed_by_a_local_optimizer() -> None:
    # p(x) = (16x-.01) * ((16x-.7)^2 + .1); p=.0 at x=1/1600,
    # while both endpoints are farther than R=.003.
    with pytest.raises(CollisionDomainError, match="finite-radius contact"):
        audit((-0.0059, 9.664, -360.96, 4096.0), 0.003)


def test_backward_segment_uses_the_same_normalized_coordinate() -> None:
    audit((0.01,), 0.003, start=1.0, end=0.0)


def test_unpinned_scipy_version_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    import scipy

    monkeypatch.setattr(scipy, "__version__", "1.18.1")
    with pytest.raises(CapabilityUnavailableError, match=r"pinned scipy==1\.18\.0"):
        audit((0.01,), 0.003)


def test_unknown_dense_coefficient_layout_is_rejected() -> None:
    solution = dense_solution((0.01,))
    solution.interpolants[0].F = solution.interpolants[0].F.astype(np.float32)
    with pytest.raises(CapabilityUnavailableError, match="segment data"):
        audit_dop853_dense_solution(bodies(0.003), solution, None, WorkBudget.start())


def test_private_evaluator_drift_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    from scipy.integrate._ivp.rk import Dop853DenseOutput

    original_call = Dop853DenseOutput.__call__

    def shifted_call(self: Any, time: float) -> np.ndarray:
        return original_call(self, time) + 1.0

    monkeypatch.setattr(Dop853DenseOutput, "__call__", shifted_call)
    with pytest.raises(CapabilityUnavailableError, match="evaluator mismatch"):
        audit((0.01,), 0.003)


def test_exact_tangency_fails_closed_as_indeterminate() -> None:
    # p(x) = .1 + (x-.5)^2 touches R=.1 exactly at the midpoint.
    with pytest.raises(CollisionDomainError, match="collision-safety-indeterminate"):
        audit((0.35, -1.0, 1.0), 0.1)


def test_safe_leaf_coverage_uses_all_bernstein_lower_bounds() -> None:
    polynomial = tuple(_point(1.0 if index == 0 else 0.0) for index in range(15))
    bounds = _power_to_bernstein(polynomial)
    assert all(lower > 0.0 for lower, _ in bounds)
    assert (
        _certify_positive(polynomial, _NodeCounter(), None, WorkBudget.start())
        == "safe"
    )


def test_outward_bernstein_arithmetic_contains_exact_rational_oracle() -> None:
    random = Random(4_209)
    for _ in range(10):
        values = tuple(random.randint(-1_000, 1_000) / 1024 for _ in range(15))
        bounds = _power_to_bernstein(tuple(_point(value) for value in values))
        fractions = tuple(Fraction.from_float(value) for value in values)
        for degree, (lower, upper) in enumerate(bounds):
            exact = sum(
                (
                    fractions[exponent]
                    * Fraction(comb(degree, exponent), comb(14, exponent))
                    for exponent in range(degree + 1)
                ),
                Fraction(0),
            )
            assert Fraction.from_float(lower) <= exact <= Fraction.from_float(upper)
