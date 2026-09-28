"""Reproducible latency or traced-memory benchmark for maximum V6 imports."""

from __future__ import annotations

import argparse
import gc
import json
import platform
import statistics
import sys
import time
import tracemalloc
from collections.abc import Callable, Sequence
from importlib.metadata import version
from pathlib import Path
from typing import Any

from science_backend.api_v2_datasets import MAX_DATASET_SAMPLES, V6DatasetRegistry


def dataset_source(sample_count: int) -> bytes:
    payload = {
        "schemaVersion": "science-dataset-v2",
        "kind": "passband-response",
        "units": {"wavelengthM": "m", "response": "1"},
        "wavelengthM": [4.0e-7 + index * 1.0e-12 for index in range(sample_count)],
        "response": [0.5] * sample_count,
    }
    return json.dumps(payload, separators=(",", ":")).encode()


def import_once(source: bytes, sample_count: int) -> None:
    registry = V6DatasetRegistry()
    try:
        descriptor, created = registry.import_bytes_with_status(source)
        assert created
        assert descriptor["sampleCount"] == sample_count
    finally:
        registry.close()


def validate(source: bytes, sample_count: int) -> None:
    registry = V6DatasetRegistry()
    try:
        descriptor, created = registry.import_bytes_with_status(source)
        duplicate, duplicate_created = registry.import_bytes_with_status(source)
        assert created and descriptor["sampleCount"] == sample_count
        assert not duplicate_created and duplicate == descriptor
    finally:
        registry.close()


def distribution(values: Sequence[float | int]) -> dict[str, Any]:
    ordered = sorted(values)
    percentile_index = round(0.95 * (len(ordered) - 1))
    return {
        "minimum": ordered[0],
        "median": statistics.median(ordered),
        "p95": ordered[percentile_index],
        "maximum": ordered[-1],
        "samples": list(values),
    }


def latency(source: bytes, sample_count: int, repeats: int) -> list[float]:
    values: list[float] = []
    for _ in range(repeats):
        gc.collect()
        started = time.perf_counter()
        import_once(source, sample_count)
        values.append(time.perf_counter() - started)
    return values


def memory(source: bytes, sample_count: int, repeats: int) -> list[int]:
    values: list[int] = []
    for _ in range(repeats):
        gc.collect()
        tracemalloc.start()
        import_once(source, sample_count)
        values.append(tracemalloc.get_traced_memory()[1])
        tracemalloc.stop()
    return values


def run(*, mode: str, sample_count: int, warmups: int, repeats: int) -> dict[str, Any]:
    if not 2 <= sample_count <= MAX_DATASET_SAMPLES:
        raise ValueError(f"samples must be between 2 and {MAX_DATASET_SAMPLES}")
    if warmups < 0 or repeats < 1:
        raise ValueError("warmups must be non-negative and repeats must be positive")
    source = dataset_source(sample_count)
    validate(source, sample_count)
    for _ in range(warmups):
        import_once(source, sample_count)
    measure: Callable[[bytes, int, int], list[float] | list[int]] = (
        latency if mode == "latency" else memory
    )
    values = measure(source, sample_count, repeats)
    return {
        "metadata": {
            "benchmark": "v6-dataset-import",
            "mode": mode,
            "python": platform.python_version(),
            "platform": platform.platform(),
            "packageVersion": version("otherlight-science-backend"),
            "seed": None,
            "randomness": "none; deterministic index construction",
            "sampleCount": sample_count,
            "sourceBytes": len(source),
            "warmups": warmups,
            "repeats": repeats,
        },
        "distribution": distribution(values),
        "unit": "seconds" if mode == "latency" else "traced-peak-bytes",
        "assertions": {
            "created": True,
            "sampleCount": True,
            "canonicalDuplicateIdempotent": True,
        },
    }


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser()
    result.add_argument("--mode", choices=("latency", "memory"), required=True)
    result.add_argument("--samples", type=int, default=MAX_DATASET_SAMPLES)
    result.add_argument("--warmups", type=int, default=2)
    result.add_argument("--repeats", type=int, default=7)
    result.add_argument("--output", type=Path)
    return result


def main(argv: Sequence[str] | None = None) -> int:
    arguments = parser().parse_args(argv)
    report = run(
        mode=arguments.mode,
        sample_count=arguments.samples,
        warmups=arguments.warmups,
        repeats=arguments.repeats,
    )
    rendered = json.dumps(report, indent=2, sort_keys=True) + "\n"
    if arguments.output is None:
        sys.stdout.write(rendered)
    else:
        arguments.output.write_text(rendered)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
