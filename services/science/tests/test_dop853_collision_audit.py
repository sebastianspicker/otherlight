"""Compact DOP853 dense-collision certificates without external fixtures."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, cast

import pytest

from science_backend.contracts import Body
from science_backend.errors import CapabilityUnavailableError, CollisionDomainError
from science_backend.forward_dynamics import assert_dense_solution_avoids_contact
from science_backend.forward_types import DenseSolution, OdeSolution, WorkBudget

np = pytest.importorskip("numpy")


@dataclass(frozen=True)
class _OdeResult:
    sol: DenseSolution | None
    success: bool = True
    message: str = ""
    t: tuple[float, ...] = (0.0, 1.0)
    t_events: tuple[tuple[float, ...], ...] = ()


def _bodies(radius: float) -> tuple[Body, Body]:
    return (
        Body("left", "planet", 1.0, radius / 2, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
        Body("right", "planet", 1.0, radius / 2, (0.0, 0.0, 0.0), (0.0, 0.0, 0.0)),
    )


def _solution(coefficients: tuple[float, ...]) -> DenseSolution:
    scipy = pytest.importorskip("scipy")
    if scipy.__version__ != "1.18.0":
        pytest.skip("certificate contract requires pinned scipy==1.18.0")
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
    initial = np.zeros(12, dtype=np.float64)
    initial[6] = power[0]
    dense = np.zeros((7, 12), dtype=np.float64)
    dense[:, 6] = (g0, g1, g2, g3, g4, g5, g6)
    return cast(
        DenseSolution,
        OdeSolution(
            np.asarray((0.0, 1.0), dtype=np.float64),
            [Dop853DenseOutput(0.0, 1.0, initial, dense)],
        ),
    )


def _audit(coefficients: tuple[float, ...], radius: float) -> None:
    assert_dense_solution_avoids_contact(
        _bodies(radius),
        cast(OdeSolution, _OdeResult(_solution(coefficients))),
        None,
        WorkBudget.start(),
    )


def test_dop853_certificate_accepts_safe_separation() -> None:
    _audit((0.01,), 0.003)


def test_dop853_certificate_rejects_actual_contact() -> None:
    with pytest.raises(CollisionDomainError, match="finite-radius contact"):
        _audit((0.002,), 0.003)


def test_dop853_certificate_rejects_narrow_interior_contact() -> None:
    with pytest.raises(CollisionDomainError, match="finite-radius contact"):
        _audit((-0.0059, 9.664, -360.96, 4096.0), 0.003)


def test_dop853_certificate_rejects_unknown_dense_solution() -> None:
    with pytest.raises(CapabilityUnavailableError, match="unknown dense solution"):
        assert_dense_solution_avoids_contact(
            _bodies(0.003),
            cast(OdeSolution, _OdeResult(cast(DenseSolution, object()))),
            None,
            WorkBudget.start(),
        )


def test_dop853_certificate_rejects_drifted_dense_evaluator(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    solution = _solution((0.01,))
    from scipy.integrate._ivp.rk import Dop853DenseOutput

    original_call = Dop853DenseOutput.__call__

    def shifted_call(self: Any, time: float) -> Any:
        return original_call(self, time) + 1.0

    monkeypatch.setattr(Dop853DenseOutput, "__call__", shifted_call)
    with pytest.raises(CapabilityUnavailableError, match="evaluator mismatch"):
        assert_dense_solution_avoids_contact(
            _bodies(0.003),
            cast(OdeSolution, _OdeResult(solution)),
            None,
            WorkBudget.start(),
        )
