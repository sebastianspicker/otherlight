"""Verify the shared request canonicalization used for provenance hashes."""

from __future__ import annotations

import json
from hashlib import sha256
from pathlib import Path

import pytest

from science_backend.canonical_json import canonical_json
from science_backend.contracts import (
    InferenceRequest,
    ReducedObservation,
    request_fingerprint,
)

CASES = json.loads(
    (
        Path(__file__).parents[3] / "contracts/science-v5/canonical-json-cases.json"
    ).read_text()
)
CONTRACT_CASES = json.loads(
    (Path(__file__).parents[3] / "contracts/science-v5/contract-cases.json").read_text()
)


def test_shared_canonical_json_cases() -> None:
    for fixture in CASES["cases"]:
        assert canonical_json(fixture["value"]) == fixture["canonical"], fixture["id"]


def test_canonical_json_rejects_nonfinite_and_non_json_values() -> None:
    with pytest.raises(ValueError, match="non-finite"):
        canonical_json(float("nan"))
    with pytest.raises(TypeError, match="JSON values"):
        canonical_json(object())


def test_canonical_json_encodes_immutable_tuple_arrays() -> None:
    assert canonical_json((1, "two", (True, None))) == '[1,"two",[true,null]]'


def test_immutable_inference_request_has_stable_fingerprint() -> None:
    request = InferenceRequest((ReducedObservation(2.0, 1.0, 0.5),))
    assert request_fingerprint(request) == (
        "b1334b8371df5d92eb4c0ac424668e88aec2eed72ad729551af9d877ccc39ef3"
    )


def test_shared_v5_request_hash() -> None:
    encoded = canonical_json(CONTRACT_CASES["validForwardRequest"]).encode()
    assert (
        sha256(encoded).hexdigest()
        == CONTRACT_CASES["validForwardRequestCanonicalSha256"]
    )
