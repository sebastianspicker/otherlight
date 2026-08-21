"""Pin the scientific-forward evidence to the production research path."""

from __future__ import annotations

from math import cos, pi, sin, sqrt

import pytest

from science_backend.api_contract import CapabilitySnapshot, capability_manifest
from science_backend.contracts import (
    G_SI,
    Body,
    ForwardRunRequest,
    InferenceRequest,
    Observer,
    ReducedObservation,
)
from science_backend.errors import CapabilityUnavailableError
from science_backend.forward import run_forward, run_forward_with
from science_backend.forward_types import ForwardSample
from science_backend.inference import run_optional_sampler


def circular_research_request(
    sample_times_s: tuple[float, ...],
    *,
    relative_tolerance: float = 1.0e-11,
    position_tolerance_m: float = 1.0e-3,
    velocity_tolerance_m_s: float = 1.0e-6,
) -> ForwardRunRequest:
    primary_mass, companion_mass, separation_m = 2.0e30, 2.0e27, 1.0e11
    total_mass = primary_mass + companion_mass
    angular_frequency = sqrt(G_SI * total_mass / separation_m**3)
    relative_speed_m_s = angular_frequency * separation_m
    return ForwardRunRequest(
        bodies=(
            Body(
                "primary",
                "star",
                primary_mass,
                6.0e8,
                (-companion_mass / total_mass * separation_m, 0.0, 0.0),
                (0.0, -companion_mass / total_mass * relative_speed_m_s, 0.0),
                luminosity_w=3.8e26,
            ),
            Body(
                "companion",
                "companion",
                companion_mass,
                7.0e7,
                (primary_mass / total_mass * separation_m, 0.0, 0.0),
                (0.0, primary_mass / total_mass * relative_speed_m_s, 0.0),
            ),
        ),
        sample_times_s=sample_times_s,
        observer=Observer(target_body_id="primary", line_of_sight=(0.0, 1.0, 0.0)),
        epoch_jd_tdb=2_451_545.0,
        execution_mode="research",
        integrator_rtol=relative_tolerance,
        position_tolerance_m=position_tolerance_m,
        velocity_tolerance_m_s=velocity_tolerance_m_s,
        # Samples fall between accepted integration steps, exercising dense output.
        integrator_max_step_s=(
            circular_period_from_bodies(primary_mass, companion_mass, separation_m) / 8
        ),
    )


def circular_period_from_bodies(
    primary_mass: float, companion_mass: float, separation_m: float
) -> float:
    return 2 * pi / sqrt(G_SI * (primary_mass + companion_mass) / separation_m**3)


def circular_period(request: ForwardRunRequest) -> float:
    primary, companion = request.bodies
    separation_m = companion.position_m[0] - primary.position_m[0]
    return circular_period_from_bodies(primary.mass_kg, companion.mass_kg, separation_m)


def exact_primary_state(
    request: ForwardRunRequest, time_s: float
) -> tuple[tuple[float, float, float], tuple[float, float, float]]:
    primary, companion = request.bodies
    total_mass = primary.mass_kg + companion.mass_kg
    separation_m = companion.position_m[0] - primary.position_m[0]
    angular_frequency = sqrt(G_SI * total_mass / separation_m**3)
    radius_m = companion.mass_kg / total_mass * separation_m
    speed_m_s, phase = angular_frequency * radius_m, angular_frequency * time_s
    return (
        (-radius_m * cos(phase), -radius_m * sin(phase), 0.0),
        (speed_m_s * sin(phase), -speed_m_s * cos(phase), 0.0),
    )


def maximum_primary_error(request: ForwardRunRequest) -> tuple[float, float]:
    position_error = velocity_error = 0.0
    for sample in run_forward(request).samples:
        position, velocity = exact_primary_state(request, sample.time_offset_s)
        position_error = max(
            position_error,
            *(
                abs(actual - expected)
                for actual, expected in zip(
                    sample.positions_m["primary"], position, strict=True
                )
            ),
        )
        velocity_error = max(
            velocity_error,
            *(
                abs(actual - expected)
                for actual, expected in zip(
                    sample.velocities_m_s["primary"], velocity, strict=True
                )
            ),
        )
    return position_error, velocity_error


def require_pinned_scipy() -> None:
    scipy = pytest.importorskip("scipy")
    if scipy.__version__ != "1.18.0":
        pytest.skip("research propagation contract requires pinned scipy==1.18.0")


def test_pinned_dop853_circular_orbit_converges_and_records_tolerances() -> None:
    require_pinned_scipy()
    template = circular_research_request((0.0,))
    times = tuple(circular_period(template) * index / 16 for index in range(17))
    standard = circular_research_request(times)
    tighter = circular_research_request(
        times,
        relative_tolerance=1.0e-12,
        position_tolerance_m=1.0e-4,
        velocity_tolerance_m_s=1.0e-7,
    )
    result = run_forward(standard)

    assert result.manifest.engine == "scipy-dop853"
    assert result.manifest.scientific_result is True
    assert result.manifest.software_versions["engine"] == "SciPy 1.18.0 DOP853"
    for sample in result.samples:
        position, velocity = exact_primary_state(standard, sample.time_offset_s)
        assert sample.positions_m["primary"] == pytest.approx(position, abs=1.0e-2)
        assert sample.velocities_m_s["primary"] == pytest.approx(velocity, abs=1.0e-7)

    standard_errors = maximum_primary_error(standard)
    tighter_errors = maximum_primary_error(tighter)
    assert tighter_errors[0] < standard_errors[0]
    assert tighter_errors[1] < standard_errors[1]
    assert result.manifest.numerical_tolerances == {
        "requestedPositionToleranceM": 1.0e-3,
        "effectivePositionToleranceM": 1.0e-3,
        "requestedVelocityToleranceMps": 1.0e-6,
        "effectiveVelocityToleranceMps": 1.0e-6,
        "requestedRelativeTolerance": 1.0e-11,
        "effectiveRelativeTolerance": 1.0e-11,
        "requestedMaxStepSec": standard.integrator_max_step_s,
        "effectiveMaxStepSec": standard.integrator_max_step_s,
    }


def test_pinned_dop853_bounds_invariants_and_uses_positive_recession_rv() -> None:
    require_pinned_scipy()
    template = circular_research_request((0.0,))
    request = circular_research_request(
        tuple(circular_period(template) * index / 16 for index in range(17))
    )
    result = run_forward(request)
    primary, companion = request.bodies
    reduced_mass = (
        primary.mass_kg * companion.mass_kg / (primary.mass_kg + companion.mass_kg)
    )

    def invariants(
        sample: ForwardSample,
    ) -> tuple[float, float, tuple[float, float, float]]:
        positions = sample.positions_m
        velocities = sample.velocities_m_s
        separation = tuple(
            positions["companion"][axis] - positions["primary"][axis]
            for axis in range(3)
        )
        relative_velocity = tuple(
            velocities["companion"][axis] - velocities["primary"][axis]
            for axis in range(3)
        )
        energy = 0.5 * reduced_mass * sum(value * value for value in relative_velocity)
        energy -= (
            G_SI
            * primary.mass_kg
            * companion.mass_kg
            / sqrt(sum(value * value for value in separation))
        )
        angular_momentum_z = reduced_mass * (
            separation[0] * relative_velocity[1] - separation[1] * relative_velocity[0]
        )
        momentum = (
            primary.mass_kg * velocities["primary"][0]
            + companion.mass_kg * velocities["companion"][0],
            primary.mass_kg * velocities["primary"][1]
            + companion.mass_kg * velocities["companion"][1],
            primary.mass_kg * velocities["primary"][2]
            + companion.mass_kg * velocities["companion"][2],
        )
        return energy, angular_momentum_z, momentum

    initial_energy, initial_angular_momentum, _ = invariants(result.samples[0])
    momentum_scale = sum(
        body.mass_kg
        * sqrt(sum(component * component for component in body.velocity_m_s))
        for body in request.bodies
    )
    for sample in result.samples:
        energy, angular_momentum, momentum = invariants(sample)
        assert abs(energy / initial_energy - 1.0) < 5.0e-10
        assert abs(angular_momentum / initial_angular_momentum - 1.0) < 5.0e-10
        assert (
            sqrt(sum(component * component for component in momentum)) / momentum_scale
            < 1.0e-12
        )

    amplitude = abs(primary.velocity_m_s[1])
    radial_velocities = tuple(sample.radial_velocity_m_s for sample in result.samples)
    assert radial_velocities[0] == pytest.approx(amplitude, abs=1.0e-7)
    assert radial_velocities[4] == pytest.approx(0.0, abs=1.0e-7)
    assert radial_velocities[8] == pytest.approx(-amplitude, abs=1.0e-7)
    assert radial_velocities[12] == pytest.approx(0.0, abs=1.0e-7)


def test_research_mode_never_uses_the_analytic_fallback() -> None:
    request = circular_research_request((0.0,))

    def missing_scipy(_: ForwardRunRequest, _cancel_requested=None):
        raise CapabilityUnavailableError("scipy missing")

    def analytic_fallback(_: ForwardRunRequest, _cancel_requested=None):
        pytest.fail("research mode must not invoke the analytic fallback")

    with pytest.raises(CapabilityUnavailableError, match="scipy missing"):
        run_forward_with(
            request,
            scipy_propagator=missing_scipy,
            analytic_propagator=analytic_fallback,
        )


@pytest.mark.parametrize(
    ("snapshot", "missing_model"),
    [
        (CapabilitySnapshot(False, True, True), "dynamics.dop853"),
        (CapabilitySnapshot(True, False, True), "dynamics.dop853"),
        (CapabilitySnapshot(True, True, False), "artifacts.arrow-ipc"),
    ],
)
def test_forward_capability_gate_requires_scipy_dense_output_and_arrow(
    snapshot: CapabilitySnapshot, missing_model: str
) -> None:
    manifest = capability_manifest(snapshot)

    assert snapshot.forward_available is False
    assert manifest["supportedJobKinds"] == []
    assert manifest["supportedOutputs"] == []
    assert missing_model in manifest["unavailableModelIds"]


def test_capability_manifest_keeps_inference_and_other_lanes_unavailable() -> None:
    manifest = capability_manifest(CapabilitySnapshot(True, True, True))

    assert manifest["supportedJobKinds"] == ["forward"]
    assert manifest["supportedOutputs"] == ["radial-velocity"]
    assert manifest["supportedSamplers"] == []
    assert set(manifest["unavailableModelIds"]) == {
        "photometry.research",
        "timing.relativity",
        "inference.parameter-adapter",
        "atmosphere.radiative-transfer",
        "stellar.atmosphere-grid",
    }
    with pytest.raises(CapabilityUnavailableError, match="no sampler integration"):
        run_optional_sampler(
            "emcee", InferenceRequest((ReducedObservation(0.0, 0.0, 1.0),))
        )
