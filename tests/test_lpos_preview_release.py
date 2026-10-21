import json
from pathlib import Path
import pytest
from scripts.lpos_preview_release import (
    PRODUCTION_FILES, add_preview, assemble_production, digest, file_hashes,
)


def fixture_tree(tmp_path):
    site, build = tmp_path / "site", tmp_path / "production-build"
    site.mkdir()
    build.mkdir()
    for name in PRODUCTION_FILES:
        (site / name).write_text("production " + name)
    for name in ("styles", "js", "data", "lpos-portfolio-lab", "assets"):
        (site / name).mkdir()
    (site / "data/manifest.json").write_text('{"date":"old-production-data"}')
    (site / "lpos-portfolio-lab/index.html").write_text("legacy source")
    (build / "index.html").write_text("built live production app")
    metadata = json.dumps({"commit_sha": "a" * 40, "lpos_web_version": "0.7.0"}).encode()
    live = {p.relative_to(site).as_posix(): p.read_bytes() for p in site.rglob("*") if p.is_file()}
    live["lpos-portfolio-lab/index.html"] = (build / "index.html").read_bytes()
    live["data/deployment.json"] = metadata
    return site, build, metadata, live


def test_preview_preserves_built_production_and_isolates_new_data(tmp_path):
    site, build, metadata, live = fixture_tree(tmp_path)
    output = tmp_path / "release"
    identity, hashes = assemble_production(site, build, output, metadata, live.__getitem__)
    assert hashes == {name: digest(contents) for name, contents in live.items()}
    candidate, data = tmp_path / "candidate", tmp_path / "candidate-data"
    candidate.mkdir()
    data.mkdir()
    (candidate / "index.html").write_text("new candidate app")
    (data / "manifest.json").write_text('{"date":"new-preview-data"}')
    preview = add_preview(output, candidate, data, "b" * 40, identity, hashes)
    assert preview["production_site_commit"] == "a" * 40
    for name, contents in live.items():
        assert (output / name).read_bytes() == contents
    assert (output / "lpos-portfolio-lab/preview/v071/data/manifest.json").read_bytes() != live["data/manifest.json"]
    assert file_hashes(output)["lpos-portfolio-lab/index.html"] == digest(b"built live production app")
    with pytest.raises(ValueError, match="overwrite"):
        add_preview(output, candidate, data, "b" * 40, identity, hashes)


def test_public_mismatch_blocks_artifact_assembly(tmp_path):
    site, build, metadata, live = fixture_tree(tmp_path)
    live["lpos-portfolio-lab/index.html"] = b"a newer live release"
    with pytest.raises(ValueError, match="differs from the live site"):
        assemble_production(site, build, tmp_path / "release", metadata, live.__getitem__)


def test_invalid_production_identity_and_reused_output_are_rejected(tmp_path):
    site, build, metadata, live = fixture_tree(tmp_path)
    output = tmp_path / "release"
    with pytest.raises(ValueError, match="immutable"):
        assemble_production(site, build, output, b'{"commit_sha":"main"}', live.__getitem__)
    assert not output.exists()
    output.mkdir()
    with pytest.raises(ValueError, match="reuse"):
        assemble_production(site, build, output, metadata, live.__getitem__)
