"""Public HTTP result-manifest construction."""

from __future__ import annotations

import os
import platform
from typing import Any

from .__about__ import __version__


def result_payload(
    job_id: str,
    artifact_id: str,
    physical: Any,
    fingerprint: str,
    seed: int,
    started: str,
    completed: str,
) -> dict[str, Any]:
    manifest = physical.manifest
    return {
        "kind": "forward",
        "arrowArtifactId": artifact_id,
        "runManifest": {
            "schemaVersion": "science-run-manifest-v2",
            "runId": job_id,
            "inputHashSha256": fingerprint,
            "scientificResult": True,
            "implementation": {
                "application": {
                    "name": "otherlight-science-backend",
                    "version": __version__,
                    "build": os.environ.get("OTHERLIGHT_BUILD", __version__),
                },
                "engine": {
                    "kind": "python-scipy",
                    "name": "DOP853",
                    "version": manifest.software_versions["scipy"],
                },
                "runtime": {
                    "name": "Python",
                    "version": manifest.software_versions["python"],
                },
                "artifactWriter": {
                    "name": "PyArrow",
                    "version": manifest.software_versions["pyarrow"],
                },
                "platform": {
                    "os": platform.system() or "unknown",
                    "architecture": platform.machine() or "unknown",
                },
            },
            "gravitationalConstantM3KgS2": manifest.constants["G_SI"],
            "epochJdTdb": manifest.epoch_jd_tdb,
            "startedAt": started,
            "completedAt": completed,
            "capabilityManifestVersion": __version__,
            "modelVersions": [
                {"id": key, "version": value}
                for key, value in manifest.model_versions.items()
            ],
            "numericalTolerances": manifest.numerical_tolerances,
            "datasets": [],
            "validityDomain": list(manifest.validity_domain),
            "warnings": list(manifest.warnings),
            "randomSeed": seed,
            "artifact": {
                "idSha256": artifact_id,
                "format": "arrow-ipc-file",
                "schemaVersion": "radial-velocity-v1",
                "rowCount": len(physical.samples),
            },
        },
    }
