"""Verify likelihood math and deliberately unavailable sampler boundaries."""

from __future__ import annotations

from math import log, pi

import pytest

from science_backend.contracts import InferenceRequest, ReducedObservation
from science_backend.errors import CapabilityUnavailableError
from science_backend.inference import gaussian_log_likelihood, run_optional_sampler


def test_diagonal_gaussian_likelihood_matches_closed_form() -> None:
    request = InferenceRequest((ReducedObservation(2.0, 1.0, 0.5),))
    result = gaussian_log_likelihood(request)
    assert result.residuals == (1.0,)
    assert result.log_likelihood == pytest.approx(-0.5 * (4.0 + log(2 * pi * 0.25)))


def test_full_covariance_likelihood_and_invalid_covariance() -> None:
    request = InferenceRequest(
        (ReducedObservation(1.0, 0.0), ReducedObservation(-1.0, 0.0)),
        covariance=((1.0, 0.0), (0.0, 4.0)),
    )
    assert gaussian_log_likelihood(request).log_likelihood < 0
    invalid = InferenceRequest(
        (ReducedObservation(1.0, 0.0), ReducedObservation(-1.0, 0.0)),
        covariance=((1.0, 2.0), (2.0, 1.0)),
    )
    with pytest.raises(Exception, match="positive definite"):
        gaussian_log_likelihood(invalid)


def test_inference_request_canonicalizes_mutable_observation_and_covariance_sequences() -> (
    None
):
    observations = [ReducedObservation(1.0, 0.0), ReducedObservation(-1.0, 0.0)]
    covariance = [[1.0, 0.0], [0.0, 4.0]]
    request = InferenceRequest(observations, covariance=covariance)
    observations.pop()
    covariance[0][0] = 99.0

    assert len(request.observations) == 2
    assert request.covariance == ((1.0, 0.0), (0.0, 4.0))


def test_sampler_boundary_fails_closed() -> None:
    request = InferenceRequest((ReducedObservation(0.0, 0.0, 1.0),))
    with pytest.raises(CapabilityUnavailableError):
        run_optional_sampler("emcee", request)
