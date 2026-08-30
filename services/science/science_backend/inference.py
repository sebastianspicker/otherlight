"""Reduced-observation likelihoods and fail-closed optional sampler access."""

from __future__ import annotations

from .contracts import InferenceRequest
from .errors import CapabilityUnavailableError, ContractError


def available_samplers() -> dict[str, bool]:
    """Report optional sampler imports without claiming an implemented adapter."""

    available: dict[str, bool] = {}
    for name in ("emcee", "dynesty"):
        try:
            __import__(name)
        except ImportError:
            available[name] = False
        else:
            available[name] = True
    return available


def run_optional_sampler(name: str, _: InferenceRequest) -> None:
    """Sampler boundary; actual parameter-space adapters remain explicit future work."""

    if name not in ("emcee", "dynesty"):
        raise ContractError(f"unsupported sampler {name!r}")
    if not available_samplers()[name]:
        raise CapabilityUnavailableError(
            f"optional sampler {name!r} is unavailable; no sampler integration is declared"
        )
    raise CapabilityUnavailableError(
        f"sampler {name!r} is installed but has no declared parameter-space adapter; refusing to infer"
    )
