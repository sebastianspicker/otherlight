"""Lazy FastAPI registration for the local V5 service."""

from __future__ import annotations

import logging
from collections.abc import Callable
from contextlib import asynccontextmanager
from typing import Any

from .__about__ import __version__
from .api_service import V5ApiService
from .api_v2_datasets import V6DatasetRegistry
from .api_v2_http import UnsupportedDatasetMediaType, register_v2_routes
from .artifact_store import open_verified_artifact
from .errors import (
    CapabilityUnavailableError,
    ContractError,
    DatasetCapacityError,
    DatasetInUseError,
    JobCapacityError,
)

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

    @app.exception_handler(DatasetCapacityError)
    async def dataset_capacity_error(_: Any, failure: DatasetCapacityError):
        status = 413 if "byte limit" in str(failure) else 409
        code = "dataset-too-large" if status == 413 else "dataset-quota-exceeded"
        return error(code, str(failure), status)

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

    @app.exception_handler(Exception)
    async def unexpected_error(_: Any, failure: Exception):
        LOGGER.error(
            "unexpected HTTP scientific backend failure",
            exc_info=(type(failure), failure, failure.__traceback__),
        )
        return error(
            "internal-scientific-error", "an internal scientific error occurred", 500
        )


def register_base_routes(app: Any, jobs: V5ApiService, streaming_response: Any) -> None:
    @app.get("/v1/capabilities")
    def capabilities():
        return jobs.capabilities()

    @app.post("/v1/jobs", status_code=201)
    def submit(payload: dict[str, Any]):
        return jobs.submit(payload)

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
    app = fastapi(
        title="Otherlight local science backend",
        version=__version__,
        lifespan=lifespan(jobs, owns_service, datasets, owns_datasets),
    )
    app.add_middleware(
        cors_middleware,
        allow_origins=list(BROWSER_CORS_ORIGINS),
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["accept", "content-type"],
    )
    register_error_handlers(app, validation_error)
    register_base_routes(app, jobs, streaming_response)
    register_job_routes(app, jobs)
    register_v2_routes(app, datasets, request_type)

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
