"""Research-mode SciPy/DOP853 validation against exact two-body physics."""

from __future__ import annotations

from math import cos, pi, sin, sqrt

import pytest

from science_backend.contracts import G_SI, Body, ForwardRunRequest, Observer
from science_backend.forward import run_forward


def circular_request(
    sample_times_s: tuple[float, ...],
    *,
    rtol: float = 1.0e-11,
    position_tolerance_m: float = 1.0e-3,
    velocity_tolerance_m_s: float = 1.0e-6,
) -> ForwardRunRequest:
    primary_mass, companion_mass, separation = 2.0e30, 2.0e27, 1.0e11
    total_mass = primary_mass + companion_mass
    omega = sqrt(G_SI * total_mass / separation**3)
    relative_speed = omega * separation
    period = 2 * pi / omega
    return ForwardRunRequest(
        bodies=(
            Body(
                "primary",
                "star",
                primary_mass,
                6.0e8,
                (-companion_mass / total_mass * separation, 0.0, 0.0),
                (0.0, -companion_mass / total_mass * relative_speed, 0.0),
                luminosity_w=3.8e26,
            ),
            Body(
                "companion",
                "companion",
                companion_mass,
                7.0e7,
                (primary_mass / total_mass * separation, 0.0, 0.0),
                (0.0, primary_mass / total_mass * relative_speed, 0.0),
            ),
        ),
        sample_times_s=sample_times_s,
        observer=Observer(target_body_id="primary", line_of_sight=(0.0, 1.0, 0.0)),
        epoch_jd_tdb=2_451_545.0,
        execution_mode="research",
        integrator_rtol=rtol,
        position_tolerance_m=position_tolerance_m,
        velocity_tolerance_m_s=velocity_tolerance_m_s,
        # This makes the validation exercise dense interpolation between steps.
        integrator_max_step_s=period / 8,
    )


def circular_period(request: ForwardRunRequest) -> float:
    primary, companion = request.bodies
    separation = companion.position_m[0] - primary.position_m[0]
    return 2 * pi / sqrt(G_SI * (primary.mass_kg + companion.mass_kg) / separation**3)


def exact_primary_state(
    request: ForwardRunRequest, time_s: float
) -> tuple[tuple[float, float, float], tuple[float, float, float]]:
    primary, companion = request.bodies
    total_mass = primary.mass_kg + companion.mass_kg
    separation = companion.position_m[0] - primary.position_m[0]
    omega = sqrt(G_SI * total_mass / separation**3)
    radius = companion.mass_kg / total_mass * separation
    speed, phase = omega * radius, omega * time_s
    return (
        (-radius * cos(phase), -radius * sin(phase), 0.0),
        (speed * sin(phase), -speed * cos(phase), 0.0),
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


def test_research_dop853_matches_exact_circular_orbit_and_converges() -> None:
    pytest.importorskip("scipy")
    template = circular_request((0.0,))
    times = tuple(circular_period(template) * index / 16 for index in range(17))
    standard = circular_request(times)
    result = run_forward(standard)

    for sample in result.samples:
        position, velocity = exact_primary_state(standard, sample.time_offset_s)
        # These allow accumulated adaptive/dense-output error beyond the
        # 1 mm / 1 um s-1 requested absolute state tolerances.
        assert sample.positions_m["primary"] == pytest.approx(position, abs=1.0e-2)
        assert sample.velocities_m_s["primary"] == pytest.approx(velocity, abs=1.0e-7)

    tighter = circular_request(
        times,
        rtol=1.0e-12,
        position_tolerance_m=1.0e-4,
        velocity_tolerance_m_s=1.0e-7,
    )
    standard_errors = maximum_primary_error(standard)
    tighter_errors = maximum_primary_error(tighter)
    assert tighter_errors[0] < standard_errors[0]
    assert tighter_errors[1] < standard_errors[1]


def test_research_dop853_conserves_energy_momentum_and_rv_convention() -> None:
    pytest.importorskip("scipy")
    template = circular_request((0.0,))
    request = circular_request(
        tuple(circular_period(template) * index / 16 for index in range(17))
    )
    result = run_forward(request)
    primary, companion = request.bodies
    reduced_mass = (
        primary.mass_kg * companion.mass_kg / (primary.mass_kg + companion.mass_kg)
    )

    def invariants(sample) -> tuple[float, float]:
        position = tuple(
            sample.positions_m["companion"][axis] - sample.positions_m["primary"][axis]
            for axis in range(3)
        )
        velocity = tuple(
            sample.velocities_m_s["companion"][axis]
            - sample.velocities_m_s["primary"][axis]
            for axis in range(3)
        )
        energy = 0.5 * reduced_mass * sum(value * value for value in velocity)
        energy -= (
            G_SI
            * primary.mass_kg
            * companion.mass_kg
            / sqrt(sum(value * value for value in position))
        )
        angular_momentum_z = reduced_mass * (
            position[0] * velocity[1] - position[1] * velocity[0]
        )
        return energy, angular_momentum_z

    initial_energy, initial_angular_momentum = invariants(result.samples[0])
    for sample in result.samples:
        energy, angular_momentum = invariants(sample)
        # 50x rtol remains strict over one complete diagnostic orbit.
        assert abs(energy / initial_energy - 1.0) < 5.0e-10
        assert abs(angular_momentum / initial_angular_momentum - 1.0) < 5.0e-10

    amplitude = abs(primary.velocity_m_s[1])
    radial_velocities = tuple(sample.radial_velocity_m_s for sample in result.samples)
    assert radial_velocities[0] == pytest.approx(amplitude, abs=1.0e-7)
    assert radial_velocities[4] == pytest.approx(0.0, abs=1.0e-7)
    assert radial_velocities[8] == pytest.approx(-amplitude, abs=1.0e-7)
    assert radial_velocities[12] == pytest.approx(0.0, abs=1.0e-7)


def test_research_high_eccentricity_multiple_close_approaches_remain_safe() -> None:
    pytest.importorskip("scipy")
    primary_mass, companion_mass = 2.0e30, 2.0e27
    total_mass = primary_mass + companion_mass
    contact_distance, eccentricity = 6.7e8, 0.9
    semimajor_axis = contact_distance * 1.02 / (1.0 - eccentricity)
    apoapsis = semimajor_axis * (1.0 + eccentricity)
    gravitational_parameter = G_SI * total_mass
    relative_speed = sqrt(
        gravitational_parameter * (2.0 / apoapsis - 1.0 / semimajor_axis)
    )
    period = 2 * pi * sqrt(semimajor_axis**3 / gravitational_parameter)
    request = ForwardRunRequest(
        bodies=(
            Body(
                "primary",
                "star",
                primary_mass,
                6.0e8,
                (-companion_mass / total_mass * apoapsis, 0.0, 0.0),
                (0.0, -companion_mass / total_mass * relative_speed, 0.0),
                luminosity_w=3.8e26,
            ),
            Body(
                "companion",
                "companion",
                companion_mass,
                7.0e7,
                (primary_mass / total_mass * apoapsis, 0.0, 0.0),
                (0.0, primary_mass / total_mass * relative_speed, 0.0),
            ),
        ),
        # The two near-contact periapses occur between these sampled endpoints.
        sample_times_s=(0.0, 2.0 * period),
        observer=Observer(target_body_id="primary"),
        epoch_jd_tdb=2_451_545.0,
        execution_mode="research",
        integrator_max_step_s=period,
    )

    result = run_forward(request)
    assert result.manifest.engine == "scipy-dop853"
    assert result.samples[-1].positions_m["primary"] == pytest.approx(
        request.bodies[0].position_m, abs=0.1
    )
