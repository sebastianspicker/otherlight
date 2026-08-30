"""Versioned forward-run manifest construction."""

from __future__ import annotations

from importlib.metadata import PackageNotFoundError, version
from platform import python_version

from .contracts import G_SI, ForwardRunRequest, request_fingerprint
from .forward_types import RunManifest


def package_version(package: str) -> str:
    try:
        return version(package)
    except PackageNotFoundError:
        return "unavailable"


def run_manifest(
    request: ForwardRunRequest, engine: str, scientific: bool
) -> RunManifest:
    return RunManifest(
        schema_version="v5",
        request_sha256=request_fingerprint(request),
        execution_mode=request.execution_mode,
        engine=engine,
        scientific_result=scientific,
        coordinate_system="barycentric-cartesian-si",
        time_scale="TDB Julian Date epoch plus SI-second offsets",
        epoch_jd_tdb=request.epoch_jd_tdb,
        constants={"G_SI": G_SI},
        software_versions={
            "backend": package_version("otherlight-science-backend"),
            "engine": f"SciPy {package_version('scipy')} DOP853"
            if scientific
            else "analytic-circular-two-body-test-v1",
            "python": python_version(),
            "scipy": package_version("scipy"),
            "pyarrow": package_version("pyarrow"),
        },
        model_versions={
            "dynamics": "newtonian-point-mass-certified-dense-boundary-v3",
            "radial_velocity": "barycentric-positive-receding-v1",
            "photocentre": "luminosity-weighted-sky-plane-v1",
        },
        numerical_tolerances={
            "requestedPositionToleranceM": request.position_tolerance_m,
            "effectivePositionToleranceM": request.position_tolerance_m,
            "requestedVelocityToleranceMps": request.velocity_tolerance_m_s,
            "effectiveVelocityToleranceMps": request.velocity_tolerance_m_s,
            "requestedRelativeTolerance": request.integrator_rtol,
            "effectiveRelativeTolerance": request.integrator_rtol,
            "requestedMaxStepSec": request.integrator_max_step_s,
            "effectiveMaxStepSec": request.integrator_max_step_s,
        },
        datasets={},
        validity_domain=(
            "Newtonian gravitating masses with finite radii used as a contact boundary",
            "accepted numerical dense trajectories are certified outside finite-radius contact; no collision physics",
            "observer fixed at effectively infinite direction",
        ),
        warnings=(
            ("test-only analytic propagation; not a scientific result",)
            if not scientific
            else ()
        ),
    )
