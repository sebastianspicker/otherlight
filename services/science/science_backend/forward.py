"""Stable public forward-model entry points."""

from __future__ import annotations

from collections.abc import Callable

from .contracts import ForwardRunRequest
from .errors import CapabilityUnavailableError
from .forward_analytic import circular_two_body_test_propagate
from .forward_dynamics import (
    assert_dense_solution_avoids_contact as _assert_dense_solution_avoids_contact,
)
from .forward_dynamics import minimum_separation_squared as _minimum_separation_squared
from .forward_dynamics import scipy_propagate
from .forward_manifest import run_manifest
from .forward_types import (
    CancellationCheck,
    DenseSolution,
    ForwardRunResult,
    ForwardSample,
    OdeSolution,
    OptimizerResult,
    RunManifest,
    WorkBudget,
)

ForwardPropagator = Callable[
    [ForwardRunRequest, CancellationCheck | None], tuple[ForwardSample, ...]
]


def run_forward_with(
    request: ForwardRunRequest,
    *,
    cancel_requested: CancellationCheck | None = None,
    scipy_propagator: ForwardPropagator = scipy_propagate,
    analytic_propagator: ForwardPropagator = circular_two_body_test_propagate,
) -> ForwardRunResult:
    """Run one request with explicit, injectable engine dependencies."""
    if request.execution_mode == "research":
        samples = scipy_propagator(request, cancel_requested)
        engine, scientific = "scipy-dop853", True
    elif request.allow_analytic_two_body_test_fallback:
        samples = analytic_propagator(request, cancel_requested)
        engine, scientific = "analytic-circular-two-body-test", False
    else:
        raise CapabilityUnavailableError(
            "test mode requires explicit analytic fallback opt-in"
        )
    return ForwardRunResult(samples, run_manifest(request, engine, scientific))


def run_forward(
    request: ForwardRunRequest, *, cancel_requested: CancellationCheck | None = None
) -> ForwardRunResult:
    """Propagate one immutable request with the production engine selection."""
    return run_forward_with(request, cancel_requested=cancel_requested)


# Compatibility aliases for callers which used the former internal test hooks.
_WorkBudget = WorkBudget

__all__ = [
    "CancellationCheck",
    "DenseSolution",
    "ForwardRunResult",
    "ForwardSample",
    "OdeSolution",
    "OptimizerResult",
    "RunManifest",
    "_WorkBudget",
    "_assert_dense_solution_avoids_contact",
    "_minimum_separation_squared",
    "run_forward",
    "run_forward_with",
]
