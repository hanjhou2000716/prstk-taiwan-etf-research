"""Build a preview artifact only if every production file matches the live release."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import re
import shutil
import time
from urllib.parse import quote
from urllib.request import urlopen

PUBLIC_BASE = "https://hanjhou2000716.github.io/prstk-taiwan-etf-research/"
PRODUCTION_FILES = (
    "index.html", "composer.html", "research-lab.html", "beta-lab.html",
    "leverage-lab.html", "financing-lab.html", "risk-lab.html", "strategies.html",
    "compare.html", "stress-test.html", "sensitivity.html", "methodology.html",
    "proposal.html", "audit.html", "dashboard.html", "horizons.html", "builder.html",
    "styles.css", "report.html",
)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read_public(relative):
    for attempt in range(3):
        try:
            with urlopen(PUBLIC_BASE + quote(relative, safe="/"), timeout=45) as response:
                return response.read()
        except Exception:
            if attempt == 2:
                raise
            time.sleep(1)


def file_hashes(root):
    return {p.relative_to(root).as_posix(): digest(p.read_bytes())
            for p in root.rglob("*") if p.is_file()}


def verify_public_tree(root, fetch=read_public):
    expected = file_hashes(root)
    verify_public_hashes(expected, fetch)
    return expected


def verify_public_hashes(expected, fetch=read_public):

    def check(item):
        name, checksum = item
        try:
            return name if digest(fetch(name)) != checksum else None
        except Exception as error:
            return f"{name}: {type(error).__name__}"

    with ThreadPoolExecutor(max_workers=8) as pool:
        failures = [failure for failure in pool.map(check, expected.items()) if failure]
    if failures:
        raise ValueError("Production reconstruction differs from the live site: " + "; ".join(failures[:12]))


def assemble_production(site, build, output, metadata, fetch=read_public):
    if output.exists():
        raise ValueError("Refusing to reuse a previous release directory")
    identity = json.loads(metadata)
    if not re.fullmatch(r"[0-9a-f]{40}", identity.get("commit_sha", "")):
        raise ValueError("Production release must identify an immutable commit")
    output.mkdir(parents=True)
    for name in PRODUCTION_FILES:
        shutil.copy2(site / name, output / name)
    for name in ("styles", "js", "data", "lpos-portfolio-lab"):
        shutil.copytree(site / name, output / name)
    (output / "assets").mkdir()
    for path in (site / "assets").glob("*.png"):
        shutil.copy2(path, output / "assets" / path.name)
    shutil.copytree(build, output / "lpos-portfolio-lab", dirs_exist_ok=True)
    (output / "data/deployment.json").write_bytes(metadata)
    hashes = verify_public_tree(output, fetch)
    return identity, hashes


def add_preview(output, build, data, candidate_sha, production_identity, production_hashes):
    if not re.fullmatch(r"[0-9a-f]{40}", candidate_sha):
        raise ValueError("Candidate must be pinned to a full commit SHA")
    preview = output / "lpos-portfolio-lab/preview/v071"
    if preview.exists():
        raise ValueError("Refusing to overwrite an existing preview")
    shutil.copytree(build, preview)
    shutil.copytree(data, preview / "data")
    identity = {
        "app_version": "0.7.1", "candidate_commit": candidate_sha,
        "production_site_commit": production_identity["commit_sha"],
        "production_metadata_sha256": digest((output / "data/deployment.json").read_bytes()),
    }
    (preview / "version.json").write_text(json.dumps(identity, indent=2), encoding="utf-8")
    for name, checksum in production_hashes.items():
        if digest((output / name).read_bytes()) != checksum:
            raise ValueError(f"Preview changed a production file: {name}")
    return identity


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("production-site", "production-build", "candidate-build", "candidate-data", "metadata", "output", "evidence"):
        parser.add_argument("--" + name, type=Path, required=True)
    parser.add_argument("--candidate-sha", required=True)
    args = parser.parse_args()
    identity, hashes = assemble_production(args.production_site, args.production_build, args.output, args.metadata.read_bytes())
    preview = add_preview(args.output, args.candidate_build, args.candidate_data, args.candidate_sha, identity, hashes)
    args.evidence.parent.mkdir(parents=True, exist_ok=True)
    args.evidence.write_text(json.dumps({"identity": preview, "production_files": hashes}, indent=2), encoding="utf-8")
    print(f"Verified {len(hashes)} unchanged production files; added isolated V0.7.1 preview")


if __name__ == "__main__":
    main()
