"""Minimal RFC 8785/JCS serializer for validated scientific JSON values."""

from __future__ import annotations

import json
from decimal import Decimal
from math import isfinite
from typing import Any


def _number(value: int | float) -> str:
    number = float(value)
    if not isfinite(number):
        raise ValueError("canonical JSON does not support non-finite numbers")
    if number == 0:
        return "0"

    sign = "-" if number < 0 else ""
    return sign + _render_finite_decimal(Decimal(repr(abs(number))))


def _render_finite_decimal(decimal: Decimal) -> str:
    digits_tuple = list(decimal.as_tuple().digits)
    raw_exponent = decimal.as_tuple().exponent
    if not isinstance(raw_exponent, int):
        raise ValueError("canonical JSON does not support non-finite decimals")
    exponent = raw_exponent
    while len(digits_tuple) > 1 and digits_tuple[-1] == 0:
        digits_tuple.pop()
        exponent += 1
    digits = "".join(str(digit) for digit in digits_tuple)
    decimal_position = len(digits) + exponent

    if -5 <= decimal_position <= 21:
        if decimal_position <= 0:
            rendered = f"0.{('0' * -decimal_position)}{digits}"
        elif decimal_position >= len(digits):
            rendered = digits + "0" * (decimal_position - len(digits))
        else:
            rendered = f"{digits[:decimal_position]}.{digits[decimal_position:]}"
        return rendered

    scientific_exponent = decimal_position - 1
    mantissa = digits[0] if len(digits) == 1 else f"{digits[0]}.{digits[1:]}"
    exponent_sign = "+" if scientific_exponent >= 0 else ""
    return f"{mantissa}e{exponent_sign}{scientific_exponent}"


def _key_order(value: str) -> bytes:
    return value.encode("utf-16-be")


def canonical_json(value: Any) -> str:
    """Serialize one I-JSON value, encoding Python lists and tuples as arrays."""

    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, (int, float)):
        return _number(value)
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    if isinstance(value, (list, tuple)):
        return "[" + ",".join(canonical_json(entry) for entry in value) + "]"
    if isinstance(value, dict):
        if not all(isinstance(key, str) for key in value):
            raise TypeError("canonical JSON object keys must be strings")
        entries = (
            f"{canonical_json(key)}:{canonical_json(value[key])}"
            for key in sorted(value, key=_key_order)
        )
        return "{" + ",".join(entries) + "}"
    raise TypeError("canonical JSON supports only JSON values")
