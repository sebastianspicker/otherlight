"""Reduced-observation likelihoods and fail-closed optional sampler access."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from math import log, pi, sqrt

from .contracts import InferenceRequest
from .errors import CapabilityUnavailableError, ContractError


@dataclass(frozen=True, slots=True)
class LikelihoodResult:
    """Normalized log likelihood plus residuals retained for diagnostics."""

    log_likelihood: float
    residuals: tuple[float, ...]


def _cholesky(matrix: Sequence[Sequence[float]]) -> tuple[tuple[float, ...], ...]:
    size = len(matrix)
    lower = [[0.0 for _ in range(size)] for _ in range(size)]
    for row in range(size):
        for column in range(row + 1):
            value = matrix[row][column] - sum(
                lower[row][index] * lower[column][index] for index in range(column)
            )
            if row == column:
                if value <= 0:
                    raise ContractError(
                        "covariance must be symmetric positive definite"
                    )
                lower[row][column] = sqrt(value)
            else:
                if matrix[row][column] != matrix[column][row]:
                    raise ContractError("covariance must be symmetric")
                lower[row][column] = value / lower[column][column]
    return tuple(tuple(row) for row in lower)


def gaussian_log_likelihood(request: InferenceRequest) -> LikelihoodResult:
    """Evaluate diagonal or full-covariance Gaussian residual likelihoods.

    Full covariance is solved through Cholesky decomposition so non-symmetric
    or non-positive-definite inputs fail instead of producing unstable scores.
    """

    residuals = tuple(item.value - item.model_value for item in request.observations)
    if request.covariance is None:
        variances = tuple((item.sigma or 0.0) ** 2 for item in request.observations)
        log_like = -0.5 * sum(
            residual * residual / variance + log(2 * pi * variance)
            for residual, variance in zip(residuals, variances, strict=True)
        )
        return LikelihoodResult(log_like, residuals)
    lower = _cholesky(request.covariance)
    solved: list[float] = []
    for row, residual in enumerate(residuals):
        solved.append(
            (
                residual
                - sum(lower[row][column] * solved[column] for column in range(row))
            )
            / lower[row][row]
        )
    log_det = 2 * sum(log(lower[index][index]) for index in range(len(lower)))
    return LikelihoodResult(
        -0.5
        * (
            sum(value * value for value in solved)
            + log_det
            + len(residuals) * log(2 * pi)
        ),
        residuals,
    )


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
