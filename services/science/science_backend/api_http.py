"""Lazy FastAPI registration for the local V5 service."""

from __future__ import annotations

import json
import logging
import uuid
from collections.abc import Callable
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from .__about__ import __version__
from .api_service import V5ApiService
from .api_v2_datasets import V6DatasetRegistry
from .api_v2_http import (
    UnsupportedDatasetMediaType,
    declared_content_length,
    read_bounded_body,
    register_v2_routes,
)
from .api_v3_http import register_v3_routes
from .artifact_store import open_verified_artifact
from .errors import (
    CapabilityUnavailableError,
    ContractError,
    DatasetCapacityError,
    DatasetInUseError,
    DatasetTooLargeError,
    JobCapacityError,
    JobStateError,
)
from .research_store import ResearchStore

LOGGER = logging.getLogger(__name__)
BROWSER_CORS_ORIGINS = (
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://127.0.0.1:4173",
    "http://localhost:4173",
    "http://127.0.0.1:4174",
    "http://localhost:4174",
)


def error(
    code: str, message: str, status_code: int, *, headers: dict[str, str] | None = None
) -> Any:
    from fastapi.responses import JSONResponse  # pyright: ignore[reportMissingImports]

    return JSONResponse(
        status_code=status_code,
        content={"code": code, "message": message},
        headers=headers,
    )


def fastapi_dependencies() -> tuple[Any, Any, Any, Any, Any]:
    try:
        from fastapi import FastAPI  # pyright: ignore[reportMissingImports]
        from fastapi.exceptions import (  # pyright: ignore[reportMissingImports]
            RequestValidationError,
        )
        from fastapi.middleware.cors import (  # pyright: ignore[reportMissingImports]
            CORSMiddleware,
        )
        from fastapi.responses import (  # pyright: ignore[reportMissingImports]
            StreamingResponse,
        )
        from starlette.requests import Request  # pyright: ignore[reportMissingImports]
    except ImportError as import_error:
        raise CapabilityUnavailableError(
            "HTTP service requires the 'service' extra (fastapi and uvicorn)"
        ) from import_error
    return FastAPI, RequestValidationError, CORSMiddleware, StreamingResponse, Request


def lifespan(
    jobs: V5ApiService,
    owns_service: bool,
    datasets: V6DatasetRegistry,
    owns_datasets: bool,
) -> Callable[..., Any]:
    @asynccontextmanager
    async def app_lifespan(_: Any):
        try:
            yield
        finally:
            if owns_service:
                jobs.close()
            if owns_datasets:
                datasets.close()

    return app_lifespan


def register_error_handlers(app: Any, validation_type: Any) -> None:
    @app.exception_handler(ContractError)
    async def contract_error(_: Any, failure: ContractError):
        return error("invalid-contract", str(failure), 422)

    @app.exception_handler(CapabilityUnavailableError)
    async def capability_error(_: Any, failure: CapabilityUnavailableError):
        return error("capability-unavailable", str(failure), 503)

    @app.exception_handler(JobCapacityError)
    async def capacity_error(_: Any, failure: JobCapacityError):
        return error(
            "job-capacity-exhausted", str(failure), 429, headers={"Retry-After": "1"}
        )

    @app.exception_handler(JobStateError)
    async def job_state_error(_: Any, failure: JobStateError):
        return error("job-state-invalid", str(failure), 409)

    @app.exception_handler(DatasetTooLargeError)
    async def dataset_too_large_error(_: Any, failure: DatasetTooLargeError):
        return error("dataset-too-large", str(failure), 413)

    @app.exception_handler(DatasetCapacityError)
    async def dataset_capacity_error(_: Any, failure: DatasetCapacityError):
        return error("dataset-quota-exceeded", str(failure), 409)

    @app.exception_handler(DatasetInUseError)
    async def dataset_in_use_error(_: Any, failure: DatasetInUseError):
        return error("dataset-in-use", str(failure), 409)

    @app.exception_handler(UnsupportedDatasetMediaType)
    async def dataset_media_error(_: Any, _failure: UnsupportedDatasetMediaType):
        return error(
            "unsupported-media-type",
            "datasets require uncompressed application/vnd.otherlight.science-dataset+json; charset=utf-8",
            415,
        )

    @app.exception_handler(validation_type)
    async def validation_error(_: Any, _details: Any):
        return error("invalid-contract", "request body is invalid", 422)


def register_unexpected_error_boundary(app: Any) -> None:
    """Answers unexpected failures with the JSON error envelope.

    An ``Exception`` handler would run in Starlette's outermost middleware and
    skip CORS and the loopback headers, so the Browser would only see a CORS
    failure. This middleware must be added before CORS so it sits inside it.
    The request id ties the Browser's message to the service log.
    """

    @app.middleware("http")
    async def unexpected_error_boundary(request: Any, call_next: Any):
        try:
            return await call_next(request)
        except Exception as failure:
            request_id = uuid.uuid4().hex[:12]
            LOGGER.error(
                "unexpected HTTP scientific backend failure (request %s, %s %r)",
                request_id,
                request.method,
                request.url.path,
                exc_info=(type(failure), failure, failure.__traceback__),
            )
            return error(
                "internal-scientific-error",
                f"an internal scientific error occurred (request id {request_id})",
                500,
            )


def configure_service_logging() -> None:
    """Gives backend log records timestamps when nothing else configured logging.

    Uvicorn's default config covers only its own loggers, so without this the
    error records reach stderr through Python's last-resort handler with no
    time or level. An embedding application that configures logging before
    calling ``create_app`` keeps its own handlers; one that configures logging
    later must attach to the ``science_backend`` logger, which then no longer
    propagates to the root logger.
    """
    package_logger = logging.getLogger("science_backend")
    if package_logger.handlers or logging.getLogger().handlers:
        return
    handler = logging.StreamHandler()
    handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
    )
    package_logger.addHandler(handler)
    package_logger.setLevel(logging.INFO)
    package_logger.propagate = False


def require_json_content_type(raw_headers: Any) -> None:
    content_types = [
        value for name, value in raw_headers if name.lower() == b"content-type"
    ]
    media_type = (
        content_types[0].split(b";", 1)[0].strip().lower() if content_types else b""
    )
    if len(content_types) != 1 or media_type != b"application/json":
        raise ContractError("request Content-Type must be application/json")


def register_base_routes(
    app: Any, jobs: V5ApiService, streaming_response: Any, request_type: Any
) -> None:
    from starlette.concurrency import (  # pyright: ignore[reportMissingImports]
        run_in_threadpool,
    )

    @app.get("/v1/capabilities")
    def capabilities():
        return jobs.capabilities()

    async def submit(request: Any):
        raw_headers = request.scope.get("headers", ())
        require_json_content_type(raw_headers)
        declared = declared_content_length(raw_headers, "request")
        body = await read_bounded_body(request, declared, "request")
        try:
            payload = json.loads(body)
        except (ValueError, RecursionError) as failure:
            raise ContractError("request body must be one valid JSON document") from (
                failure
            )
        if not isinstance(payload, dict):
            raise ContractError("request body must be a JSON object")
        return await run_in_threadpool(jobs.submit, payload)

    submit.__annotations__["request"] = request_type
    app.post("/v1/jobs", status_code=201)(submit)

    @app.get("/v1/artifacts/{artifact_id}")
    def artifact(artifact_id: str):
        valid = len(artifact_id) == 64 and all(
            character in "0123456789abcdef" for character in artifact_id
        )
        if not valid:
            return error("unknown-artifact", "unknown artifact", 404)
        artifact = open_verified_artifact(
            jobs.artifact_root, f"{artifact_id}.arrow", artifact_id
        )
        if artifact is None:
            return error("unknown-artifact", "unknown artifact", 404)
        return streaming_response(
            artifact.chunks(),
            media_type="application/vnd.apache.arrow.file",
            headers={"Content-Length": str(artifact.size)},
        )


def register_job_routes(app: Any, jobs: V5ApiService) -> None:
    @app.get("/v1/jobs/{job_id}")
    def status(job_id: str):
        try:
            return jobs.status(job_id)
        except KeyError:
            return error("unknown-job", "unknown job", 404)

    @app.get("/v1/jobs/{job_id}/result")
    def result(job_id: str):
        try:
            completed = jobs.result(job_id)
        except KeyError:
            return error("unknown-job", "unknown job", 404)
        if completed is None:
            return error("job-not-completed", "job has no completed result", 409)
        return completed

    @app.delete("/v1/jobs/{job_id}")
    def cancel(job_id: str):
        try:
            return jobs.cancel(job_id)
        except KeyError:
            return error("unknown-job", "unknown job", 404)
        except RuntimeError:
            return error("job-already-terminal", "job is already terminal", 409)


def create_app(
    service: V5ApiService | None = None,
    *,
    service_factory: Callable[[], V5ApiService] = V5ApiService,
    dataset_registry: V6DatasetRegistry | None = None,
    dataset_registry_factory: Callable[[], V6DatasetRegistry] = V6DatasetRegistry,
    research_store: ResearchStore | None = None,
):
    fastapi, validation_error, cors_middleware, streaming_response, request_type = (
        fastapi_dependencies()
    )
    owns_service = service is None
    jobs = service if service is not None else service_factory()
    owns_datasets = dataset_registry is None
    datasets = (
        dataset_registry if dataset_registry is not None else dataset_registry_factory()
    )
    configure_service_logging()
    app = fastapi(
        title="Otherlight local science backend",
        version=__version__,
        lifespan=lifespan(jobs, owns_service, datasets, owns_datasets),
    )
    register_unexpected_error_boundary(app)
    app.add_middleware(
        cors_middleware,
        allow_origins=list(BROWSER_CORS_ORIGINS),
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["accept", "content-type"],
    )
    register_error_handlers(app, validation_error)
    register_base_routes(app, jobs, streaming_response, request_type)
    register_job_routes(app, jobs)
    register_v2_routes(app, datasets, request_type)
    register_v3_routes(
        app,
        research_store
        if research_store is not None
        else ResearchStore(Path(".science-cache/research")),
        request_type,
    )

    @app.middleware("http")
    async def loopback_security_boundary(request: Any, call_next: Any):
        if not _valid_loopback_host(request.scope.get("headers", ())):
            response = error("invalid-host", "request Host must be loopback", 400)
        else:
            if not _valid_origin(request.scope.get("headers", ())):
                response = error(
                    "invalid-origin", "request Origin is not permitted", 403
                )
            else:
                response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    return app


def _valid_loopback_host(raw_headers: Any) -> bool:
    value = _single_ascii_header(raw_headers, b"host")
    if value is None:
        return False
    suffix = _loopback_host_port_suffix(value.lower())
    return suffix is not None and _valid_port_suffix(suffix)


def _single_ascii_header(raw_headers: Any, header_name: bytes) -> str | None:
    values = [value for name, value in raw_headers if name.lower() == header_name]
    if len(values) != 1:
        return None
    try:
        return values[0].decode("ascii")
    except UnicodeDecodeError:
        return None


def _loopback_host_port_suffix(value: str) -> str | None:
    if value.startswith("["):
        closing = value.find("]")
        if closing < 0 or value[1:closing] != "::1":
            return None
        return value[closing + 1 :]
    host, separator, port = value.partition(":")
    if host not in {"127.0.0.1", "localhost"}:
        return None
    return f":{port}" if separator else ""


def _valid_port_suffix(suffix: str) -> bool:
    if not suffix:
        return True
    if not suffix.startswith(":") or not suffix[1:].isdigit():
        return False
    numeric_port = int(suffix[1:])
    return 1 <= numeric_port <= 65_535


def _valid_origin(raw_headers: Any) -> bool:
    values = [value for name, value in raw_headers if name.lower() == b"origin"]
    if not values:
        return True
    if len(values) != 1:
        return False
    try:
        return values[0].decode("ascii") in BROWSER_CORS_ORIGINS
    except UnicodeDecodeError:
        return False
