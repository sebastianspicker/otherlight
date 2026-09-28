"""Compatibility facade for the science-v6 dataset registry."""

from __future__ import annotations

from . import api_v2_dataset_validation as dataset_validation
from .api_v2_dataset_registry import (
    DATASET_MEDIA_TYPE,
    MAX_AGGREGATE_SAMPLES,
    MAX_DATASETS,
    MAX_NORMALIZED_BYTES,
    ImportedDataset,
    V6DatasetRegistry,
)

MAX_DATASET_BYTES = dataset_validation.MAX_DATASET_BYTES
MAX_DATASET_SAMPLES = dataset_validation.MAX_DATASET_SAMPLES

__all__ = [
    "DATASET_MEDIA_TYPE",
    "MAX_AGGREGATE_SAMPLES",
    "MAX_DATASETS",
    "MAX_DATASET_BYTES",
    "MAX_DATASET_SAMPLES",
    "MAX_NORMALIZED_BYTES",
    "ImportedDataset",
    "V6DatasetRegistry",
]
