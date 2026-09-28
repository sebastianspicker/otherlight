"""Verify strict V6 dataset imports, quotas, leases, and HTTP boundaries."""

from __future__ import annotations

import json
import sys
from concurrent.futures import ThreadPoolExecutor
from functools import partial
from hashlib import sha256
from importlib.util import find_spec
from pathlib import Path
from typing import Any, cast

import pytest

import science_backend.api as api
from science_backend import api_v2_dataset_validation as dataset_validation
from science_backend.canonical_json import canonical_json
from science_backend.errors import (
    ContractError,
    DatasetCapacityError,
    DatasetInUseError,
)

CONTRACT_CASES = json.loads(
    (Path(__file__).parents[3] / "contracts/science-v6/contract-cases.json").read_text()
)


def payload(kind: str = "passband-response") -> dict:
    if kind == "passband-response":
        return {
            "schemaVersion": "science-dataset-v2",
            "kind": kind,
            "units": {"wavelengthM": "m", "response": "1"},
            "wavelengthM": [4.0e-7, 5.0e-7, 6.0e-7],
            "response": [0.1, 1.0, 0.2],
        }
    if kind == "stellar-intensity-grid":
        return {
            "schemaVersion": "science-dataset-v2",
            "kind": kind,
            "units": {
                "wavelengthM": "m",
                "mu": "1",
                "intensityWm3Sr": "W m^-3 sr^-1",
            },
            "wavelengthM": [4.0e-7, 5.0e-7],
            "mu": [0.0, 0.5, 1.0],
            "intensityWm3Sr": [[1.0, 2.0, 3.0], [4.0, 5.0, 6.0]],
        }
    if kind == "atmospheric-profile":
        return {
            "schemaVersion": "science-dataset-v2",
            "kind": kind,
            "representation": "effective-radius",
            "units": {"wavelengthM": "m", "effectiveRadiusM": "m"},
            "wavelengthM": [4.0e-7, 5.0e-7],
            "effectiveRadiusM": [7.0e7, 7.1e7],
        }
    if kind == "scattering-phase-function":
        return {
            "schemaVersion": "science-dataset-v2",
            "kind": kind,
            "units": {"scatteringAngleRad": "rad", "phaseFunctionSrInv": "sr^-1"},
            "scatteringAngleRad": [0.0, 1.0, 3.141592653589793],
            "phaseFunctionSrInv": [2.0, 0.5, 0.1],
        }
    if kind == "stellar-variability-psd":
        return {
            "schemaVersion": "science-dataset-v2",
            "kind": kind,
            "units": {"frequencyHz": "Hz", "powerSpectralDensityPerHz": "Hz^-1"},
            "frequencyHz": [1.0e-6, 2.0e-6],
            "powerSpectralDensityPerHz": [0.1, 0.2],
        }
    raise AssertionError(kind)


def encoded(value: dict, *, indent: int | None = None) -> bytes:
    return json.dumps(
        value, indent=indent, separators=None if indent else (",", ":")
    ).encode()


@pytest.mark.parametrize(
    "kind",
    [
        "passband-response",
        "stellar-intensity-grid",
        "atmospheric-profile",
        "scattering-phase-function",
        "stellar-variability-psd",
    ],
)
def test_all_v6_dataset_families_receive_content_addressed_metadata(kind: str) -> None:
    source = encoded(payload(kind), indent=2)
    descriptor = api.V6DatasetRegistry().import_bytes(source)
    canonical_hash = sha256(canonical_json(payload(kind)).encode()).hexdigest()

    assert descriptor == {
        "schemaVersion": "science-dataset-descriptor-v2",
        "id": f"ds-{canonical_hash}",
        "sourceByteSha256": sha256(source).hexdigest(),
        "contentSha256": canonical_hash,
        "kind": kind,
        "sampleCount": 6
        if kind == "stellar-intensity-grid"
        else len(
            next(
                value
                for key, value in payload(kind).items()
                if key in {"wavelengthM", "scatteringAngleRad", "frequencyHz"}
            )
        ),
        "mediaType": api.DATASET_MEDIA_TYPE,
    }


def test_shared_v6_dataset_fixtures_match_python_validator() -> None:
    for name, fixture in CONTRACT_CASES["validImports"].items():
        descriptor = api.V6DatasetRegistry().import_bytes(encoded(fixture))
        assert descriptor["kind"] == fixture["kind"]
        assert (
            descriptor["contentSha256"]
            == CONTRACT_CASES["validImportContentSha256"][name]
        )

    for name in ("unknownField", "wrongUnit", "nonMonotonic"):
        with pytest.raises(ContractError):
            api.V6DatasetRegistry().import_bytes(
                encoded(CONTRACT_CASES["invalidImports"][name])
            )


def test_semantically_identical_import_is_idempotent_without_consuming_quota() -> None:
    registry = api.V6DatasetRegistry(max_datasets=1)
    first = registry.import_bytes(encoded(payload(), indent=2))
    duplicate, created = registry.import_bytes_with_status(encoded(payload()))

    assert created is False
    assert duplicate == first
    with pytest.raises(DatasetCapacityError, match="at most 1"):
        different = payload()
        different["response"] = [0.2, 1.0, 0.2]
        registry.import_bytes(encoded(different))


def test_duplicate_is_resolved_before_freezing_and_preserves_first_source_hash(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    registry = api.V6DatasetRegistry(max_datasets=1)
    first_source = encoded(payload(), indent=2)
    first = registry.import_bytes(first_source)

    def fail_if_frozen(_value):
        raise AssertionError("an admitted canonical duplicate must not be frozen again")

    monkeypatch.setattr(dataset_validation, "freeze_and_measure_owned", fail_if_frozen)
    duplicate = registry.import_bytes(encoded(payload()))

    assert duplicate == first
    assert duplicate["sourceByteSha256"] == sha256(first_source).hexdigest()


def test_freeze_and_measure_counts_shared_objects_once() -> None:
    shared = [1.0, 2.0]
    frozen, measured = dataset_validation.freeze_and_measure(
        {"left": shared, "right": shared}
    )
    duplicated, duplicated_size = dataset_validation.freeze_and_measure(
        {"left": [1.0, 2.0], "right": [1.0, 2.0]}
    )

    assert frozen["left"] is frozen["right"]
    assert frozen["left"] == duplicated["left"]
    assert measured < duplicated_size


def test_owned_freeze_exactly_counts_backing_mapping_proxy_and_shared_values() -> None:
    shared = [1.0, 2.0]
    owned = {"left": shared, "right": shared}
    frozen, measured = dataset_validation.freeze_and_measure_owned(owned)
    frozen_values = frozen["left"]
    expected = sum(
        sys.getsizeof(value)
        for value in (
            owned,
            frozen,
            "left",
            "right",
            frozen_values,
            frozen_values[0],
            frozen_values[1],
        )
    )

    assert frozen["left"] is frozen["right"]
    assert measured == expected


def test_freeze_json_preserves_caller_owned_mapping() -> None:
    original = {"nested": {"value": [1, 2]}}
    frozen = dataset_validation.freeze_json(original)
    original["nested"]["value"].append(3)

    assert frozen["nested"]["value"] == (1, 2)


@pytest.mark.parametrize(
    ("mutate", "message"),
    [
        (lambda value: value.update(extra=True), "unsupported fields"),
        (lambda value: value["units"].update(wavelengthM="nm"), "must be 'm'"),
        (lambda value: value.update(wavelengthM=[5.0e-7, 4.0e-7]), "increasing"),
        (lambda value: value.update(response=[0.1, 1.1]), "between"),
    ],
)
def test_dataset_validation_rejects_unknown_units_axes_and_bounds(
    mutate, message: str
) -> None:
    value = payload()
    mutate(value)
    with pytest.raises(ContractError, match=message):
        api.V6DatasetRegistry().import_bytes(encoded(value))


@pytest.mark.parametrize(
    "source",
    [
        b'{"schemaVersion":"science-dataset-v2","kind":"passband-response","kind":"passband-response"}',
        b'{"kind":"passband-response","units":{"wavelengthM":"m","wavelengthM":"m"}}',
        b"\xff",
        b'{"kind": NaN}',
        b'{"kind":"\\ud800"}',
    ],
)
def test_dataset_parser_rejects_duplicates_invalid_utf8_nonfinite_and_surrogates(
    source: bytes,
) -> None:
    with pytest.raises(ContractError):
        api.V6DatasetRegistry().import_bytes(source)


def test_registry_enforces_sample_memory_and_source_byte_limits() -> None:
    sample_limited = api.V6DatasetRegistry(max_aggregate_samples=2)
    with pytest.raises(DatasetCapacityError, match="sample limit"):
        sample_limited.import_bytes(encoded(payload()))

    memory_limited = api.V6DatasetRegistry(max_normalized_bytes=1)
    with pytest.raises(DatasetCapacityError, match="normalized-memory"):
        memory_limited.import_bytes(encoded(payload()))

    with pytest.raises(DatasetCapacityError, match="byte limit"):
        api.V6DatasetRegistry().import_bytes(b" " * (api.MAX_DATASET_BYTES + 1))

    oversized = payload()
    oversized["wavelengthM"] = [4.0e-7 + index * 1.0e-12 for index in range(100_001)]
    oversized["response"] = [0.5] * 100_001
    with pytest.raises(DatasetCapacityError, match="100000"):
        api.V6DatasetRegistry().import_bytes(encoded(oversized))


def test_dataset_parser_rejects_excessive_nesting() -> None:
    nested: dict = {}
    cursor = nested
    for _ in range(33):
        child: dict = {}
        cursor["nested"] = child
        cursor = child
    with pytest.raises(ContractError, match="nesting"):
        api.V6DatasetRegistry().import_bytes(encoded(nested))


def test_dataset_lease_linearizes_deletion_and_close_clears_state() -> None:
    registry = api.V6DatasetRegistry()
    descriptor = registry.import_bytes(encoded(payload()))
    with registry.using([descriptor["id"]]) as datasets:
        assert datasets[0].content_sha256 == descriptor["contentSha256"]
        with pytest.raises(TypeError):
            cast(Any, datasets[0].payload)["kind"] = "mutated"
        with pytest.raises(DatasetInUseError):
            registry.delete(descriptor["id"])
    assert registry.delete(descriptor["id"]) == descriptor
    registry.import_bytes(encoded(payload()))
    registry.close()
    assert registry.list() == []


def test_concurrent_identical_imports_admit_one_dataset() -> None:
    registry = api.V6DatasetRegistry(max_datasets=1)
    source = encoded(payload())
    with ThreadPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(registry.import_bytes_with_status, [source] * 4))

    assert sum(created for _descriptor, created in results) == 1
    assert len({descriptor["id"] for descriptor, _created in results}) == 1
    assert len(registry.list()) == 1


def client_or_skip():
    pytest.importorskip("fastapi")
    if find_spec("httpx2") is None:
        pytest.skip("httpx2 is required for FastAPI TestClient coverage")
    from fastapi.testclient import TestClient

    return partial(TestClient, base_url="http://127.0.0.1")


def test_v2_http_import_metadata_idempotence_delete_and_security_headers(
    tmp_path,
) -> None:
    test_client = client_or_skip()
    registry = api.V6DatasetRegistry()
    service = api.V5ApiService(
        tmp_path,
        capabilities=api._CapabilitySnapshot(False, False, False),
    )
    with test_client(
        api.create_app(service=service, dataset_registry=registry)
    ) as client:
        headers = {"content-type": api.DATASET_MEDIA_TYPE}
        imported = client.post(
            "/v2/datasets", content=encoded(payload()), headers=headers
        )
        assert imported.status_code == 201
        identifier = imported.json()["id"]
        assert imported.headers["cache-control"] == "no-store"
        assert imported.headers["x-content-type-options"] == "nosniff"
        assert (
            client.post(
                "/v2/datasets", content=encoded(payload(), indent=2), headers=headers
            ).status_code
            == 200
        )
        assert client.get(f"/v2/datasets/{identifier}").json()["id"] == identifier
        assert client.get("/v2/datasets").json()["datasets"][0]["id"] == identifier
        assert client.delete(f"/v2/datasets/{identifier}").status_code == 200
        assert client.get(f"/v2/datasets/{identifier}").status_code == 404
    service.close()


@pytest.mark.parametrize(
    ("headers", "status", "code"),
    [
        ({"host": "attacker.invalid"}, 400, "invalid-host"),
        ({"origin": "https://attacker.invalid"}, 403, "invalid-origin"),
        ({"content-type": "application/json"}, 415, "unsupported-media-type"),
        (
            {
                "content-type": api.DATASET_MEDIA_TYPE,
                "content-encoding": "gzip",
            },
            415,
            "unsupported-media-type",
        ),
    ],
)
def test_v2_http_rejects_host_origin_media_and_compression(
    tmp_path, headers: dict[str, str], status: int, code: str
) -> None:
    test_client = client_or_skip()
    service = api.V5ApiService(
        tmp_path,
        capabilities=api._CapabilitySnapshot(False, False, False),
    )
    client_context = test_client(
        api.create_app(service=service, dataset_registry=api.V6DatasetRegistry())
    )
    with client_context as client:
        response = client.post(
            "/v2/datasets", content=encoded(payload()), headers=headers
        )
        assert response.status_code == status
        assert response.json()["code"] == code
        assert response.headers["cache-control"] == "no-store"
        assert response.headers["x-content-type-options"] == "nosniff"
    service.close()


def test_loopback_security_boundary_also_protects_v1(tmp_path) -> None:
    test_client = client_or_skip()
    service = api.V5ApiService(
        tmp_path,
        capabilities=api._CapabilitySnapshot(False, False, False),
    )
    with test_client(api.create_app(service=service)) as client:
        allowed = client.get("/v1/capabilities")
        assert allowed.status_code == 200
        assert allowed.headers["content-type"] == "application/json"
        assert allowed.headers["cache-control"] == "no-store"
        assert allowed.headers["x-content-type-options"] == "nosniff"
        assert (
            client.get("/v1/capabilities", headers={"host": "attacker.invalid"}).json()[
                "code"
            ]
            == "invalid-host"
        )
        assert (
            client.get(
                "/v1/capabilities", headers={"origin": "https://attacker.invalid"}
            ).json()["code"]
            == "invalid-origin"
        )
        assert (
            client.get(
                "/v1/capabilities", headers={"origin": "http://localhost:5173"}
            ).status_code
            == 200
        )
    service.close()


def test_v2_http_rejects_declared_and_streamed_oversize_bodies(tmp_path) -> None:
    test_client = client_or_skip()
    service = api.V5ApiService(
        tmp_path,
        capabilities=api._CapabilitySnapshot(False, False, False),
    )
    app = api.create_app(service=service, dataset_registry=api.V6DatasetRegistry())
    with test_client(app) as client:
        declared = client.post(
            "/v2/datasets",
            content=b"{}",
            headers={
                "content-type": api.DATASET_MEDIA_TYPE,
                "content-length": str(api.MAX_DATASET_BYTES + 1),
            },
        )
        streamed = client.post(
            "/v2/datasets",
            content=(b"x" * (1024 * 1024) for _ in range(9)),
            headers={
                "content-type": api.DATASET_MEDIA_TYPE,
                "transfer-encoding": "chunked",
            },
        )
        for response in (declared, streamed):
            assert response.status_code == 413
            assert response.json()["code"] == "dataset-too-large"
    service.close()


def test_http_artifact_read_rejects_symlink_and_verifies_regular_file(tmp_path) -> None:
    test_client = client_or_skip()
    service = api.V5ApiService(
        tmp_path,
        capabilities=api._CapabilitySnapshot(False, False, False),
    )
    content = b"verified route artifact"
    digest = sha256(content).hexdigest()
    outside = tmp_path.parent / f"{tmp_path.name}-route-outside.arrow"
    outside.write_bytes(content)
    artifact = tmp_path / f"{digest}.arrow"
    artifact.symlink_to(outside)
    with test_client(api.create_app(service=service)) as client:
        assert client.get(f"/v1/artifacts/{digest}").status_code == 404
        artifact.unlink()
        artifact.write_bytes(content)
        response = client.get(f"/v1/artifacts/{digest}")
        assert response.status_code == 200
        assert response.content == content
        assert response.headers["content-type"] == "application/vnd.apache.arrow.file"
        assert response.headers["content-length"] == str(len(content))
        assert response.headers["cache-control"] == "no-store"
        assert response.headers["x-content-type-options"] == "nosniff"
    service.close()
    outside.unlink()
