"""Compare rich and service-compact retention on one deterministic workload."""

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
from math import sqrt
from pathlib import Path
from typing import Any

from science_backend.contracts import (
    G_SI,
    MAX_FORWARD_SAMPLES,
    Body,
    ForwardRunRequest,
    Observer,
)
from science_backend.forward import run_forward, run_forward_compact


def request(sample_count: int) -> ForwardRunRequest:
    primary_mass, companion_mass, separation = 2.0e30, 2.0e27, 1.0e11
    total_mass = primary_mass + companion_mass
    relative_speed = sqrt(G_SI * total_mass / separation)
    return ForwardRunRequest(
        bodies=(
            Body(
                "primary",
                "star",
                primary_mass,
                6.0e8,
                (-companion_mass / total_mass * separation, 0.0, 0.0),
                (0.0, -companion_mass / total_mass * relative_speed, 0.0),
                luminosity_w=3.8e26,
            ),
            Body(
                "companion",
                "companion",
                companion_mass,
                7.0e7,
                (primary_mass / total_mass * separation, 0.0, 0.0),
                (0.0, primary_mass / total_mass * relative_speed, 0.0),
            ),
        ),
        sample_times_s=tuple(float(index) for index in range(sample_count)),
        observer=Observer(target_body_id="primary", line_of_sight=(0.0, 1.0, 0.0)),
        epoch_jd_tdb=2_451_545.0,
        execution_mode="test",
        allow_analytic_two_body_test_fallback=True,
    )


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


def validate(request_value: ForwardRunRequest) -> None:
    rich = run_forward(request_value)
    compact = run_forward_compact(request_value)
    assert (
        len(rich.samples) == len(compact.samples) == len(request_value.sample_times_s)
    )
    assert tuple(sample.time_offset_s for sample in rich.samples) == tuple(
        sample.time_offset_s for sample in compact.samples
    )
    assert tuple(sample.radial_velocity_m_s for sample in rich.samples) == tuple(
        sample.radial_velocity_m_s for sample in compact.samples
    )


def measure_latency(
    operation: Callable[[ForwardRunRequest], Any],
    request_value: ForwardRunRequest,
    repeats: int,
) -> list[float]:
    values: list[float] = []
    for _ in range(repeats):
        gc.collect()
        started = time.perf_counter()
        result = operation(request_value)
        values.append(time.perf_counter() - started)
        assert len(result.samples) == len(request_value.sample_times_s)
        del result
    return values


def measure_memory(
    operation: Callable[[ForwardRunRequest], Any],
    request_value: ForwardRunRequest,
    repeats: int,
) -> list[int]:
    values: list[int] = []
    for _ in range(repeats):
        gc.collect()
        tracemalloc.start()
        result = operation(request_value)
        values.append(tracemalloc.get_traced_memory()[1])
        tracemalloc.stop()
        assert len(result.samples) == len(request_value.sample_times_s)
        del result
    return values


def run(*, mode: str, sample_count: int, warmups: int, repeats: int) -> dict[str, Any]:
    if not 2 <= sample_count <= MAX_FORWARD_SAMPLES:
        raise ValueError(f"samples must be between 2 and {MAX_FORWARD_SAMPLES}")
    if warmups < 0 or repeats < 1:
        raise ValueError("warmups must be non-negative and repeats must be positive")
    workload = request(sample_count)
    validate(workload)
    for _ in range(warmups):
        rich = run_forward(workload)
        compact = run_forward_compact(workload)
        del rich, compact
    measure = measure_latency if mode == "latency" else measure_memory
    rich_values = measure(run_forward, workload, repeats)
    compact_values = measure(run_forward_compact, workload, repeats)
    return {
        "metadata": {
            "benchmark": "v5-forward-sample-retention",
            "mode": mode,
            "python": platform.python_version(),
            "platform": platform.platform(),
            "packageVersion": version("otherlight-science-backend"),
            "seed": None,
            "randomness": "none; deterministic index construction",
            "sampleCount": sample_count,
            "engine": "analytic-circular-two-body-test",
            "warmups": warmups,
            "repeats": repeats,
        },
        "rich": distribution(rich_values),
        "compact": distribution(compact_values),
        "unit": "seconds" if mode == "latency" else "traced-peak-bytes",
        "assertions": {
            "sampleCount": True,
            "sampleOrder": True,
            "radialVelocityParity": True,
        },
    }


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser()
    result.add_argument("--mode", choices=("latency", "memory"), required=True)
    result.add_argument("--samples", type=int, default=MAX_FORWARD_SAMPLES)
    result.add_argument("--warmups", type=int, default=1)
    result.add_argument("--repeats", type=int, default=5)
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
