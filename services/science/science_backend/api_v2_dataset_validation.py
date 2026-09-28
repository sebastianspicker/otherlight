"""Strict parsing and validation for in-memory science-v6 dataset imports."""

from __future__ import annotations

import json
import sys
from itertools import pairwise
from math import isfinite, pi
from types import MappingProxyType
from typing import Any

from .errors import ContractError, DatasetCapacityError

MAX_DATASET_BYTES = 8 * 1024 * 1024
MAX_DATASET_SAMPLES = 100_000
MAX_JSON_DEPTH = 32
MAX_JSON_NODES = 1_000_000
DATASET_KINDS = frozenset(
    {
        "passband-response",
        "stellar-intensity-grid",
        "atmospheric-profile",
        "scattering-phase-function",
        "stellar-variability-psd",
    }
)


def _duplicate_safe_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ContractError(f"dataset JSON contains duplicate key {key!r}")
        result[key] = value
    return result


def _reject_non_finite(token: str) -> None:
    raise ContractError(f"dataset JSON contains unsupported number token {token!r}")


def parse_dataset_bytes(source: bytes) -> dict[str, Any]:
    """Decode one bounded UTF-8 JSON object without accepting duplicate keys."""

    if len(source) > MAX_DATASET_BYTES:
        raise DatasetCapacityError(
            f"dataset upload exceeds the {MAX_DATASET_BYTES}-byte limit"
        )
    try:
        text = source.decode("utf-8", errors="strict")
    except UnicodeDecodeError as error:
        raise ContractError("dataset body must be valid UTF-8") from error
    try:
        value = json.loads(
            text,
            object_pairs_hook=_duplicate_safe_object,
            parse_constant=_reject_non_finite,
        )
    except ContractError:
        raise
    except (json.JSONDecodeError, RecursionError) as error:
        raise ContractError("dataset body must be one valid JSON document") from error
    if not isinstance(value, dict):
        raise ContractError("dataset body must be a JSON object")
    _validate_json_shape(value)
    return value


def _validate_json_shape(value: Any) -> None:
    nodes = 0
    stack: list[tuple[Any, int]] = [(value, 1)]
    while stack:
        current, depth = stack.pop()
        nodes += 1
        if nodes > MAX_JSON_NODES:
            raise DatasetCapacityError(
                f"dataset JSON exceeds the {MAX_JSON_NODES}-node limit"
            )
        if depth > MAX_JSON_DEPTH:
            raise ContractError(
                f"dataset JSON nesting exceeds the {MAX_JSON_DEPTH}-level limit"
            )
        if isinstance(current, dict):
            if any(_contains_surrogate(key) for key in current):
                raise ContractError(
                    "dataset JSON strings must contain valid Unicode scalars"
                )
            stack.extend((nested, depth + 1) for nested in current.values())
        elif isinstance(current, list):
            stack.extend((nested, depth + 1) for nested in current)
        elif isinstance(current, str) and _contains_surrogate(current):
            raise ContractError(
                "dataset JSON strings must contain valid Unicode scalars"
            )


def _contains_surrogate(value: str) -> bool:
    return any(0xD800 <= ord(character) <= 0xDFFF for character in value)


def _record(value: Any, path: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ContractError(f"{path} must be an object")
    return value


def _exact_keys(
    value: dict[str, Any],
    path: str,
    required: set[str],
    optional: set[str] | None = None,
) -> None:
    allowed = required | (optional or set())
    missing = sorted(required - value.keys())
    unknown = sorted(value.keys() - allowed)
    if missing:
        raise ContractError(f"{path} is missing required fields: {', '.join(missing)}")
    if unknown:
        raise ContractError(f"{path} contains unsupported fields: {', '.join(unknown)}")


def _numbers(
    value: Any,
    path: str,
    *,
    minimum: float | None = None,
    maximum: float | None = None,
) -> list[float]:
    if not isinstance(value, list) or not value:
        raise ContractError(f"{path} must be a non-empty array")
    result: list[float] = []
    for index, entry in enumerate(value):
        if isinstance(entry, bool) or not isinstance(entry, (int, float)):
            raise ContractError(f"{path}[{index}] must be a finite number")
        try:
            number = float(entry)
        except OverflowError as error:
            raise ContractError(f"{path}[{index}] must be a finite number") from error
        if not isfinite(number):
            raise ContractError(f"{path}[{index}] must be a finite number")
        if minimum is not None and number < minimum:
            raise ContractError(f"{path}[{index}] must be at least {minimum}")
        if maximum is not None and number > maximum:
            raise ContractError(f"{path}[{index}] must be at most {maximum}")
        result.append(number)
    return result


def _bounded_numbers(
    value: Any, path: str, *, minimum: float, maximum: float
) -> list[float]:
    result = _numbers(value, path)
    if any(number < minimum or number > maximum for number in result):
        raise ContractError(f"{path} values must be between {minimum} and {maximum}")
    return result


def _increasing(values: list[float], path: str, *, positive: bool = False) -> None:
    if len(values) < 2:
        raise ContractError(f"{path} must contain at least two samples")
    if positive and values[0] <= 0:
        raise ContractError(f"{path} values must be positive")
    if any(right <= left for left, right in pairwise(values)):
        raise ContractError(f"{path} must be strictly increasing")


def _paired(axis: list[float], values: list[float], path: str) -> int:
    if len(axis) != len(values):
        raise ContractError(f"{path} arrays must have the same length")
    return len(axis)


def _units(value: Any, expected: dict[str, str]) -> None:
    units = _record(value, "dataset.units")
    _exact_keys(units, "dataset.units", set(expected))
    for key, unit in expected.items():
        if units[key] != unit:
            raise ContractError(f"dataset.units.{key} must be {unit!r}")


def _common(payload: dict[str, Any], required: set[str]) -> str:
    _exact_keys(payload, "dataset", {"schemaVersion", "kind", "units"} | required)
    if payload["schemaVersion"] != "science-dataset-v2":
        raise ContractError("dataset.schemaVersion must be 'science-dataset-v2'")
    kind = payload["kind"]
    if kind not in DATASET_KINDS:
        raise ContractError("dataset.kind is unsupported")
    return kind


def validate_dataset(payload: dict[str, Any]) -> tuple[str, int]:
    """Validate exact V6 dataset fields and return kind plus normalized sample count."""

    kind = payload.get("kind")
    if kind == "passband-response":
        count = _validate_passband(payload)
    elif kind == "stellar-intensity-grid":
        count = _validate_intensity_grid(payload)
    elif kind == "atmospheric-profile":
        count = _validate_atmospheric_profile(payload)
    elif kind == "scattering-phase-function":
        count = _validate_scattering(payload)
    elif kind == "stellar-variability-psd":
        count = _validate_variability_psd(payload)
    else:
        _common(payload, set())
        raise ContractError("dataset.kind is unsupported")
    if count > MAX_DATASET_SAMPLES:
        raise DatasetCapacityError(
            f"dataset contains more than {MAX_DATASET_SAMPLES} normalized samples"
        )
    return kind, count


def _validate_passband(payload: dict[str, Any]) -> int:
    _common(payload, {"wavelengthM", "response"})
    _units(payload["units"], {"wavelengthM": "m", "response": "1"})
    axis = _numbers(payload["wavelengthM"], "dataset.wavelengthM", maximum=1e4)
    _increasing(axis, "dataset.wavelengthM", positive=True)
    return _paired(
        axis,
        _bounded_numbers(payload["response"], "dataset.response", minimum=0, maximum=1),
        "dataset passband",
    )


def _validate_intensity_grid(payload: dict[str, Any]) -> int:
    _common(payload, {"wavelengthM", "mu", "intensityWm3Sr"})
    _units(
        payload["units"],
        {"wavelengthM": "m", "mu": "1", "intensityWm3Sr": "W m^-3 sr^-1"},
    )
    axis = _numbers(payload["wavelengthM"], "dataset.wavelengthM", maximum=1e4)
    mu = _bounded_numbers(payload["mu"], "dataset.mu", minimum=0, maximum=1)
    _increasing(axis, "dataset.wavelengthM", positive=True)
    _increasing(mu, "dataset.mu")
    rows = payload["intensityWm3Sr"]
    if not isinstance(rows, list) or len(rows) != len(axis):
        raise ContractError(
            "dataset.intensityWm3Sr must contain one row per wavelengthM value"
        )
    for index, row in enumerate(rows):
        values = _numbers(
            row, f"dataset.intensityWm3Sr[{index}]", minimum=0, maximum=1e30
        )
        if len(values) != len(mu):
            raise ContractError("each dataset.intensityWm3Sr row must match mu")
    return len(axis) * len(mu)


def _validate_atmospheric_profile(payload: dict[str, Any]) -> int:
    representation = payload.get("representation")
    if representation == "transmission":
        _common(payload, {"representation", "wavelengthM", "transmission"})
        _units(payload["units"], {"wavelengthM": "m", "transmission": "1"})
        values = _bounded_numbers(
            payload["transmission"], "dataset.transmission", minimum=0, maximum=1
        )
    elif representation == "effective-radius":
        _common(payload, {"representation", "wavelengthM", "effectiveRadiusM"})
        _units(payload["units"], {"wavelengthM": "m", "effectiveRadiusM": "m"})
        values = _numbers(
            payload["effectiveRadiusM"],
            "dataset.effectiveRadiusM",
            minimum=0,
            maximum=1e30,
        )
        if any(value <= 0 for value in values):
            raise ContractError("dataset.effectiveRadiusM values must be positive")
    else:
        raise ContractError(
            "dataset.representation must be 'transmission' or 'effective-radius'"
        )
    axis = _numbers(payload["wavelengthM"], "dataset.wavelengthM", maximum=1e4)
    _increasing(axis, "dataset.wavelengthM", positive=True)
    return _paired(axis, values, "dataset atmospheric profile")


def _validate_scattering(payload: dict[str, Any]) -> int:
    _common(payload, {"scatteringAngleRad", "phaseFunctionSrInv"})
    _units(
        payload["units"],
        {"scatteringAngleRad": "rad", "phaseFunctionSrInv": "sr^-1"},
    )
    axis = _bounded_numbers(
        payload["scatteringAngleRad"],
        "dataset.scatteringAngleRad",
        minimum=0,
        maximum=pi,
    )
    _increasing(axis, "dataset.scatteringAngleRad")
    return _paired(
        axis,
        _numbers(
            payload["phaseFunctionSrInv"],
            "dataset.phaseFunctionSrInv",
            minimum=0,
            maximum=1e30,
        ),
        "dataset scattering phase function",
    )


def _validate_variability_psd(payload: dict[str, Any]) -> int:
    _common(payload, {"frequencyHz", "powerSpectralDensityPerHz"})
    _units(
        payload["units"],
        {"frequencyHz": "Hz", "powerSpectralDensityPerHz": "Hz^-1"},
    )
    axis = _numbers(payload["frequencyHz"], "dataset.frequencyHz", maximum=1e30)
    _increasing(axis, "dataset.frequencyHz", positive=True)
    return _paired(
        axis,
        _numbers(
            payload["powerSpectralDensityPerHz"],
            "dataset.powerSpectralDensityPerHz",
            minimum=0,
            maximum=1e30,
        ),
        "dataset stellar variability PSD",
    )


def _freeze_and_measure(value: Any, *, reuse_mappings: bool) -> tuple[Any, int]:
    """Freeze and exactly size retained containers plus shared leaf objects."""

    memo: dict[int, Any] = {}
    measured: set[int] = set()
    total = 0

    def account(current: Any) -> None:
        nonlocal total
        identity = id(current)
        if identity not in measured:
            measured.add(identity)
            total += sys.getsizeof(current)

    def freeze(current: Any) -> Any:
        identity = id(current)
        if identity in memo:
            return memo[identity]
        if isinstance(current, dict):
            backing: dict[str, Any] = current if reuse_mappings else {}
            proxy = MappingProxyType(backing)
            memo[identity] = proxy
            for key, nested in current.items():
                account(key)
                backing[key] = freeze(nested)
            account(backing)
            account(proxy)
            return proxy
        if isinstance(current, list):
            frozen = tuple(freeze(nested) for nested in current)
            memo[identity] = frozen
            account(frozen)
            return frozen
        account(current)
        return current

    frozen = freeze(value)
    return frozen, total


def freeze_and_measure_owned(value: Any) -> tuple[Any, int]:
    """Freeze a private parsed tree in place and measure its retained graph once."""

    return _freeze_and_measure(value, reuse_mappings=True)


def freeze_and_measure(value: Any) -> tuple[Any, int]:
    """Freeze a caller-owned graph by copying mappings and measure it once."""

    return _freeze_and_measure(value, reuse_mappings=False)


def freeze_json(value: Any) -> Any:
    """Compatibility helper for callers that only need an immutable graph."""

    return freeze_and_measure(value)[0]
