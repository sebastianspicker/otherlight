"""Atomic Arrow IPC artifact publication."""

from __future__ import annotations

import os
from collections.abc import Buffer, Callable
from contextlib import nullcontext
from hashlib import sha256
from io import RawIOBase
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any, BinaryIO

from .artifact_cache import MAX_ARTIFACT_WRITER_TEMP_BYTES
from .errors import (
    ArtifactWriterCapacityError,
    CapabilityUnavailableError,
    JobCancelledError,
)

ARROW_BATCH_SIZE = 8_192
ArtifactPromotion = Callable[[str, Path, Path], bool]
ActiveTemporary = Callable[[Path], Any]


class BoundedArtifactSink(RawIOBase):
    """Reject a write before it can grow a temporary beyond its hard limit."""

    def __init__(self, target: BinaryIO, max_bytes: int) -> None:
        super().__init__()
        self.target = target
        self.max_bytes = max_bytes

    def writable(self) -> bool:
        return True

    def seekable(self) -> bool:
        return True

    def write(self, data: Buffer) -> int:
        view = memoryview(data)
        if self.target.tell() + view.nbytes > self.max_bytes:
            raise ArtifactWriterCapacityError(
                f"artifact writer exceeded its {self.max_bytes}-byte temporary-file limit"
            )
        return self.target.write(view)

    def tell(self) -> int:
        return self.target.tell()

    def seek(self, offset: int, whence: int = os.SEEK_SET) -> int:
        return self.target.seek(offset, whence)

    def flush(self) -> None:
        if not self.closed:
            self.target.flush()


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
    max_temp_bytes: int,
) -> None:
    schema = arrow_schema(pa)
    with temporary.open("wb") as raw:
        bounded = BoundedArtifactSink(raw, max_temp_bytes)
        with (
            pa.PythonFile(bounded, mode="w") as sink,
            ipc.new_file(sink, schema) as writer,
        ):
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


def hash_artifact(
    temporary: Path,
    cancel_requested: Callable[[], bool] | None,
    max_temp_bytes: int,
) -> str:
    size = temporary.stat().st_size
    if size > max_temp_bytes:
        raise ArtifactWriterCapacityError(
            f"artifact writer exceeded its {max_temp_bytes}-byte temporary-file limit"
        )
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
    max_temp_bytes: int = MAX_ARTIFACT_WRITER_TEMP_BYTES,
    active_temporary: ActiveTemporary | None = None,
) -> str:
    """Stream to a same-filesystem temp file then publish with ``os.replace``."""
    pa, ipc = arrow_modules()
    root.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(
        dir=root, prefix=".arrow-", suffix=".tmp", delete=False
    ) as temporary_file:
        temporary = Path(temporary_file.name)
    try:
        active = (
            active_temporary(temporary)
            if active_temporary is not None
            else nullcontext()
        )
        with active:
            raise_if_cancelled(cancel_requested)
            write_arrow_batches(
                pa, ipc, result, temporary, cancel_requested, max_temp_bytes
            )
            artifact_id = hash_artifact(temporary, cancel_requested, max_temp_bytes)
            publish_artifact(artifact_id, temporary, root, cancel_requested, promote)
            return artifact_id
    finally:
        temporary.unlink(missing_ok=True)
