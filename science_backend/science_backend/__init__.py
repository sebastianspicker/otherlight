"""Fail-closed local scientific backend core."""

from .__about__ import __version__
from .contracts import (
    Body,
    ForwardRunRequest,
    InferenceRequest,
    Observer,
    ReducedObservation,
)
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
