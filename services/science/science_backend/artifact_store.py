"""No-follow, digest-verified reads for immutable scientific artifacts."""

from __future__ import annotations

import os
import stat
from collections.abc import Iterator
from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path
from typing import BinaryIO

MAX_ARTIFACT_RESPONSE_BYTES = 64 * 1024 * 1024


@dataclass(slots=True)
class VerifiedArtifact:
    """Own an already-verified file descriptor until response streaming completes."""

    file: BinaryIO
    size: int

    def chunks(self, size: int = 1024 * 1024) -> Iterator[bytes]:
        try:
            while chunk := self.file.read(size):
                yield chunk
        finally:
            self.file.close()


def open_verified_artifact(
    root: Path,
    filename: str,
    expected_sha256: str,
    *,
    max_bytes: int = MAX_ARTIFACT_RESPONSE_BYTES,
) -> VerifiedArtifact | None:
    """Open relative to a trusted directory and verify the same descriptor that is served."""

    required_flags = ("O_CLOEXEC", "O_DIRECTORY", "O_NOFOLLOW")
    if any(not hasattr(os, flag) for flag in required_flags):
        return None
    directory_fd: int | None = None
    artifact_fd: int | None = None
    try:
        directory_fd = os.open(
            root,
            os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC | os.O_NOFOLLOW,
        )
        artifact_fd = os.open(
            filename,
            os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW | os.O_NONBLOCK,
            dir_fd=directory_fd,
        )
        metadata = os.fstat(artifact_fd)
        if (
            not stat.S_ISREG(metadata.st_mode)
            or metadata.st_nlink != 1
            or metadata.st_size > max_bytes
        ):
            return None
        digest = sha256()
        while chunk := os.read(artifact_fd, 1024 * 1024):
            digest.update(chunk)
        if digest.hexdigest() != expected_sha256:
            return None
        os.lseek(artifact_fd, 0, os.SEEK_SET)
        file = os.fdopen(artifact_fd, "rb", closefd=True)
        artifact_fd = None
        return VerifiedArtifact(file=file, size=metadata.st_size)
    except FileNotFoundError, NotADirectoryError, OSError:
        return None
    finally:
        if artifact_fd is not None:
            os.close(artifact_fd)
        if directory_fd is not None:
            os.close(directory_fd)
