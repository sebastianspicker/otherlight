"""Strict V5 HTTP request parsing and optional capability discovery."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from importlib.metadata import PackageNotFoundError, version
from importlib.util import find_spec
from itertools import pairwise
from math import ceil, floor, isfinite
from typing import Any

from .__about__ import __version__
from .contracts import (
    MAX_FORWARD_BODIES,
    MAX_FORWARD_SAMPLES,
    MAX_INTEGRATOR_STEPS,
    Body,
    ForwardRunRequest,
    Observer,
)
from .errors import ContractError

SCHEMA_VERSION = "v5"
SERVICE_VERSION = __version__
MAX_IDENTIFIER_CODE_POINTS = 128


def now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def capability_available(module: str, attribute: str | None = None) -> bool:
    try:
        specification = find_spec(module)
    except ModuleNotFoundError:
        return False
    if specification is None or attribute is None:
        return specification is not None
    try:
        imported = __import__(module, fromlist=[attribute])
    except ImportError:
        return False
    return callable(getattr(imported, attribute, None))


@dataclass(frozen=True, slots=True)
class CapabilitySnapshot:
    solve_ivp: bool
    certified_dense_output: bool
    arrow_ipc_new_file: bool

    @property
    def forward_available(self) -> bool:
        return (
            self.solve_ivp and self.certified_dense_output and self.arrow_ipc_new_file
        )


def pinned_dop853_dense_output_available() -> bool:
    """Report whether the exact private representation required by certification exists."""
    try:
        if version("scipy") != "1.18.0":
            return False
    except PackageNotFoundError:
        return False
    return capability_available(
        "scipy.integrate._ivp.rk", "Dop853DenseOutput"
    ) and capability_available("scipy.integrate._ivp.common", "OdeSolution")


def capability_snapshot() -> CapabilitySnapshot:
    return CapabilitySnapshot(
        solve_ivp=capability_available("scipy.integrate", "solve_ivp"),
        certified_dense_output=pinned_dop853_dense_output_available(),
        arrow_ipc_new_file=capability_available("pyarrow.ipc", "new_file"),
    )


def capability_manifest(snapshot: CapabilitySnapshot | None = None) -> dict[str, Any]:
    capabilities = snapshot or capability_snapshot()
    unavailable = [
        "photometry.research",
        "timing.relativity",
        "inference.parameter-adapter",
        "atmosphere.radiative-transfer",
        "stellar.atmosphere-grid",
    ]
    if not capabilities.solve_ivp or not capabilities.certified_dense_output:
        unavailable.append("dynamics.dop853")
    if not capabilities.arrow_ipc_new_file:
        unavailable.append("artifacts.arrow-ipc")
    return {
        "schemaVersion": SCHEMA_VERSION,
        "serviceVersion": SERVICE_VERSION,
        "generatedAt": now(),
        "supportedJobKinds": ["forward"] if capabilities.forward_available else [],
        "supportedOutputs": ["radial-velocity"]
        if capabilities.forward_available
        else [],
        "supportedSamplers": [],
        "unavailableModelIds": unavailable,
    }


def samples(start: float, end: float, cadence: float) -> tuple[float, ...]:
    if cadence <= 0 or end <= start:
        raise ContractError("forward offsets require end > start and cadence > 0")
    intervals = (end - start) / cadence
    if not isfinite(end - start) or not isfinite(intervals):
        raise ContractError(
            "forward offsets and cadence must produce a finite sample count"
        )
    count = floor(intervals) + 1
    if count > MAX_FORWARD_SAMPLES:
        raise ContractError(
            f"forward jobs support at most {MAX_FORWARD_SAMPLES} samples"
        )
    result = tuple(start + index * cadence for index in range(count))
    if any(
        not isfinite(sample) or sample <= previous
        for previous, sample in pairwise(result)
    ):
        raise ContractError(
            "forward sample grid must be strictly increasing and representable as IEEE-754 double-precision values"
        )
    return result


def record(value: Any, path: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ContractError(f"{path} must be an object")
    return value


def exact_keys(
    value: dict[str, Any],
    path: str,
    required: set[str],
    optional: set[str] | None = None,
) -> None:
    missing, unknown = (
        sorted(required - value.keys()),
        sorted(value.keys() - (required | (optional or set()))),
    )
    if missing:
        raise ContractError(f"{path} is missing required fields: {', '.join(missing)}")
    if unknown:
        raise ContractError(f"{path} contains unsupported fields: {', '.join(unknown)}")


def string(value: Any, path: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ContractError(f"{path} must be a non-empty string")
    return value


def identifier(value: Any, path: str) -> str:
    result = string(value, path)
    if len(result) > MAX_IDENTIFIER_CODE_POINTS:
        raise ContractError(
            f"{path} must be a non-empty string with at most "
            f"{MAX_IDENTIFIER_CODE_POINTS} Unicode code points"
        )
    return result


def number(value: Any, path: str) -> float:
    if (
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not isfinite(float(value))
    ):
        raise ContractError(f"{path} must be a finite number")
    return float(value)


def positive(value: Any, path: str) -> float:
    result = number(value, path)
    if result <= 0:
        raise ContractError(f"{path} must be positive")
    return result


def integer(value: Any, path: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or abs(value) > 2**53 - 1:
        raise ContractError(f"{path} must be a JavaScript-safe integer")
    return value


def vector3(value: Any, path: str) -> tuple[float, float, float]:
    if not isinstance(value, list) or len(value) != 3:
        raise ContractError(f"{path} must contain exactly three finite numbers")
    return (
        number(value[0], f"{path}[0]"),
        number(value[1], f"{path}[1]"),
        number(value[2], f"{path}[2]"),
    )


def parse_body(value: Any, index: int) -> Body:
    path, body = (
        f"request.scenario.bodies[{index}]",
        record(value, f"request.scenario.bodies[{index}]"),
    )
    exact_keys(body, path, {"id", "kind", "massKg", "radiusM", "state"})
    if body["kind"] not in ("star", "planet", "moon", "companion"):
        raise ContractError(f"{path}.kind is unsupported")
    state = record(body["state"], f"{path}.state")
    exact_keys(state, f"{path}.state", {"positionM", "velocityMps"})
    return Body(
        identifier(body["id"], f"{path}.id"),
        body["kind"],
        positive(body["massKg"], f"{path}.massKg"),
        positive(body["radiusM"], f"{path}.radiusM"),
        vector3(state["positionM"], f"{path}.state.positionM"),
        vector3(state["velocityMps"], f"{path}.state.velocityMps"),
    )


def parse_bodies(value: Any) -> tuple[Body, ...]:
    if not isinstance(value, list) or len(value) < 2:
        raise ContractError("request.scenario.bodies must contain at least two bodies")
    if len(value) > MAX_FORWARD_BODIES:
        raise ContractError(
            f"request.scenario.bodies must contain at most {MAX_FORWARD_BODIES} bodies"
        )
    return tuple(parse_body(body, index) for index, body in enumerate(value))


def parse_observer(value: Any) -> Observer:
    path, observer = (
        "request.scenario.observer",
        record(value, "request.scenario.observer"),
    )
    exact_keys(observer, path, {"lineOfSight", "targetBodyId"}, {"distanceM"})
    return Observer(
        target_body_id=identifier(observer["targetBodyId"], f"{path}.targetBodyId"),
        line_of_sight=vector3(observer["lineOfSight"], f"{path}.lineOfSight"),
        distance_m=(
            positive(observer["distanceM"], f"{path}.distanceM")
            if "distanceM" in observer
            else None
        ),
    )


def parse_integrator(value: Any) -> dict[str, Any]:
    path, integrator = (
        "request.scenario.integrator",
        record(value, "request.scenario.integrator"),
    )
    exact_keys(
        integrator,
        path,
        {
            "method",
            "positionToleranceM",
            "velocityToleranceMps",
            "relativeTolerance",
            "maxStepSec",
        },
    )
    if integrator["method"] != "DOP853":
        raise ContractError("current V5 backend requires DOP853")
    return integrator


def forward_request(payload: dict[str, Any]) -> tuple[ForwardRunRequest, int]:
    payload = record(payload, "request")
    exact_keys(
        payload,
        "request",
        {
            "kind",
            "scenario",
            "startOffsetSec",
            "endOffsetSec",
            "sampleCadenceSec",
            "outputs",
            "seed",
        },
    )
    if payload["kind"] != "forward":
        raise ContractError("only forward jobs are implemented")
    if payload["outputs"] != ["radial-velocity"]:
        raise ContractError(
            "current V5 backend supports exactly the radial-velocity output"
        )
    scenario = record(payload["scenario"], "request.scenario")
    exact_keys(
        scenario,
        "request.scenario",
        {
            "schemaVersion",
            "id",
            "epochJdTdb",
            "timeScale",
            "bodies",
            "observer",
            "integrator",
        },
    )
    if scenario["schemaVersion"] != SCHEMA_VERSION or scenario["timeScale"] != "TDB":
        raise ContractError("scenario must use schema v5 and TDB")
    identifier(scenario["id"], "request.scenario.id")
    integrator = parse_integrator(scenario["integrator"])
    start, end, cadence = (
        number(payload["startOffsetSec"], "request.startOffsetSec"),
        number(payload["endOffsetSec"], "request.endOffsetSec"),
        positive(payload["sampleCadenceSec"], "request.sampleCadenceSec"),
    )
    sample_times = samples(start, end, cadence)
    max_step = positive(
        integrator["maxStepSec"], "request.scenario.integrator.maxStepSec"
    )
    positive_steps, negative_steps = (
        max(0.0, end) / max_step,
        max(0.0, -start) / max_step,
    )
    if (
        not isfinite(positive_steps)
        or not isfinite(negative_steps)
        or ceil(positive_steps) + ceil(negative_steps) > MAX_INTEGRATOR_STEPS
    ):
        raise ContractError(
            "request.scenario.integrator.maxStepSec and requested span require more than "
            f"{MAX_INTEGRATOR_STEPS} integration steps"
        )
    request = ForwardRunRequest(
        bodies=parse_bodies(scenario["bodies"]),
        sample_times_s=sample_times,
        observer=parse_observer(scenario["observer"]),
        epoch_jd_tdb=positive(scenario["epochJdTdb"], "request.scenario.epochJdTdb"),
        execution_mode="research",
        position_tolerance_m=positive(
            integrator["positionToleranceM"],
            "request.scenario.integrator.positionToleranceM",
        ),
        velocity_tolerance_m_s=positive(
            integrator["velocityToleranceMps"],
            "request.scenario.integrator.velocityToleranceMps",
        ),
        integrator_rtol=positive(
            integrator["relativeTolerance"],
            "request.scenario.integrator.relativeTolerance",
        ),
        integrator_max_step_s=max_step,
    )
    return request, integer(payload["seed"], "request.seed")
