"""Lazy FastAPI registration for the local V5 service."""

from __future__ import annotations

import logging
from collections.abc import Callable
from contextlib import asynccontextmanager
from typing import Any

from .__about__ import __version__
from .api_service import V5ApiService
from .errors import CapabilityUnavailableError, ContractError, JobCapacityError

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


def fastapi_dependencies() -> tuple[Any, Any, Any, Any]:
    try:
        from fastapi import FastAPI  # pyright: ignore[reportMissingImports]
        from fastapi.exceptions import (
            RequestValidationError,  # pyright: ignore[reportMissingImports]
        )
        from fastapi.middleware.cors import (
            CORSMiddleware,  # pyright: ignore[reportMissingImports]
        )
        from fastapi.responses import (
            FileResponse,  # pyright: ignore[reportMissingImports]
        )
    except ImportError as import_error:
        raise CapabilityUnavailableError(
            "HTTP service requires the 'service' extra (fastapi and uvicorn)"
        ) from import_error
    return FastAPI, RequestValidationError, CORSMiddleware, FileResponse


def lifespan(jobs: V5ApiService, owns_service: bool) -> Callable[..., Any]:
    @asynccontextmanager
    async def app_lifespan(_: Any):
        try:
            yield
        finally:
            if owns_service:
                jobs.close()

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


def register_base_routes(app: Any, jobs: V5ApiService, file_response: Any) -> None:
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
        path = jobs.artifact_root / f"{artifact_id}.arrow"
        if not path.is_file():
            return error("unknown-artifact", "unknown artifact", 404)
        return file_response(path, media_type="application/vnd.apache.arrow.file")


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
):
    fastapi, validation_error, cors_middleware, file_response = fastapi_dependencies()
    owns_service = service is None
    jobs = service if service is not None else service_factory()
    app = fastapi(
        title="Otherlight local science backend",
        version=__version__,
        lifespan=lifespan(jobs, owns_service),
    )
    app.add_middleware(
        cors_middleware,
        allow_origins=list(BROWSER_CORS_ORIGINS),
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["accept", "content-type"],
    )
    register_error_handlers(app, validation_error)
    register_base_routes(app, jobs, file_response)
    register_job_routes(app, jobs)
    return app
