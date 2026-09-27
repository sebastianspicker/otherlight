"""Keep benchmark harnesses executable without running production-size workloads."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

BENCHMARKS = Path(__file__).parents[1] / "benchmarks"


@pytest.mark.parametrize(
    "script",
    ["benchmark_dataset_import.py", "benchmark_forward_collectors.py"],
)
@pytest.mark.parametrize("mode", ["latency", "memory"])
def test_benchmark_reports_metadata_distributions_and_assertions(
    script: str, mode: str
) -> None:
    completed = subprocess.run(
        [
            sys.executable,
            str(BENCHMARKS / script),
            "--mode",
            mode,
            "--samples",
            "20",
            "--warmups",
            "0",
            "--repeats",
            "1",
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    report = json.loads(completed.stdout)

    assert report["metadata"]["mode"] == mode
    assert report["metadata"]["sampleCount"] == 20
    assert report["metadata"]["repeats"] == 1
    assert all(report["assertions"].values())
    distributions = (
        [report["distribution"]]
        if "distribution" in report
        else [report["rich"], report["compact"]]
    )
    assert all(len(distribution["samples"]) == 1 for distribution in distributions)
