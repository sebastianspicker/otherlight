"""Verify scientific artifacts are served from one no-follow verified descriptor."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from hashlib import sha256

import pytest

from science_backend.artifact_cache import (
    ARTIFACT_CACHE_ENV,
    DEFAULT_ARTIFACT_CACHE_MAX_BYTES,
    ArtifactCache,
    configured_cache_max_bytes,
    main,
)
from science_backend.artifact_store import open_verified_artifact
from science_backend.errors import (
    ArtifactCacheCapacityError,
    ArtifactCacheOwnershipError,
)


def artifact_name(content: bytes) -> tuple[str, str]:
    digest = sha256(content).hexdigest()
    return f"{digest}.arrow", digest


def test_verified_artifact_reads_regular_digest_matched_file(tmp_path) -> None:
    content = b"verified Arrow fixture"
    filename, digest = artifact_name(content)
    (tmp_path / filename).write_bytes(content)

    opened = open_verified_artifact(tmp_path, filename, digest)

    assert opened is not None
    assert opened.size == len(content)
    assert b"".join(opened.chunks(size=3)) == content


def test_verified_artifact_rejects_symlink_hardlink_directory_and_digest_mismatch(
    tmp_path,
) -> None:
    content = b"outside content"
    outside = tmp_path.parent / f"{tmp_path.name}-outside.arrow"
    outside.write_bytes(content)
    filename, digest = artifact_name(content)
    (tmp_path / filename).symlink_to(outside)
    assert open_verified_artifact(tmp_path, filename, digest) is None

    (tmp_path / filename).unlink()
    os.link(outside, tmp_path / filename)
    assert open_verified_artifact(tmp_path, filename, digest) is None

    (tmp_path / filename).unlink()
    (tmp_path / filename).mkdir()
    assert open_verified_artifact(tmp_path, filename, digest) is None

    (tmp_path / filename).rmdir()
    (tmp_path / filename).write_bytes(content)
    assert open_verified_artifact(tmp_path, filename, "0" * 64) is None
    outside.unlink()


def test_verified_artifact_rejects_oversize_and_root_symlink(tmp_path) -> None:
    content = b"12345"
    filename, digest = artifact_name(content)
    (tmp_path / filename).write_bytes(content)
    assert open_verified_artifact(tmp_path, filename, digest, max_bytes=4) is None

    alias = tmp_path.parent / f"{tmp_path.name}-alias"
    alias.symlink_to(tmp_path, target_is_directory=True)
    assert open_verified_artifact(alias, filename, digest) is None
    alias.unlink()


def test_verified_artifact_rejects_fifo_without_blocking(tmp_path) -> None:
    filename = f"{'0' * 64}.arrow"
    os.mkfifo(tmp_path / filename)

    assert open_verified_artifact(tmp_path, filename, "0" * 64) is None


def test_verified_artifact_stream_uses_opened_descriptor_after_path_replacement(
    tmp_path,
) -> None:
    original = b"original verified bytes"
    filename, digest = artifact_name(original)
    path = tmp_path / filename
    path.write_bytes(original)
    opened = open_verified_artifact(tmp_path, filename, digest)
    assert opened is not None

    replacement = tmp_path / "replacement.tmp"
    replacement.write_bytes(b"replacement")
    os.replace(replacement, path)

    assert b"".join(opened.chunks()) == original


@pytest.mark.parametrize("value", ["", "0", "-1", "+1", " 1", "1 ", "1.0"])
def test_artifact_cache_environment_requires_strict_positive_decimal(
    value: str,
) -> None:
    with pytest.raises(ValueError, match=ARTIFACT_CACHE_ENV):
        configured_cache_max_bytes(None, {ARTIFACT_CACHE_ENV: value})

    assert configured_cache_max_bytes(None, {}) == DEFAULT_ARTIFACT_CACHE_MAX_BYTES
    assert configured_cache_max_bytes(None, {ARTIFACT_CACHE_ENV: "123"}) == 123


@pytest.mark.parametrize("explicit", [True, 1.5, "1"])
def test_explicit_artifact_cache_quota_requires_an_integer(explicit) -> None:
    with pytest.raises(ValueError, match="positive integer"):
        configured_cache_max_bytes(explicit)


def test_empty_environment_mapping_does_not_fall_back_to_process_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(ARTIFACT_CACHE_ENV, "321")
    assert configured_cache_max_bytes(None, {}) == DEFAULT_ARTIFACT_CACHE_MAX_BYTES


def test_artifact_cache_counts_existing_artifacts_and_abandoned_temporaries(
    tmp_path,
) -> None:
    digest = "a" * 64
    (tmp_path / f"{digest}.arrow").write_bytes(b"artifact")
    (tmp_path / ".arrow-abandoned.tmp").write_bytes(b"temporary")
    (tmp_path / "unrelated.txt").write_bytes(b"ignored")
    cache = ArtifactCache(tmp_path, max_bytes=1024)
    try:
        assert cache.footprint_bytes() == len(b"artifacttemporary")
    finally:
        cache.close()


def test_artifact_cache_reports_active_writer_bytes_separately(tmp_path) -> None:
    temporary = tmp_path / ".arrow-active.tmp"
    temporary.write_bytes(b"active")
    abandoned = tmp_path / ".arrow-abandoned.tmp"
    abandoned.write_bytes(b"abandoned")
    cache = ArtifactCache(tmp_path, max_bytes=1024)
    try:
        with cache.active_writer(temporary):
            assert cache.usage() == {
                "retainedBytes": len(b"abandoned"),
                "activeWriterTempBytes": len(b"active"),
                "maxRetainedBytes": 1024,
                "maxBytesPerWriter": 64 * 1024 * 1024,
            }
            with pytest.raises(ValueError, match="live writer"):
                cache.remove_selected(
                    artifact_ids=[], temporary_names=[temporary.name], apply=True
                )
        assert cache.footprint_bytes() == len(b"activeabandoned")
    finally:
        cache.close()


def test_artifact_cache_rejects_growth_when_oversized_but_allows_republication(
    tmp_path,
) -> None:
    content = b"existing oversized artifact"
    digest = sha256(content).hexdigest()
    destination = tmp_path / f"{digest}.arrow"
    destination.write_bytes(content)
    cache = ArtifactCache(tmp_path, max_bytes=1)
    try:
        duplicate = tmp_path / ".arrow-duplicate.tmp"
        duplicate.write_bytes(content)
        cache.publish(digest, duplicate, destination)
        assert destination.read_bytes() == content

        new_content = b"new"
        new_digest = sha256(new_content).hexdigest()
        temporary = tmp_path / ".arrow-new.tmp"
        temporary.write_bytes(new_content)
        with pytest.raises(ArtifactCacheCapacityError, match="capacity"):
            cache.publish(new_digest, temporary, tmp_path / f"{new_digest}.arrow")
        assert temporary.read_bytes() == new_content
        opened = open_verified_artifact(tmp_path, destination.name, digest)
        assert opened is not None
        assert b"".join(opened.chunks()) == content
    finally:
        cache.close()


def test_artifact_cache_lock_excludes_writer_and_offline_cleanup(tmp_path) -> None:
    cache = ArtifactCache(tmp_path, max_bytes=1024)
    try:
        with pytest.raises(ArtifactCacheOwnershipError, match="another writer"):
            ArtifactCache(tmp_path, max_bytes=1024)
        completed = subprocess.run(
            [
                sys.executable,
                "-m",
                "science_backend.artifact_cache",
                str(tmp_path),
                "--artifact",
                "a" * 64,
            ],
            check=False,
            capture_output=True,
            text=True,
        )
        assert completed.returncode != 0
        assert "another writer" in completed.stderr
    finally:
        cache.close()


def test_offline_cleanup_is_dry_run_then_requires_apply(tmp_path, capsys) -> None:
    digest = "b" * 64
    artifact = tmp_path / f"{digest}.arrow"
    temporary = tmp_path / ".arrow-abandoned.tmp"
    artifact.write_bytes(b"artifact")
    temporary.write_bytes(b"temp")

    assert (
        main([str(tmp_path), "--artifact", digest, "--temporary", temporary.name]) == 0
    )
    dry_run = capsys.readouterr().out
    assert "would-remove" in dry_run
    assert artifact.exists() and temporary.exists()

    assert (
        main(
            [
                str(tmp_path),
                "--artifact",
                digest,
                "--temporary",
                temporary.name,
                "--apply",
            ]
        )
        == 0
    )
    assert not artifact.exists() and not temporary.exists()


def test_offline_cleanup_without_selection_reports_usage(
    tmp_path, capsys, monkeypatch
) -> None:
    monkeypatch.setenv("OTHERLIGHT_ARTIFACT_CACHE_MAX_BYTES", "512")
    (tmp_path / ".arrow-abandoned.tmp").write_bytes(b"bytes")

    assert main([str(tmp_path)]) == 0
    report = json.loads(capsys.readouterr().out)

    assert report["entries"] == []
    assert report["usage"]["maxRetainedBytes"] == 512
    assert report["usage"]["retainedBytes"] == 5
    assert report["usage"]["activeWriterTempBytes"] == 0


def test_offline_cleanup_rejects_outside_symlink_and_special_entries(tmp_path) -> None:
    outside = tmp_path.parent / f"{tmp_path.name}-outside"
    outside.write_bytes(b"outside")
    symlink = tmp_path / ".arrow-link.tmp"
    symlink.symlink_to(outside)
    cache = ArtifactCache(tmp_path, max_bytes=1024)
    try:
        with pytest.raises(ValueError, match="private regular"):
            cache.remove_selected(
                artifact_ids=[], temporary_names=[symlink.name], apply=True
            )
        with pytest.raises(ValueError, match="exact"):
            cache.remove_selected(
                artifact_ids=[], temporary_names=["../outside"], apply=True
            )
        fifo = tmp_path / ".arrow-special.tmp"
        os.mkfifo(fifo)
        with pytest.raises(ValueError, match="private regular"):
            cache.remove_selected(
                artifact_ids=[], temporary_names=[fifo.name], apply=True
            )
    finally:
        cache.close()
        outside.unlink()


def test_offline_cleanup_validates_whole_batch_before_removal(tmp_path) -> None:
    digest = "d" * 64
    artifact = tmp_path / f"{digest}.arrow"
    artifact.write_bytes(b"keep after validation failure")
    outside = tmp_path.parent / f"{tmp_path.name}-batch-outside"
    outside.write_bytes(b"outside")
    symlink = tmp_path / ".arrow-invalid.tmp"
    symlink.symlink_to(outside)
    cache = ArtifactCache(tmp_path, max_bytes=1024)
    try:
        with pytest.raises(ValueError, match="private regular"):
            cache.remove_selected(
                artifact_ids=[digest], temporary_names=[symlink.name], apply=True
            )
        assert artifact.exists()
    finally:
        cache.close()
        outside.unlink()


def test_artifact_cache_rejects_symlink_ancestor(tmp_path) -> None:
    real_parent = tmp_path / "real"
    real_parent.mkdir()
    alias = tmp_path / "alias"
    alias.symlink_to(real_parent, target_is_directory=True)

    with pytest.raises(ArtifactCacheOwnershipError, match="non-symlink"):
        ArtifactCache(alias / "cache", max_bytes=1024)


def test_artifact_cache_startup_failure_releases_open_descriptors(tmp_path) -> None:
    lock_path = tmp_path / ".otherlight-artifact-cache.lock"
    lock_path.mkdir()
    with pytest.raises(OSError):
        ArtifactCache(tmp_path, max_bytes=1024)
    lock_path.rmdir()

    cache = ArtifactCache(tmp_path, max_bytes=1024)
    cache.close()
