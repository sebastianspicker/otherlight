"""Bounded HTTP transport for additive science-v6 dataset imports."""

from __future__ import annotations

from typing import Any

from .api_v2_datasets import (
    DATASET_MEDIA_TYPE,
    MAX_AGGREGATE_SAMPLES,
    MAX_DATASET_BYTES,
    MAX_DATASET_SAMPLES,
    MAX_DATASETS,
    MAX_NORMALIZED_BYTES,
    V6DatasetRegistry,
)
from .errors import ContractError, DatasetCapacityError

V2_SCHEMA_VERSION = "science-v6"
_DATASET_ID_LENGTH = len("ds-") + 64


def _json_response(content: Any, status_code: int = 200) -> Any:
    from fastapi.responses import JSONResponse  # pyright: ignore[reportMissingImports]

    return JSONResponse(status_code=status_code, content=content)


def _dataset_identifier(value: str) -> bool:
    return (
        len(value) == _DATASET_ID_LENGTH
        and value.startswith("ds-")
        and all(character in "0123456789abcdef" for character in value[3:])
    )


async def _read_dataset_body(request: Any) -> bytes:
    raw_headers = request.scope.get("headers", ())
    declared = _validate_content_headers(raw_headers)
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > MAX_DATASET_BYTES:
            raise DatasetCapacityError(
                f"dataset upload exceeds the {MAX_DATASET_BYTES}-byte limit"
            )
    if declared is not None and len(body) != declared:
        raise ContractError("dataset body size does not match Content-Length")
    return bytes(body)


def _header_values(raw_headers: Any, expected: bytes) -> list[bytes]:
    return [value for name, value in raw_headers if name.lower() == expected]


def _validate_content_headers(raw_headers: Any) -> int | None:
    content_lengths = _header_values(raw_headers, b"content-length")
    transfer_encodings = _header_values(raw_headers, b"transfer-encoding")
    content_types = _header_values(raw_headers, b"content-type")
    content_encodings = _header_values(raw_headers, b"content-encoding")
    if len(content_lengths) > 1:
        raise ContractError("dataset request must contain at most one Content-Length")
    if content_lengths and transfer_encodings:
        raise ContractError(
            "dataset request cannot combine Content-Length and Transfer-Encoding"
        )
    declared = _declared_length(content_lengths)
    try:
        content_type = content_types[0].decode("ascii").lower()
    except IndexError, UnicodeDecodeError:
        raise UnsupportedDatasetMediaType from None
    if len(content_types) != 1 or content_type != DATASET_MEDIA_TYPE:
        raise UnsupportedDatasetMediaType
    if len(content_encodings) > 1:
        raise UnsupportedDatasetMediaType
    if content_encodings:
        try:
            content_encoding = content_encodings[0].decode("ascii").lower()
        except UnicodeDecodeError:
            raise UnsupportedDatasetMediaType from None
        if content_encoding != "identity":
            raise UnsupportedDatasetMediaType
    return declared


def _declared_length(content_lengths: list[bytes]) -> int | None:
    if not content_lengths:
        return None
    try:
        declared = int(content_lengths[0].decode("ascii"))
    except (UnicodeDecodeError, ValueError) as error:
        raise ContractError(
            "dataset Content-Length must be a non-negative integer"
        ) from error
    if declared < 0:
        raise ContractError("dataset Content-Length must be a non-negative integer")
    if declared > MAX_DATASET_BYTES:
        raise DatasetCapacityError(
            f"dataset upload exceeds the {MAX_DATASET_BYTES}-byte limit"
        )
    return declared


class UnsupportedDatasetMediaType(Exception):
    """The dataset request is not the one allowed uncompressed JSON media type."""


def capabilities() -> dict[str, Any]:
    return {
        "schemaVersion": V2_SCHEMA_VERSION,
        "supportedJobKinds": [],
        "datasetImports": {
            "mediaType": DATASET_MEDIA_TYPE,
            "kinds": [
                "passband-response",
                "stellar-intensity-grid",
                "atmospheric-profile",
                "scattering-phase-function",
                "stellar-variability-psd",
            ],
            "limits": {
                "maxSourceBytes": MAX_DATASET_BYTES,
                "maxDatasets": MAX_DATASETS,
                "maxSamplesPerDataset": MAX_DATASET_SAMPLES,
                "maxAggregateSamples": MAX_AGGREGATE_SAMPLES,
                "maxNormalizedBytes": MAX_NORMALIZED_BYTES,
            },
            "persistence": "process-memory",
        },
    }


def register_v2_routes(
    app: Any, registry: V6DatasetRegistry, request_type: Any
) -> None:
    """Register dataset-only V2 routes without advertising an unimplemented job path."""

    from starlette.concurrency import (  # pyright: ignore[reportMissingImports]
        run_in_threadpool,
    )

    @app.get("/v2/capabilities")
    def v2_capabilities():
        return _json_response(capabilities())

    @app.get("/v2/datasets")
    def list_datasets():
        return _json_response({"datasets": registry.list()})

    async def import_dataset(request: Any):
        descriptor, created = await run_in_threadpool(
            registry.import_bytes_with_status, await _read_dataset_body(request)
        )
        return _json_response(descriptor, status_code=201 if created else 200)

    import_dataset.__annotations__["request"] = request_type
    app.post("/v2/datasets")(import_dataset)

    @app.get("/v2/datasets/{dataset_id}")
    def dataset_metadata(dataset_id: str):
        if not _dataset_identifier(dataset_id):
            return _json_response(
                {"code": "unknown-dataset", "message": "unknown dataset"}, 404
            )
        try:
            return _json_response(registry.get(dataset_id))
        except KeyError:
            return _json_response(
                {"code": "unknown-dataset", "message": "unknown dataset"}, 404
            )

    @app.delete("/v2/datasets/{dataset_id}")
    def delete_dataset(dataset_id: str):
        if not _dataset_identifier(dataset_id):
            return _json_response(
                {"code": "unknown-dataset", "message": "unknown dataset"}, 404
            )
        try:
            return _json_response(registry.delete(dataset_id))
        except KeyError:
            return _json_response(
                {"code": "unknown-dataset", "message": "unknown dataset"}, 404
            )
