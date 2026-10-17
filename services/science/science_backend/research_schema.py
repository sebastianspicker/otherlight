"""Build the strict, dependency-free V7 input schema vocabulary and common units."""

from typing import Any

BASE = "https://example.invalid/otherlight/"
DRAFT = "https://json-schema.org/draft/2020-12/schema"


def record(
    properties: dict[str, Any], optional: tuple[str, ...] = ()
) -> dict[str, Any]:
    """Declare an exact record; absent optional fields never acquire defaults."""
    return {
        "type": "object",
        "properties": properties,
        "required": [key for key in properties if key not in optional],
        "additionalProperties": False,
    }


def array(items: dict[str, Any], minimum: int = 0, maximum: int = 100_000):
    return {"type": "array", "items": items, "minItems": minimum, "maxItems": maximum}


def number(minimum: float = -1e100, maximum: float = 1e100):
    return {"type": "number", "minimum": minimum, "maximum": maximum}


def text(maximum: int = 256):
    return {"type": "string", "minLength": 1, "maxLength": maximum}


def choice(*values: str):
    return {"enum": list(values)}


def ref(name: str):
    return {"$ref": f"common.schema.json#/$defs/{name}"}


def document(name: str, properties: dict[str, Any], optional: tuple[str, ...] = ()):
    return {
        "$schema": DRAFT,
        "$id": f"{BASE}science-v7/{name}.schema.json",
        **record({"schemaVersion": {"const": "science-v7"}, **properties}, optional),
    }


COMMON = {
    "$schema": DRAFT,
    "$id": f"{BASE}science-v7/common.schema.json",
    "$defs": {
        "hash": {"type": "string", "pattern": "^[0-9a-f]{64}$"},
        "id": {
            **text(128),
            "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$",
        },
        "time": record(
            {
                "jd1": {"type": "integer", "minimum": 2_000_000, "maximum": 3_000_000},
                "jd2": {"type": "number", "minimum": -0.5, "exclusiveMaximum": 0.5},
            }
        ),
        "vector3": array(number(), 3, 3),
        "timeConvention": record(
            {
                "scale": choice("TDB", "TT", "UTC"),
                "reference": choice("observer-arrival", "barycentric-arrival"),
                "exposureTimestamp": choice("start", "midpoint", "end"),
                "referenceDataHashes": array(ref("hash"), 0, 32),
            }
        ),
        "correction": record(
            {
                "operation": text(),
                "version": text(),
                "provenanceHash": ref("hash"),
            }
        ),
        "numericalBudget": record(
            {
                name: {"type": "number", "exclusiveMinimum": 0, "maximum": 1}
                for name in (
                    "trajectory",
                    "propagation",
                    "spatial",
                    "spectral",
                    "exposure",
                )
            }
        ),
    },
}


PROVENANCE = document(
    "provenance",
    {
        "kind": {"const": "provenance"},
        "operation": text(),
        "softwareVersion": text(),
        "inputHashes": array(ref("hash"), 1, 64),
        "citations": array(text(4096), 1, 64),
        "licences": array(text(4096), 1, 64),
        "notes": text(16_384),
    },
    ("notes",),
)

OBSERVATIONS = document(
    "observations",
    {
        "kind": {"const": "observations"},
        "observable": choice(
            "relative-flux", "radial-velocity", "event-time", "astrometry"
        ),
        "components": array(choice("flux", "rv", "oc", "xi", "eta"), 1, 2),
        "units": array(choice("1", "m/s", "s", "rad"), 1, 2),
        "instrumentId": ref("id"),
        "timeConvention": ref("timeConvention"),
        "sourceHash": ref("hash"),
        "provenanceHash": ref("hash"),
        "calibrationHashes": array(ref("hash"), 0, 64),
        "correctionHistory": array(ref("correction"), 0, 64),
        "uncertaintyModel": {"const": "independent-gaussian"},
        "rows": array(
            record(
                {
                    "time": ref("time"),
                    "exposureSeconds": number(0, 31_557_600),
                    "value": array(number(), 1, 2),
                    "sigma": array({"type": "number", "exclusiveMinimum": 0}, 1, 2),
                    "masked": {"type": "boolean"},
                }
            ),
            1,
            100_000,
        ),
        "astrometricReference": record(
            {
                "projection": {"const": "gnomonic-icrs-v1"},
                "raRad": {
                    "type": "number",
                    "minimum": 0,
                    "exclusiveMaximum": 6.283185307179586,
                },
                "decRad": number(-1.5707963267948966, 1.5707963267948966),
            }
        ),
        "ephemeris": record(
            {
                "epoch": ref("time"),
                "periodSeconds": {"type": "number", "exclusiveMinimum": 0},
            }
        ),
    },
    ("ephemeris", "astrometricReference"),
)

CALIBRATION = document(
    "calibration",
    {
        "kind": {"const": "calibration"},
        "model": {"const": "tabulated-passband-v1"},
        "sourceHash": ref("hash"),
        "provenanceHash": ref("hash"),
        "version": text(),
        "weighting": choice("photon", "energy"),
        "interpolation": {"const": "piecewise-linear"},
        "outsideDomain": {"const": "reject"},
        "wavelengthM": array({"type": "number", "exclusiveMinimum": 0}, 2),
        "response": array(number(0, 1), 2),
    },
)
