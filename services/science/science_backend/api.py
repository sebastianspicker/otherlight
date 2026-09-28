"""Stable V5 API facade; implementation lives in focused sibling modules."""

from .api_artifacts import ARROW_BATCH_SIZE
from .api_artifacts import write_arrow as _write_arrow
from .api_contract import (
    SCHEMA_VERSION,
    SERVICE_VERSION,
    capability_manifest,
)
from .api_contract import (
    CapabilitySnapshot as _CapabilitySnapshot,
)
from .api_contract import (
    capability_snapshot as _capability_snapshot,
)
from .api_contract import (
    forward_request as _forward_request,
)
from .api_http import BROWSER_CORS_ORIGINS, create_app
from .api_service import (
    DEFAULT_MAX_OUTSTANDING_JOBS,
    DEFAULT_MAX_TERMINAL_JOBS,
    TERMINAL_JOB_STATES,
    V5ApiService,
)
from .api_service import (
    ApiJob as _ApiJob,
)
from .api_v2_datasets import (
    DATASET_MEDIA_TYPE,
    MAX_AGGREGATE_SAMPLES,
    MAX_DATASET_BYTES,
    MAX_DATASET_SAMPLES,
    MAX_DATASETS,
    MAX_NORMALIZED_BYTES,
    V6DatasetRegistry,
)
from .artifact_cache import (
    ARTIFACT_CACHE_ENV,
    DEFAULT_ARTIFACT_CACHE_MAX_BYTES,
    MAX_ARTIFACT_WRITER_TEMP_BYTES,
)
from .contracts import MAX_FORWARD_SAMPLES, MAX_FORWARD_WALL_TIME_SECONDS
from .forward import run_forward

__all__ = [
    "ARROW_BATCH_SIZE",
    "ARTIFACT_CACHE_ENV",
    "BROWSER_CORS_ORIGINS",
    "DATASET_MEDIA_TYPE",
    "DEFAULT_ARTIFACT_CACHE_MAX_BYTES",
    "DEFAULT_MAX_OUTSTANDING_JOBS",
    "DEFAULT_MAX_TERMINAL_JOBS",
    "MAX_AGGREGATE_SAMPLES",
    "MAX_ARTIFACT_WRITER_TEMP_BYTES",
    "MAX_DATASETS",
    "MAX_DATASET_BYTES",
    "MAX_DATASET_SAMPLES",
    "MAX_FORWARD_SAMPLES",
    "MAX_FORWARD_WALL_TIME_SECONDS",
    "MAX_NORMALIZED_BYTES",
    "SCHEMA_VERSION",
    "SERVICE_VERSION",
    "TERMINAL_JOB_STATES",
    "V5ApiService",
    "V6DatasetRegistry",
    "_ApiJob",
    "_CapabilitySnapshot",
    "_capability_snapshot",
    "_forward_request",
    "_write_arrow",
    "capability_manifest",
    "create_app",
    "run_forward",
]
