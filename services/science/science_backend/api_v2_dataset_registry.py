"""Strict, session-scoped science-v6 dataset imports and quotas."""

from __future__ import annotations

from collections.abc import Iterable, Iterator, Mapping
from contextlib import contextmanager
from dataclasses import dataclass
from hashlib import sha256
from threading import BoundedSemaphore, RLock
from typing import Any

from . import api_v2_dataset_validation as dataset_validation
from .canonical_json import canonical_json
from .errors import (
    ContractError,
    DatasetCapacityError,
    DatasetInUseError,
    JobStateError,
)

DATASET_MEDIA_TYPE = "application/vnd.otherlight.science-dataset+json; charset=utf-8"
MAX_DATASET_BYTES = dataset_validation.MAX_DATASET_BYTES
MAX_DATASETS = 16
MAX_DATASET_SAMPLES = dataset_validation.MAX_DATASET_SAMPLES
MAX_AGGREGATE_SAMPLES = 400_000
MAX_NORMALIZED_BYTES = 64 * 1024 * 1024


@dataclass(frozen=True, slots=True)
class ImportedDataset:
    """Retain validated content and its stable public metadata in process memory."""

    identifier: str
    source_byte_sha256: str
    content_sha256: str
    kind: str
    sample_count: int
    normalized_bytes: int
    payload: Mapping[str, Any]

    def descriptor(self) -> dict[str, Any]:
        return {
            "schemaVersion": "science-dataset-descriptor-v2",
            "id": self.identifier,
            "sourceByteSha256": self.source_byte_sha256,
            "contentSha256": self.content_sha256,
            "kind": self.kind,
            "sampleCount": self.sample_count,
            "mediaType": DATASET_MEDIA_TYPE,
        }


class V6DatasetRegistry:
    """Own validated imported datasets until service shutdown."""

    def __init__(
        self,
        *,
        max_datasets: int = MAX_DATASETS,
        max_aggregate_samples: int = MAX_AGGREGATE_SAMPLES,
        max_normalized_bytes: int = MAX_NORMALIZED_BYTES,
    ) -> None:
        if min(max_datasets, max_aggregate_samples, max_normalized_bytes) < 1:
            raise ValueError("dataset registry limits must be positive")
        self.max_datasets = max_datasets
        self.max_aggregate_samples = max_aggregate_samples
        self.max_normalized_bytes = max_normalized_bytes
        self._datasets: dict[str, ImportedDataset] = {}
        self._use_counts: dict[str, int] = {}
        self._sample_count = 0
        self._normalized_bytes = 0
        self._lock = RLock()
        self._import_slot = BoundedSemaphore(1)
        self._closed = False

    def import_bytes(self, source: bytes) -> dict[str, Any]:
        descriptor, _created = self.import_bytes_with_status(source)
        return descriptor

    def import_bytes_with_status(self, source: bytes) -> tuple[dict[str, Any], bool]:
        """Import bytes atomically and report whether a new record was admitted."""

        with self._import_slot:
            payload = dataset_validation.parse_dataset_bytes(source)
            kind, sample_count = dataset_validation.validate_dataset(payload)
            canonical = canonical_json(payload).encode("utf-8")
            content_hash = sha256(canonical).hexdigest()
            del canonical
            identifier = f"ds-{content_hash}"
            with self._lock:
                if self._closed:
                    raise JobStateError("dataset registry is closed")
                existing = self._datasets.get(identifier)
                if existing is not None:
                    return existing.descriptor(), False
            frozen_payload, normalized_bytes = (
                dataset_validation.freeze_and_measure_owned(payload)
            )
            del payload
            source_byte_sha256 = sha256(source).hexdigest()
            with self._lock:
                if self._closed:
                    raise JobStateError("dataset registry is closed")
                existing = self._datasets.get(identifier)
                if existing is not None:
                    return existing.descriptor(), False
                if len(self._datasets) >= self.max_datasets:
                    raise DatasetCapacityError(
                        f"dataset registry supports at most {self.max_datasets} imports"
                    )
                if self._sample_count + sample_count > self.max_aggregate_samples:
                    raise DatasetCapacityError(
                        "dataset registry aggregate sample limit would be exceeded"
                    )
                if (
                    self._normalized_bytes + normalized_bytes
                    > self.max_normalized_bytes
                ):
                    raise DatasetCapacityError(
                        "dataset registry normalized-memory limit would be exceeded"
                    )
                imported = ImportedDataset(
                    identifier=identifier,
                    source_byte_sha256=source_byte_sha256,
                    content_sha256=content_hash,
                    kind=kind,
                    sample_count=sample_count,
                    normalized_bytes=normalized_bytes,
                    payload=frozen_payload,
                )
                self._datasets[identifier] = imported
                self._use_counts[identifier] = 0
                self._sample_count += sample_count
                self._normalized_bytes += normalized_bytes
                return imported.descriptor(), True

    def list(self) -> list[dict[str, Any]]:
        with self._lock:
            return [
                self._datasets[identifier].descriptor()
                for identifier in sorted(self._datasets)
            ]

    def get(self, identifier: str) -> dict[str, Any]:
        with self._lock:
            try:
                return self._datasets[identifier].descriptor()
            except KeyError as error:
                raise KeyError(identifier) from error

    def delete(self, identifier: str) -> dict[str, Any]:
        with self._lock:
            if identifier not in self._datasets:
                raise KeyError(identifier)
            if self._use_counts[identifier] > 0:
                raise DatasetInUseError(f"dataset {identifier} is in use")
            removed = self._datasets.pop(identifier)
            self._use_counts.pop(identifier)
            self._sample_count -= removed.sample_count
            self._normalized_bytes -= removed.normalized_bytes
            return removed.descriptor()

    @contextmanager
    def using(
        self, identifiers: Iterable[str]
    ) -> Iterator[tuple[ImportedDataset, ...]]:
        unique = tuple(dict.fromkeys(identifiers))
        with self._lock:
            missing = [
                identifier for identifier in unique if identifier not in self._datasets
            ]
            if missing:
                raise ContractError(f"unknown dataset: {missing[0]}")
            for identifier in unique:
                self._use_counts[identifier] += 1
            datasets = tuple(self._datasets[identifier] for identifier in unique)
        try:
            yield datasets
        finally:
            with self._lock:
                for identifier in unique:
                    if identifier in self._use_counts:
                        self._use_counts[identifier] -= 1

    def close(self) -> None:
        with self._import_slot, self._lock:
            self._closed = True
            self._datasets.clear()
            self._use_counts.clear()
            self._sample_count = 0
            self._normalized_bytes = 0
