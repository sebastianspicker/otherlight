"""Verify bounded propagation, fail-closed engines, and physical invariants."""

from __future__ import annotations

from collections.abc import Callable
from math import pi, sqrt
from types import SimpleNamespace
from typing import cast

import pytest

from science_backend.contracts import (
    G_SI,
    MIN_RELATIVE_TOLERANCE,
    Body,
    ForwardRunRequest,
    Observer,
)
from science_backend.errors import (
    CapabilityUnavailableError,
    CollisionDomainError,
    ContractError,
)
from science_backend.forward import run_forward


def circular_test_request(
    *, mode: str = "test", fallback: bool = True
) -> ForwardRunRequest:
    primary_mass = 2.0e30
    companion_mass = 2.0e27
    separation = 1.0e11
    total_mass = primary_mass + companion_mass
    omega = sqrt(G_SI * total_mass / separation**3)
    relative_speed = omega * separation
    return ForwardRunRequest(
        bodies=(
            Body(
                id="primary",
                kind="star",
                mass_kg=primary_mass,
                radius_m=6.0e8,
                position_m=(-companion_mass / total_mass * separation, 0.0, 0.0),
                velocity_m_s=(0.0, -companion_mass / total_mass * relative_speed, 0.0),
                luminosity_w=3.8e26,
            ),
            Body(
                id="companion",
                kind="companion",
                mass_kg=companion_mass,
                radius_m=7.0e7,
                position_m=(primary_mass / total_mass * separation, 0.0, 0.0),
                velocity_m_s=(0.0, primary_mass / total_mass * relative_speed, 0.0),
                luminosity_w=0.0,
            ),
        ),
        sample_times_s=(0.0, pi / (2 * omega)),
        observer=Observer(target_body_id="primary", distance_m=3.0e17),
        epoch_jd_tdb=2_451_545.0,
        execution_mode=mode,  # type: ignore[arg-type]
        allow_analytic_two_body_test_fallback=fallback,
    )


def test_explicit_test_fallback_preserves_barycentre_and_is_not_scientific() -> None:
    request = circular_test_request()
    result = run_forward(request)

    assert result.manifest.engine == "analytic-circular-two-body-test"
    assert result.manifest.scientific_result is False
    assert result.manifest.epoch_jd_tdb == 2_451_545.0
    for sample in result.samples:
        primary = sample.positions_m["primary"]
        companion = sample.positions_m["companion"]
        barycentre = tuple(
            (2.0e30 * primary[index] + 2.0e27 * companion[index]) / (2.0e30 + 2.0e27)
            for index in range(3)
        )
        assert barycentre == pytest.approx((0.0, 0.0, 0.0), abs=1e-3)
    assert result.samples[1].positions_m["companion"][1] > 0
    assert result.samples[0].photocentre_offset_rad is not None
    assert result.samples[0].photocentre_offset_rad[2] == pytest.approx(0.0)
    assert result.manifest.validity_domain
    assert result.manifest.warnings


def test_sample_order_does_not_change_physical_samples() -> None:
    request = circular_test_request()
    reversed_request = ForwardRunRequest(
        bodies=request.bodies,
        sample_times_s=tuple(reversed(request.sample_times_s)),
        observer=request.observer,
        epoch_jd_tdb=request.epoch_jd_tdb,
        execution_mode="test",
        allow_analytic_two_body_test_fallback=True,
    )

    forward = {sample.time_offset_s: sample for sample in run_forward(request).samples}
    reverse = {
        sample.time_offset_s: sample for sample in run_forward(reversed_request).samples
    }
    assert forward.keys() == reverse.keys()
    for time in forward:
        assert forward[time].positions_m == pytest.approx(reverse[time].positions_m)


def test_epoch_defines_initial_state_independently_of_requested_order() -> None:
    request = circular_test_request()
    shifted = ForwardRunRequest(
        bodies=request.bodies,
        sample_times_s=(request.sample_times_s[1], 0.0),
        observer=request.observer,
        epoch_jd_tdb=request.epoch_jd_tdb,
        execution_mode="test",
        allow_analytic_two_body_test_fallback=True,
    )
    at_epoch = run_forward(shifted).samples[1]
    assert at_epoch.positions_m["primary"] == pytest.approx(
        request.bodies[0].position_m
    )
    assert at_epoch.velocities_m_s["primary"] == pytest.approx(
        request.bodies[0].velocity_m_s
    )


def test_research_mode_never_falls_back_when_scipy_is_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    request = circular_test_request(mode="research", fallback=False)
    import science_backend.forward as forward

    def missing_scipy(_: ForwardRunRequest, _cancel_requested=None):
        raise CapabilityUnavailableError("scipy missing")

    monkeypatch.setattr(forward, "_scipy_propagate", missing_scipy)
    with pytest.raises(CapabilityUnavailableError, match="scipy missing"):
        run_forward(request)


def test_test_mode_requires_explicit_fallback_opt_in() -> None:
    with pytest.raises(CapabilityUnavailableError, match="explicit analytic fallback"):
        run_forward(circular_test_request(fallback=False))


def test_fallback_rejects_non_circular_input() -> None:
    request = circular_test_request()
    stationary_primary = Body(
        id=request.bodies[0].id,
        kind=request.bodies[0].kind,
        mass_kg=request.bodies[0].mass_kg,
        radius_m=request.bodies[0].radius_m,
        position_m=request.bodies[0].position_m,
        velocity_m_s=(0.0, 0.0, 0.0),
    )
    invalid = Body(
        id="companion",
        kind="companion",
        mass_kg=2.0e27,
        radius_m=request.bodies[1].radius_m,
        position_m=request.bodies[1].position_m,
        velocity_m_s=(0.0, 0.0, 0.0),
    )
    with pytest.raises(ContractError, match="circular"):
        run_forward(
            ForwardRunRequest(
                bodies=(stationary_primary, invalid),
                sample_times_s=request.sample_times_s,
                observer=request.observer,
                epoch_jd_tdb=request.epoch_jd_tdb,
                execution_mode="test",
                allow_analytic_two_body_test_fallback=True,
            )
        )


def test_contract_rejects_non_barycentric_position_and_momentum() -> None:
    request = circular_test_request()
    displaced = Body(
        id=request.bodies[0].id,
        kind=request.bodies[0].kind,
        mass_kg=request.bodies[0].mass_kg,
        radius_m=request.bodies[0].radius_m,
        position_m=(1.0e8, 0.0, 0.0),
        velocity_m_s=request.bodies[0].velocity_m_s,
    )
    with pytest.raises(ContractError, match="not barycentric"):
        ForwardRunRequest(
            bodies=(displaced, request.bodies[1]),
            sample_times_s=request.sample_times_s,
            observer=request.observer,
            epoch_jd_tdb=request.epoch_jd_tdb,
        )

    boosted = Body(
        id=request.bodies[0].id,
        kind=request.bodies[0].kind,
        mass_kg=request.bodies[0].mass_kg,
        radius_m=request.bodies[0].radius_m,
        position_m=request.bodies[0].position_m,
        velocity_m_s=(0.0, 100.0, 0.0),
    )
    with pytest.raises(ContractError, match="zero total momentum"):
        ForwardRunRequest(
            bodies=(boosted, request.bodies[1]),
            sample_times_s=request.sample_times_s,
            observer=request.observer,
            epoch_jd_tdb=request.epoch_jd_tdb,
        )


def test_contract_requires_known_target_and_scipy_relative_tolerance_floor() -> None:
    request = circular_test_request()
    with pytest.raises(ContractError, match="identify a body"):
        ForwardRunRequest(
            bodies=request.bodies,
            sample_times_s=request.sample_times_s,
            observer=Observer(target_body_id="missing"),
            epoch_jd_tdb=request.epoch_jd_tdb,
        )
    with pytest.raises(ContractError, match="integrator_rtol"):
        ForwardRunRequest(
            bodies=request.bodies,
            sample_times_s=request.sample_times_s,
            observer=request.observer,
            epoch_jd_tdb=request.epoch_jd_tdb,
            integrator_rtol=MIN_RELATIVE_TOLERANCE / 2,
        )


def test_requests_canonicalize_mutable_body_and_sample_sequences() -> None:
    request = circular_test_request()
    bodies = list(request.bodies)
    sample_times = list(request.sample_times_s)
    canonical = ForwardRunRequest(
        bodies=bodies,
        sample_times_s=sample_times,
        observer=request.observer,
        epoch_jd_tdb=request.epoch_jd_tdb,
        execution_mode="test",
        allow_analytic_two_body_test_fallback=True,
    )
    bodies.pop()
    sample_times.append(5.0)

    assert canonical.bodies == request.bodies
    assert canonical.sample_times_s == request.sample_times_s


def test_contract_rejects_more_than_three_forward_bodies() -> None:
    request = circular_test_request()
    third = Body(
        id="third",
        kind="moon",
        mass_kg=1.0e20,
        radius_m=1.0,
        position_m=(0.0, 1.0e12, 0.0),
        velocity_m_s=(0.0, 0.0, 0.0),
    )
    fourth = Body(
        id="fourth",
        kind="moon",
        mass_kg=1.0e20,
        radius_m=1.0,
        position_m=(0.0, -1.0e12, 0.0),
        velocity_m_s=(0.0, 0.0, 0.0),
    )
    with pytest.raises(ContractError, match="at most 3"):
        ForwardRunRequest(
            bodies=(*request.bodies, third, fourth),
            sample_times_s=request.sample_times_s,
            observer=request.observer,
            epoch_jd_tdb=request.epoch_jd_tdb,
        )


def test_contract_rejects_initial_finite_radius_overlap() -> None:
    request = circular_test_request()
    separation = 1.0e8
    total_mass = sum(body.mass_kg for body in request.bodies)
    primary = Body(
        id="primary",
        kind="star",
        mass_kg=request.bodies[0].mass_kg,
        radius_m=request.bodies[0].radius_m,
        position_m=(-request.bodies[1].mass_kg / total_mass * separation, 0.0, 0.0),
        velocity_m_s=request.bodies[0].velocity_m_s,
    )
    close = Body(
        id="companion",
        kind="companion",
        mass_kg=request.bodies[1].mass_kg,
        radius_m=request.bodies[1].radius_m,
        position_m=(request.bodies[0].mass_kg / total_mass * separation, 0.0, 0.0),
        velocity_m_s=request.bodies[1].velocity_m_s,
    )
    with pytest.raises(ContractError, match="overlap/contact"):
        ForwardRunRequest(
            bodies=(primary, close),
            sample_times_s=request.sample_times_s,
            observer=request.observer,
            epoch_jd_tdb=request.epoch_jd_tdb,
        )


def test_manifest_records_separate_requested_and_effective_tolerances() -> None:
    result = run_forward(circular_test_request())
    tolerances = result.manifest.numerical_tolerances
    assert tolerances["requestedPositionToleranceM"] == 1e-3
    assert tolerances["effectivePositionToleranceM"] == 1e-3
    assert tolerances["requestedVelocityToleranceMps"] == 1e-6
    assert tolerances["effectiveVelocityToleranceMps"] == 1e-6
    assert tolerances["effectiveRelativeTolerance"] >= MIN_RELATIVE_TOLERANCE
    assert result.manifest.constants["G_SI"] == G_SI
    assert {
        "backend",
        "engine",
        "python",
        "scipy",
        "pyarrow",
    } <= result.manifest.software_versions.keys()


def test_research_propagation_fails_on_fast_in_and_out_finite_radius_contact() -> None:
    pytest.importorskip("scipy")
    mass = 1.0e20
    request = ForwardRunRequest(
        bodies=(
            Body("left", "planet", mass, 1.0e6, (-5.0e6, 0.0, 0.0), (5.0e3, 0.0, 0.0)),
            Body("right", "planet", mass, 1.0e6, (5.0e6, 0.0, 0.0), (-5.0e3, 0.0, 0.0)),
        ),
        sample_times_s=(0.0, 2_000.0),
        observer=Observer(target_body_id="left"),
        epoch_jd_tdb=2_451_545.0,
        # Endpoints are separated and the allowed step spans entry plus exit;
        # event endpoint signs alone therefore cannot prove collision freedom.
        integrator_max_step_s=2_000.0,
    )
    with pytest.raises(CollisionDomainError, match="finite-radius contact"):
        run_forward(request)


def test_collision_safety_optimizer_fails_closed_on_failure_or_nonfinite_result() -> (
    None
):
    import science_backend.forward as forward

    request = circular_test_request()
    solution = SimpleNamespace(
        sol=lambda _time: [
            *request.bodies[0].position_m,
            *request.bodies[0].velocity_m_s,
            *request.bodies[1].position_m,
            *request.bodies[1].velocity_m_s,
        ],
        t=(0.0, 1.0),
    )
    for optimizer_result in (
        SimpleNamespace(success=False, fun=1.0, x=0.5),
        SimpleNamespace(success=True, fun=float("nan"), x=0.5),
    ):
        with pytest.raises(
            CapabilityUnavailableError, match="collision safety optimizer"
        ):
            forward._assert_dense_solution_avoids_contact(
                tuple(request.bodies),
                cast(forward.OdeSolution, solution),
                cast(
                    Callable[..., forward.OptimizerResult],
                    lambda *_args, optimizer_result=optimizer_result, **_kwargs: (
                        optimizer_result
                    ),
                ),
                None,
            )


def test_collision_safety_uses_the_time_of_an_endpoint_minimum() -> None:
    import science_backend.forward as forward

    dense_solution = lambda time: [
        0.0,
        0.0,
        0.0,
        0.0,
        0.0,
        0.0,
        0.0 if time == 0.0 else 10.0,
        0.0,
        0.0,
        0.0,
        0.0,
        0.0,
    ]
    optimizer = lambda *_args, **_kwargs: SimpleNamespace(
        success=True, fun=25.0, x=0.5
    )

    minimum_squared, minimum_time = forward._minimum_separation_squared(
        dense_solution,
        0,
        1,
        0.0,
        1.0,
        cast(Callable[..., forward.OptimizerResult], optimizer),
        None,
        forward._WorkBudget.start(),
    )

    assert minimum_squared == 0.0
    assert minimum_time == 0.0


def test_research_propagation_supports_backward_offsets() -> None:
    pytest.importorskip("scipy")
    request = circular_test_request(mode="research", fallback=False)
    backward = ForwardRunRequest(
        bodies=request.bodies,
        sample_times_s=(0.0, -1_000.0),
        observer=request.observer,
        epoch_jd_tdb=request.epoch_jd_tdb,
        execution_mode="research",
    )

    assert tuple(sample.time_offset_s for sample in run_forward(backward).samples) == (
        0.0,
        -1_000.0,
    )
