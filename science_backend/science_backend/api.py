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
from .contracts import MAX_FORWARD_SAMPLES, MAX_FORWARD_WALL_TIME_SECONDS
from .forward import run_forward

__all__ = [
    "ARROW_BATCH_SIZE",
    "BROWSER_CORS_ORIGINS",
    "DEFAULT_MAX_OUTSTANDING_JOBS",
    "DEFAULT_MAX_TERMINAL_JOBS",
    "MAX_FORWARD_SAMPLES",
    "MAX_FORWARD_WALL_TIME_SECONDS",
    "SCHEMA_VERSION",
    "SERVICE_VERSION",
    "TERMINAL_JOB_STATES",
    "V5ApiService",
    "_ApiJob",
    "_CapabilitySnapshot",
    "_capability_snapshot",
    "_forward_request",
    "_write_arrow",
    "capability_manifest",
    "create_app",
    "run_forward",
]
