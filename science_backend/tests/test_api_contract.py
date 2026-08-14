"""Verify the loopback API contract, bounded job lifecycle, and artifacts."""

from __future__ import annotations

import json
import subprocess
import sys
from collections.abc import Callable
from copy import deepcopy
from dataclasses import replace
from importlib.util import find_spec
from math import sqrt
from pathlib import Path
from threading import Event
from time import sleep
from types import SimpleNamespace
from typing import cast

import pytest

import science_backend.api as api
from science_backend.contracts import (
    G_SI,
    MAX_FORWARD_BODIES,
    MAX_FORWARD_SAMPLES,
    MAX_INTEGRATOR_STEPS,
    ForwardRunRequest,
)
from science_backend.errors import ContractError, JobCancelledError, JobCapacityError
from science_backend.forward import run_forward as core_run_forward


def forward_payload() -> dict:
    primary_mass = 2.0e30
    companion_mass = 2.0e27
    total_mass = primary_mass + companion_mass
    separation_m = 1.0e11
    relative_speed_m_s = sqrt(G_SI * total_mass / separation_m)
    return {
        "kind": "forward",
        "scenario": {
            "schemaVersion": "v5",
            "id": "api-contract",
            "epochJdTdb": 2_461_236.5,
            "timeScale": "TDB",
            "bodies": [
                {
                    "id": "primary",
                    "kind": "star",
                    "massKg": primary_mass,
                    "radiusM": 6.0e8,
                    "state": {
                        "positionM": [
                            -(companion_mass / total_mass) * separation_m,
                            0.0,
                            0.0,
                        ],
                        "velocityMps": [
                            0.0,
                            -(companion_mass / total_mass) * relative_speed_m_s,
                            0.0,
                        ],
                    },
                },
                {
                    "id": "companion",
                    "kind": "companion",
                    "massKg": companion_mass,
                    "radiusM": 7.0e7,
                    "state": {
                        "positionM": [
                            (primary_mass / total_mass) * separation_m,
                            0.0,
                            0.0,
                        ],
                        "velocityMps": [
                            0.0,
                            (primary_mass / total_mass) * relative_speed_m_s,
                            0.0,
                        ],
                    },
                },
            ],
            "observer": {"lineOfSight": [0.0, 0.0, 1.0], "targetBodyId": "primary"},
            "integrator": {
                "method": "DOP853",
                "positionToleranceM": 2.0e-3,
                "velocityToleranceMps": 3.0e-6,
                "relativeTolerance": 4.0e-11,
                "maxStepSec": 500.0,
            },
        },
        "startOffsetSec": 0.0,
        "endOffsetSec": 1_000.0,
        "sampleCadenceSec": 500.0,
        "outputs": ["radial-velocity"],
        "seed": 17,
    }


CONTRACT_CASES = json.loads(
    (Path(__file__).parents[2] / "contracts/science-v5/contract-cases.json").read_text()
)


def available_capabilities() -> api._CapabilitySnapshot:
    return api._CapabilitySnapshot(True, True, True)


def client_or_skip():
    pytest.importorskip("fastapi")
    if find_spec("httpx2") is None:
        pytest.skip("httpx2 is required for FastAPI TestClient coverage")
    from fastapi.testclient import TestClient

    return TestClient


def fake_arrow_writer(result_id: str = "a" * 64):
    def write(_result, artifact_root, **kwargs):
        temporary = artifact_root / ".test-arrow.tmp"
        temporary.write_bytes(b"test artifact")
        promote = kwargs["promote"]
        assert promote(result_id, temporary, artifact_root / f"{result_id}.arrow")
        return result_id

    return write


def test_browser_cors_origins_cover_vite_dev_preview_and_e2e_ports() -> None:
    assert api.BROWSER_CORS_ORIGINS == (
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://127.0.0.1:4173",
        "http://localhost:4173",
        "http://127.0.0.1:4174",
        "http://localhost:4174",
    )


def test_service_api_import_does_not_eagerly_load_scientific_audit_dependencies() -> (
    None
):
    result = subprocess.run(
        [
            sys.executable,
            "-B",
            "-c",
            "import sys; import science_backend.api; "
            "assert 'science_backend.dop853_collision_audit' not in sys.modules; "
            "assert 'numpy' not in sys.modules",
        ],
        check=False,
        capture_output=True,
        text=True,
        cwd=Path(__file__).parents[1],
    )

    assert result.returncode == 0, result.stderr


def test_http_translation_preserves_kind_radius_epoch_target_and_tolerances() -> None:
    request, seed = api._forward_request(forward_payload())

    assert seed == 17
    assert request.epoch_jd_tdb == 2_461_236.5
    assert request.observer.target_body_id == "primary"
    assert [(body.kind, body.radius_m) for body in request.bodies] == [
        ("star", 6.0e8),
        ("companion", 7.0e7),
    ]
    assert request.position_tolerance_m == 2.0e-3
    assert request.velocity_tolerance_m_s == 3.0e-6
    assert request.integrator_rtol == 4.0e-11


def test_http_translation_rejects_unknown_fields_and_missing_target() -> None:
    unknown = forward_payload()
    unknown["scenario"]["bodies"][0]["ignoredRadius"] = 1
    with pytest.raises(ContractError, match="unsupported fields"):
        api._forward_request(unknown)

    missing_target = forward_payload()
    del missing_target["scenario"]["observer"]["targetBodyId"]
    with pytest.raises(ContractError, match="missing required fields"):
        api._forward_request(missing_target)


@pytest.mark.parametrize(
    ("label", "identifier", "is_valid"),
    [
        ("whitespace", "   ", False),
        ("128 ASCII code points", "a" * 128, True),
        ("129 ASCII code points", "a" * 129, False),
        ("128 combining code points", "e\u0301" * 64, True),
        ("130 combining code points", "e\u0301" * 65, False),
        ("128 emoji code points", "😀" * 128, True),
        ("129 emoji code points", "😀" * 129, False),
    ],
)
def test_http_translation_enforces_v5_scenario_identifier_bounds(
    label: str, identifier: str, is_valid: bool
) -> None:
    payload = forward_payload()
    payload["scenario"]["id"] = identifier

    if is_valid:
        api._forward_request(payload)
    else:
        with pytest.raises(ContractError, match=r"request\.scenario\.id"):
            api._forward_request(payload)


@pytest.mark.parametrize(
    ("label", "identifier", "is_valid"),
    [
        ("whitespace", "   ", False),
        ("128 ASCII code points", "a" * 128, True),
        ("129 ASCII code points", "a" * 129, False),
        ("128 combining code points", "e\u0301" * 64, True),
        ("130 combining code points", "e\u0301" * 65, False),
        ("128 emoji code points", "😀" * 128, True),
        ("129 emoji code points", "😀" * 129, False),
    ],
)
def test_http_translation_enforces_v5_body_identifier_bounds(
    label: str, identifier: str, is_valid: bool
) -> None:
    payload = forward_payload()
    payload["scenario"]["bodies"][0]["id"] = identifier
    payload["scenario"]["observer"]["targetBodyId"] = identifier

    if is_valid:
        api._forward_request(payload)
    else:
        with pytest.raises(ContractError, match=r"request\.scenario\.bodies\[0\]\.id"):
            api._forward_request(payload)


@pytest.mark.parametrize(
    ("label", "identifier", "is_valid"),
    [
        ("whitespace", "   ", False),
        ("128 ASCII code points", "a" * 128, True),
        ("129 ASCII code points", "a" * 129, False),
        ("128 combining code points", "e\u0301" * 64, True),
        ("130 combining code points", "e\u0301" * 65, False),
        ("128 emoji code points", "😀" * 128, True),
        ("129 emoji code points", "😀" * 129, False),
    ],
)
def test_http_translation_validates_observer_identifier_before_body_membership(
    label: str, identifier: str, is_valid: bool
) -> None:
    payload = forward_payload()
    if is_valid:
        payload["scenario"]["bodies"][0]["id"] = identifier
    payload["scenario"]["observer"]["targetBodyId"] = identifier

    if is_valid:
        api._forward_request(payload)
    else:
        with pytest.raises(
            ContractError, match=r"request\.scenario\.observer\.targetBodyId"
        ):
            api._forward_request(payload)


def test_http_translation_rejects_oversized_or_non_finite_sample_grids() -> None:
    oversized = forward_payload()
    oversized["endOffsetSec"] = api.MAX_FORWARD_SAMPLES + 1
    oversized["sampleCadenceSec"] = 1
    with pytest.raises(ContractError, match="at most"):
        api._forward_request(oversized)

    non_finite_count = forward_payload()
    non_finite_count["endOffsetSec"] = 1.0e308
    non_finite_count["sampleCadenceSec"] = 1.0e-300
    with pytest.raises(ContractError, match="finite sample count"):
        api._forward_request(non_finite_count)

    unrepresentable = forward_payload()
    unrepresentable["startOffsetSec"] = 1.0e16
    unrepresentable["endOffsetSec"] = 1.0e16 + 4.0
    unrepresentable["sampleCadenceSec"] = 1.0
    with pytest.raises(ContractError, match="strictly increasing"):
        api._forward_request(unrepresentable)

    excessive_steps = forward_payload()
    excessive_steps["endOffsetSec"] = MAX_INTEGRATOR_STEPS + 1
    excessive_steps["sampleCadenceSec"] = MAX_INTEGRATOR_STEPS + 1
    excessive_steps["scenario"]["integrator"]["maxStepSec"] = 1
    with pytest.raises(ContractError, match=str(MAX_INTEGRATOR_STEPS)):
        api._forward_request(excessive_steps)

    non_finite_steps = forward_payload()
    non_finite_steps["endOffsetSec"] = 1.0e308
    non_finite_steps["sampleCadenceSec"] = 1.0e308
    non_finite_steps["scenario"]["integrator"]["maxStepSec"] = 1.0e-300
    with pytest.raises(ContractError, match=str(MAX_INTEGRATOR_STEPS)):
        api._forward_request(non_finite_steps)


def test_http_result_manifest_round_trips_epoch_versions_g_and_tolerances(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    monkeypatch.setenv("OTHERLIGHT_BUILD", "test-build")

    def fake_run(request: ForwardRunRequest, *, cancel_requested=None):
        test_request = replace(
            request,
            execution_mode="test",
            allow_analytic_two_body_test_fallback=True,
        )
        result = core_run_forward(test_request)
        return replace(
            result,
            manifest=replace(
                result.manifest, scientific_result=True, engine="test-engine"
            ),
        )

    service = api.V5ApiService(
        tmp_path,
        runner=fake_run,
        artifact_writer=fake_arrow_writer(),
        capabilities=available_capabilities(),
    )

    submitted = service.submit(forward_payload())
    status = service.wait_for_terminal(submitted["id"], timeout=2)
    assert status["state"] == "succeeded"
    result = service.result(status["id"])
    assert result is not None
    manifest = result["runManifest"]
    expected_result = CONTRACT_CASES["validForwardResult"]
    assert set(result) == set(expected_result)
    assert set(manifest) == set(expected_result["runManifest"])
    assert manifest["scientificResult"] is True
    assert manifest["epochJdTdb"] == 2_461_236.5
    assert manifest["gravitationalConstantM3KgS2"] == G_SI
    assert set(manifest["implementation"]) == {
        "application",
        "engine",
        "runtime",
        "artifactWriter",
        "platform",
    }
    assert manifest["implementation"]["application"]["name"] == (
        "otherlight-science-backend"
    )
    assert manifest["implementation"]["application"]["version"] == api.SERVICE_VERSION
    assert manifest["implementation"]["application"]["build"] == "test-build"
    assert manifest["implementation"]["engine"]["kind"] == "python-scipy"
    assert manifest["artifact"] == {
        "idSha256": result["arrowArtifactId"],
        "format": "arrow-ipc-file",
        "schemaVersion": "radial-velocity-v1",
        "rowCount": 3,
    }
    assert manifest["numericalTolerances"] == {
        "requestedPositionToleranceM": 2.0e-3,
        "effectivePositionToleranceM": 2.0e-3,
        "requestedVelocityToleranceMps": 3.0e-6,
        "effectiveVelocityToleranceMps": 3.0e-6,
        "requestedRelativeTolerance": 4.0e-11,
        "effectiveRelativeTolerance": 4.0e-11,
        "requestedMaxStepSec": 500.0,
        "effectiveMaxStepSec": 500.0,
    }
    rerun = service.submit(forward_payload())
    rerun_terminal = service.wait_for_terminal(rerun["id"], timeout=2)
    assert rerun["id"] != submitted["id"]
    assert rerun_terminal["state"] == "succeeded"
    rerun_result = service.result(rerun["id"])
    assert rerun_result is not None
    assert rerun_result["runManifest"]["inputHashSha256"] == manifest["inputHashSha256"]
    service.close()


def test_cancellation_prevents_success_and_artifact_publication(tmp_path) -> None:
    started = Event()
    artifact_writes: list[bool] = []

    def blocking_run(_request: ForwardRunRequest, *, cancel_requested=None):
        assert cancel_requested is not None
        started.set()
        while not cancel_requested():
            sleep(0.001)
        raise JobCancelledError("cancelled in test")

    service = api.V5ApiService(
        tmp_path,
        runner=blocking_run,
        artifact_writer=lambda _result, _root, **_kwargs: (
            artifact_writes.append(True) or "a" * 64
        ),
        capabilities=available_capabilities(),
    )

    submitted = service.submit(forward_payload())
    assert started.wait(timeout=1)
    cancelled = service.cancel(submitted["id"])
    terminal = service.wait_for_terminal(submitted["id"], timeout=2)

    assert cancelled["state"] == "cancelled"
    assert terminal["state"] == "cancelled"
    assert service.result(submitted["id"]) is None
    assert artifact_writes == []
    service.close()


def test_wall_deadline_is_reported_as_exhausted_work_budget(tmp_path) -> None:
    artifact_writes: list[bool] = []

    def deadline_checking_run(_request: ForwardRunRequest, *, cancel_requested=None):
        assert cancel_requested is not None
        cancel_requested()
        raise AssertionError("an expired deadline must interrupt the run")

    service = api.V5ApiService(
        tmp_path,
        runner=deadline_checking_run,
        artifact_writer=lambda _result, _root, **_kwargs: (
            artifact_writes.append(True) or "a" * 64
        ),
        capabilities=available_capabilities(),
        wall_time_seconds=0,
    )

    submitted = service.submit(forward_payload())
    terminal = service.wait_for_terminal(submitted["id"], timeout=2)

    assert terminal["state"] == "failed"
    assert terminal["error"]["code"] == "work-budget-exhausted"
    assert artifact_writes == []
    service.close()


def test_service_rejects_work_above_outstanding_capacity(tmp_path) -> None:
    started = Event()

    def blocking_run(_request: ForwardRunRequest, *, cancel_requested=None):
        assert cancel_requested is not None
        started.set()
        while not cancel_requested():
            sleep(0.001)
        raise JobCancelledError("cancelled in capacity test")

    service = api.V5ApiService(
        tmp_path,
        max_outstanding_jobs=1,
        runner=blocking_run,
        capabilities=available_capabilities(),
    )

    first = service.submit(forward_payload())
    assert started.wait(timeout=1)
    with pytest.raises(JobCapacityError, match="capacity is exhausted"):
        service.submit(forward_payload())

    service.cancel(first["id"])
    assert service.wait_for_terminal(first["id"], timeout=2)["state"] == "cancelled"
    service.close()


def test_service_evicts_oldest_terminal_jobs_at_retention_limit(tmp_path) -> None:
    def fake_run(request: ForwardRunRequest, *, cancel_requested=None):
        test_request = replace(
            request,
            execution_mode="test",
            allow_analytic_two_body_test_fallback=True,
        )
        result = core_run_forward(test_request)
        return replace(
            result,
            manifest=replace(
                result.manifest, scientific_result=True, engine="test-engine"
            ),
        )

    service = api.V5ApiService(
        tmp_path,
        max_terminal_jobs=2,
        runner=fake_run,
        artifact_writer=fake_arrow_writer(),
        capabilities=available_capabilities(),
    )

    job_ids: list[str] = []
    for _ in range(3):
        submitted = service.submit(forward_payload())
        assert (
            service.wait_for_terminal(submitted["id"], timeout=2)["state"]
            == "succeeded"
        )
        job_ids.append(submitted["id"])

    with pytest.raises(KeyError):
        service.status(job_ids[0])
    assert service.status(job_ids[1])["state"] == "succeeded"
    assert service.status(job_ids[2])["state"] == "succeeded"
    assert len(service.jobs) == 2
    service.close()


def test_shared_contract_fixture_limits_and_valid_request() -> None:
    limits = CONTRACT_CASES["limits"]
    request, seed = api._forward_request(CONTRACT_CASES["validForwardRequest"])

    assert limits["maxForwardBodies"] == MAX_FORWARD_BODIES
    assert limits["maxForwardSamples"] == MAX_FORWARD_SAMPLES
    assert len(request.bodies) == 2
    assert len(request.sample_times_s) == 1_441
    assert seed == CONTRACT_CASES["validForwardRequest"]["seed"]


def test_shared_contract_fixture_rejects_four_body_request_as_invalid_contract(
    tmp_path,
) -> None:
    TestClient = client_or_skip()

    payload = deepcopy(CONTRACT_CASES["validForwardRequest"])
    payload["scenario"]["bodies"].extend(
        CONTRACT_CASES["tooManyBodiesCase"]["additionalBodies"]
    )
    expected = CONTRACT_CASES["tooManyBodiesCase"]["expected"]
    service = api.V5ApiService(tmp_path, capabilities=available_capabilities())
    with TestClient(api.create_app(service)) as client:
        response = client.post("/v1/jobs", json=payload)
    service.close()

    assert response.status_code == 422
    assert response.json()["code"] == expected["code"]
    assert expected["path"] in response.json()["message"]
    assert expected["messageIncludes"] in response.json()["message"]


def test_shared_contract_fixture_public_error_envelopes_and_result_shape(
    tmp_path,
) -> None:
    TestClient = client_or_skip()

    service = api.V5ApiService(tmp_path)
    pending = api._ApiJob(
        {"id": "pending", "kind": "forward", "state": "running", "progress": 0},
        None,
        Event(),
        Event(),
    )
    terminal = api._ApiJob(
        {"id": "terminal", "kind": "forward", "state": "succeeded", "progress": 1},
        None,
        Event(),
        Event(),
    )
    terminal.terminal.set()
    service.jobs.update(pending=pending, terminal=terminal)
    expected = CONTRACT_CASES["errorEnvelopes"]
    with TestClient(api.create_app(service)) as client:
        responses = (
            client.get("/v1/jobs/missing"),
            client.get("/v1/artifacts/not-a-digest"),
            client.get("/v1/jobs/pending/result"),
            client.delete("/v1/jobs/terminal"),
        )
    service.close()

    for response, fixture in zip(responses, expected, strict=True):
        assert response.status_code == fixture["status"]
        assert response.json() == {
            "code": fixture["code"],
            "message": fixture["message"],
        }
    result = CONTRACT_CASES["validForwardResult"]
    assert set(result) == {"kind", "arrowArtifactId", "runManifest"}
    assert len(result["arrowArtifactId"]) == 64
    assert {"schemaVersion", "runId", "inputHashSha256", "scientificResult"} <= set(
        result["runManifest"]
    )


def test_lifespan_closes_only_the_service_it_created() -> None:
    TestClient = client_or_skip()

    created: list[RecordingService] = []

    class RecordingService:
        def __init__(self) -> None:
            self.artifact_root = Path(".")
            self.closed = False
            created.append(self)

        def close(self) -> None:
            self.closed = True

    with TestClient(
        api.create_app(
            service_factory=cast(Callable[[], api.V5ApiService], RecordingService)
        )
    ):
        pass
    external = RecordingService()
    with TestClient(api.create_app(cast(api.V5ApiService, external))):
        pass

    assert created[0].closed is True
    assert external.closed is False


def test_cancelled_arrow_write_leaves_no_temporary_or_final_artifact(tmp_path) -> None:
    pytest.importorskip("pyarrow")
    result = SimpleNamespace(
        samples=(SimpleNamespace(time_offset_s=0.0, radial_velocity_m_s=0.0),),
    )
    checks = iter((False, True))

    with pytest.raises(JobCancelledError):
        api._write_arrow(result, tmp_path, cancel_requested=lambda: next(checks))

    assert list(tmp_path.iterdir()) == []
