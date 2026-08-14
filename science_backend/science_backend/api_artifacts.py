"""Atomic Arrow IPC artifact publication."""

from __future__ import annotations

import os
from collections.abc import Callable
from hashlib import sha256
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any

from .errors import CapabilityUnavailableError, JobCancelledError

ARROW_BATCH_SIZE = 8_192
ArtifactPromotion = Callable[[str, Path, Path], bool]


def raise_if_cancelled(cancel_requested: Callable[[], bool] | None) -> None:
    if cancel_requested is not None and cancel_requested():
        raise JobCancelledError("scientific job was cancelled")


def arrow_modules() -> tuple[Any, Any]:
    try:
        import pyarrow as pa  # pyright: ignore[reportMissingImports]
        import pyarrow.ipc as ipc  # pyright: ignore[reportMissingImports]
    except ImportError as error:
        raise CapabilityUnavailableError(
            "Arrow IPC requires the 'artifacts' extra"
        ) from error
    return pa, ipc


def arrow_schema(pa: Any) -> Any:
    return pa.schema(
        [("time_offset_s", pa.float64()), ("radial_velocity_m_s", pa.float64())]
    )


def write_arrow_batches(
    pa: Any,
    ipc: Any,
    result: Any,
    temporary: Path,
    cancel_requested: Callable[[], bool] | None,
) -> None:
    schema = arrow_schema(pa)
    with pa.OSFile(str(temporary), "wb") as sink, ipc.new_file(sink, schema) as writer:
        for start in range(0, len(result.samples), ARROW_BATCH_SIZE):
            raise_if_cancelled(cancel_requested)
            batch = result.samples[start : start + ARROW_BATCH_SIZE]
            writer.write_batch(
                pa.record_batch(
                    [
                        pa.array(
                            (sample.time_offset_s for sample in batch),
                            type=pa.float64(),
                        ),
                        pa.array(
                            (sample.radial_velocity_m_s for sample in batch),
                            type=pa.float64(),
                        ),
                    ],
                    schema=schema,
                )
            )


def hash_artifact(temporary: Path, cancel_requested: Callable[[], bool] | None) -> str:
    digest = sha256()
    with temporary.open("rb") as artifact_file:
        while chunk := artifact_file.read(1024 * 1024):
            raise_if_cancelled(cancel_requested)
            digest.update(chunk)
    return digest.hexdigest()


def publish_artifact(
    artifact_id: str,
    temporary: Path,
    root: Path,
    cancel_requested: Callable[[], bool] | None,
    promote: ArtifactPromotion | None,
) -> None:
    raise_if_cancelled(cancel_requested)
    destination = root / f"{artifact_id}.arrow"
    if promote is not None:
        if not promote(artifact_id, temporary, destination):
            raise JobCancelledError("scientific job was cancelled")
    else:
        os.replace(temporary, destination)


def write_arrow(
    result: Any,
    root: Path,
    *,
    cancel_requested: Callable[[], bool] | None = None,
    promote: ArtifactPromotion | None = None,
) -> str:
    """Stream to a same-filesystem temp file then publish with ``os.replace``."""
    pa, ipc = arrow_modules()
    root.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(
        dir=root, prefix=".arrow-", suffix=".tmp", delete=False
    ) as temporary_file:
        temporary = Path(temporary_file.name)
    try:
        raise_if_cancelled(cancel_requested)
        write_arrow_batches(pa, ipc, result, temporary, cancel_requested)
        artifact_id = hash_artifact(temporary, cancel_requested)
        publish_artifact(artifact_id, temporary, root, cancel_requested, promote)
        return artifact_id
    finally:
        temporary.unlink(missing_ok=True)
