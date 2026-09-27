"""Exclusive ownership, retained quotas, and explicit offline cache cleanup."""

from __future__ import annotations

import argparse
import fcntl
import json
import os
import re
import stat
from collections.abc import Iterator, Mapping, Sequence
from contextlib import contextmanager
from pathlib import Path
from threading import RLock
from typing import Any

from .errors import ArtifactCacheCapacityError, ArtifactCacheOwnershipError

DEFAULT_ARTIFACT_CACHE_MAX_BYTES = 1024 * 1024 * 1024
MAX_ARTIFACT_WRITER_TEMP_BYTES = 64 * 1024 * 1024
ARTIFACT_CACHE_ENV = "OTHERLIGHT_ARTIFACT_CACHE_MAX_BYTES"
LOCK_FILENAME = ".otherlight-artifact-cache.lock"
_ARTIFACT_ID = re.compile(r"[0-9a-f]{64}\Z")
_TEMPORARY_NAME = re.compile(r"\.arrow-[A-Za-z0-9_.-]+\.tmp\Z")


def configured_cache_max_bytes(
    explicit: int | None, environ: Mapping[str, str] | None = None
) -> int:
    """Resolve a positive byte quota, rejecting ambiguous environment values."""

    if explicit is not None:
        if type(explicit) is not int or explicit < 1:
            raise ValueError("max_artifact_cache_bytes must be a positive integer")
        return explicit
    environment = os.environ if environ is None else environ
    raw = environment.get(ARTIFACT_CACHE_ENV)
    if raw is None:
        return DEFAULT_ARTIFACT_CACHE_MAX_BYTES
    if re.fullmatch(r"[1-9][0-9]*", raw) is None:
        raise ValueError(f"{ARTIFACT_CACHE_ENV} must be a positive base-10 integer")
    return int(raw)


class ArtifactCache:
    """Hold the process-wide advisory writer lock for one artifact directory."""

    def __init__(
        self,
        root: Path,
        *,
        max_bytes: int,
        max_writer_bytes: int = MAX_ARTIFACT_WRITER_TEMP_BYTES,
    ) -> None:
        self.root = root.absolute()
        self.max_bytes = configured_cache_max_bytes(max_bytes)
        if (
            type(max_writer_bytes) is not int
            or not 1 <= max_writer_bytes <= MAX_ARTIFACT_WRITER_TEMP_BYTES
        ):
            raise ValueError(
                f"max_writer_bytes must be an integer from 1 through {MAX_ARTIFACT_WRITER_TEMP_BYTES}"
            )
        self.max_writer_bytes = max_writer_bytes
        self._lock = RLock()
        self._closed = False
        self._directory_fd: int | None = None
        self._lock_fd: int | None = None
        self._active_temporaries: set[str] = set()
        self._open()

    def _open(self) -> None:
        if _has_symlink_component(self.root):
            raise ArtifactCacheOwnershipError(
                "artifact cache root must be a non-symlink directory"
            )
        self.root.mkdir(parents=True, exist_ok=True)
        if not self.root.is_dir():
            raise ArtifactCacheOwnershipError(
                "artifact cache root must be a non-symlink directory"
            )
        required = ("O_CLOEXEC", "O_DIRECTORY", "O_NOFOLLOW")
        if any(not hasattr(os, name) for name in required):
            raise ArtifactCacheOwnershipError(
                "artifact cache ownership requires no-follow directory operations"
            )
        directory_fd = os.open(
            self.root,
            os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC | os.O_NOFOLLOW,
        )
        lock_fd: int | None = None
        try:
            lock_fd = os.open(
                LOCK_FILENAME,
                os.O_RDWR | os.O_CREAT | os.O_CLOEXEC | os.O_NOFOLLOW,
                0o600,
                dir_fd=directory_fd,
            )
            metadata = os.fstat(lock_fd)
            if not stat.S_ISREG(metadata.st_mode) or metadata.st_nlink != 1:
                raise ArtifactCacheOwnershipError(
                    "artifact cache lock must be a private regular file"
                )
            try:
                fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as error:
                raise ArtifactCacheOwnershipError(
                    "artifact cache is owned by another writer or cleanup process"
                ) from error
        except Exception:
            if lock_fd is not None:
                os.close(lock_fd)
            os.close(directory_fd)
            raise
        assert lock_fd is not None
        self._directory_fd, self._lock_fd = directory_fd, lock_fd

    def footprint_bytes(self) -> int:
        """Count retained artifacts and abandoned writer temporaries."""

        with self._lock:
            directory_fd = self._require_open()
            total = 0
            for name in os.listdir(directory_fd):
                if not (_artifact_name(name) or _temporary_name(name)):
                    continue
                if name in self._active_temporaries:
                    continue
                try:
                    metadata = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
                except FileNotFoundError:
                    continue
                if stat.S_ISREG(metadata.st_mode):
                    total += metadata.st_size
            return total

    def usage(self) -> dict[str, int]:
        """Report retained and live-writer bytes as separate resource budgets."""

        with self._lock:
            directory_fd = self._require_open()
            active_bytes = sum(
                _optional_regular_size(directory_fd, name)
                for name in self._active_temporaries
            )
            return {
                "retainedBytes": self.footprint_bytes(),
                "activeWriterTempBytes": active_bytes,
                "maxRetainedBytes": self.max_bytes,
                "maxBytesPerWriter": self.max_writer_bytes,
            }

    @contextmanager
    def active_writer(self, temporary: Path) -> Iterator[None]:
        """Exclude one live writer from abandoned-temporary accounting."""

        name = self._owned_name(temporary)
        if not _temporary_name(name):
            raise ValueError("active writer path must be an .arrow-*.tmp file")
        with self._lock:
            self._require_open()
            if name in self._active_temporaries:
                raise ValueError("artifact writer temporary is already active")
            self._active_temporaries.add(name)
        try:
            yield
        finally:
            with self._lock:
                self._active_temporaries.discard(name)

    def publish(self, artifact_id: str, temporary: Path, destination: Path) -> None:
        """Atomically enforce final retained footprint before publication."""

        if _ARTIFACT_ID.fullmatch(artifact_id) is None:
            raise ValueError("artifact_id must be a lowercase SHA-256 digest")
        temporary_name = self._owned_name(temporary)
        destination_name = self._owned_name(destination)
        if destination_name != f"{artifact_id}.arrow":
            raise ValueError("artifact destination does not match its digest")
        with self._lock:
            directory_fd = self._require_open()
            temporary_size = _regular_size(directory_fd, temporary_name)
            destination_size = _optional_regular_size(directory_fd, destination_name)
            retained = self.footprint_bytes()
            baseline = retained - (
                0 if temporary_name in self._active_temporaries else temporary_size
            )
            final = baseline + temporary_size - destination_size
            if final > self.max_bytes and final > baseline:
                raise ArtifactCacheCapacityError("artifact cache capacity is exhausted")
            os.replace(
                temporary_name,
                destination_name,
                src_dir_fd=directory_fd,
                dst_dir_fd=directory_fd,
            )

    def remove_selected(
        self,
        *,
        artifact_ids: Sequence[str],
        temporary_names: Sequence[str],
        apply: bool,
    ) -> list[dict[str, Any]]:
        """Inspect or remove only explicitly selected safe cache entries."""

        names = [_artifact_filename(value) for value in artifact_ids]
        names.extend(_checked_temporary_name(value) for value in temporary_names)
        if not names:
            raise ValueError("select at least one --artifact or --temporary")
        with self._lock:
            directory_fd = self._require_open()
            validated: list[tuple[str, int]] = []
            results: list[dict[str, Any]] = []
            for name in dict.fromkeys(names):
                if name in self._active_temporaries:
                    raise ValueError(
                        f"selected cache entry belongs to a live writer: {name}"
                    )
                try:
                    size = _regular_size(directory_fd, name)
                except FileNotFoundError:
                    results.append({"name": name, "status": "missing"})
                    continue
                validated.append((name, size))
            if apply:
                for name, _size in validated:
                    os.unlink(name, dir_fd=directory_fd)
            status_value = "removed" if apply else "would-remove"
            results.extend(
                {"name": name, "sizeBytes": size, "status": status_value}
                for name, size in validated
            )
            return results

    def _owned_name(self, path: Path) -> str:
        absolute = path.absolute()
        if absolute.parent != self.root or absolute.name in {"", ".", ".."}:
            raise ValueError("artifact path must be directly inside the cache root")
        return absolute.name

    def _require_open(self) -> int:
        if self._closed or self._directory_fd is None:
            raise ArtifactCacheOwnershipError("artifact cache owner is closed")
        return self._directory_fd

    def close(self) -> None:
        with self._lock:
            if self._closed:
                return
            self._closed = True
            self._active_temporaries.clear()
            if self._lock_fd is not None:
                fcntl.flock(self._lock_fd, fcntl.LOCK_UN)
                os.close(self._lock_fd)
                self._lock_fd = None
            if self._directory_fd is not None:
                os.close(self._directory_fd)
                self._directory_fd = None


def _artifact_name(name: str) -> bool:
    return name.endswith(".arrow") and _ARTIFACT_ID.fullmatch(name[:-6]) is not None


def _temporary_name(name: str) -> bool:
    return _TEMPORARY_NAME.fullmatch(name) is not None


def _has_symlink_component(path: Path) -> bool:
    current = Path(path.anchor)
    for part in path.parts[1:]:
        current /= part
        try:
            if stat.S_ISLNK(current.lstat().st_mode):
                return True
        except FileNotFoundError:
            continue
    return False


def _artifact_filename(identifier: str) -> str:
    if _ARTIFACT_ID.fullmatch(identifier) is None:
        raise ValueError("--artifact requires a lowercase SHA-256 identifier")
    return f"{identifier}.arrow"


def _checked_temporary_name(name: str) -> str:
    if _TEMPORARY_NAME.fullmatch(name) is None:
        raise ValueError("--temporary requires an exact .arrow-*.tmp basename")
    return name


def _regular_size(directory_fd: int, name: str) -> int:
    metadata = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
    if not stat.S_ISREG(metadata.st_mode) or metadata.st_nlink != 1:
        raise ValueError(f"selected cache entry is not a private regular file: {name}")
    return metadata.st_size


def _optional_regular_size(directory_fd: int, name: str) -> int:
    try:
        return _regular_size(directory_fd, name)
    except FileNotFoundError:
        return 0


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Dry-run inspection or explicit removal of offline science artifacts."
    )
    parser.add_argument("cache_root", type=Path)
    parser.add_argument("--artifact", action="append", default=[], metavar="SHA256")
    parser.add_argument("--temporary", action="append", default=[], metavar="BASENAME")
    parser.add_argument("--apply", action="store_true", help="remove selected entries")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    arguments = _parser().parse_args(argv)
    root: Path = arguments.cache_root
    if (
        not root.exists()
        or _has_symlink_component(root.absolute())
        or not root.is_dir()
    ):
        raise SystemExit("cache_root must be an existing non-symlink directory")
    try:
        cache = ArtifactCache(root, max_bytes=configured_cache_max_bytes(None))
        try:
            results = (
                cache.remove_selected(
                    artifact_ids=arguments.artifact,
                    temporary_names=arguments.temporary,
                    apply=arguments.apply,
                )
                if arguments.artifact or arguments.temporary
                else []
            )
            usage = cache.usage()
        finally:
            cache.close()
    except (ArtifactCacheOwnershipError, ValueError) as error:
        raise SystemExit(str(error)) from error
    print(
        json.dumps(
            {"apply": arguments.apply, "entries": results, "usage": usage},
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
