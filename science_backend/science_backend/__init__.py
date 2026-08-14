"""Fail-closed local scientific backend core."""

from typing import TYPE_CHECKING, Any

from .__about__ import __version__
from .contracts import (
    Body,
    ForwardRunRequest,
    InferenceRequest,
    Observer,
    ReducedObservation,
)

if TYPE_CHECKING:
    from .forward import ForwardRunResult, run_forward

__all__ = [
    "Body",
    "ForwardRunRequest",
    "ForwardRunResult",
    "InferenceRequest",
    "Observer",
    "ReducedObservation",
    "__version__",
    "run_forward",
]


def __getattr__(name: str) -> Any:
    """Load the optional NumPy-backed forward model only when it is requested."""
    if name in {"ForwardRunResult", "run_forward"}:
        from .forward import ForwardRunResult, run_forward

        return {"ForwardRunResult": ForwardRunResult, "run_forward": run_forward}[name]
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
