"""Validate deterministic inputs used to publish the GitHub Pages site."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
VERSION_RE = re.compile(r"\?v=([A-Za-z0-9._-]+)")
REQUIRED_PAGES = (
    "index.html", "composer.html", "research-lab.html", "beta-lab.html",
    "leverage-lab.html", "financing-lab.html", "risk-lab.html", "strategies.html",
    "compare.html", "stress-test.html", "sensitivity.html", "report.html",
    "methodology.html", "audit.html",
)


def main() -> int:
    errors: list[str] = []
    for page in REQUIRED_PAGES:
        path = SITE / page
        if not path.is_file():
            errors.append(f"missing published page: {page}")
            continue
        text = path.read_text(encoding="utf-8")
        if '<header class="site-header" data-site-header></header>' not in text:
            errors.append(f"page does not use shared header mount: {page}")
        if "js/core/site-header.js" not in text:
            errors.append(f"page does not load shared header module: {page}")
        if "</html>" in text and text.split("</html>", 1)[1].strip():
            errors.append(f"trailing content after </html>: {page}")

    version_count = 0
    for path in SITE.rglob("*"):
        if path.suffix not in {".html", ".js", ".css"}:
            continue
        version_count += len(VERSION_RE.findall(path.read_text(encoding="utf-8")))
    if version_count == 0:
        errors.append("no cache-busting asset versions found")

    workflow_text = (ROOT / ".github/workflows/deploy-pages.yml").read_text(encoding="utf-8")
    for required in ("deployment.json", "upload-pages-artifact", "actions/deploy-pages"):
        if required not in workflow_text:
            errors.append(f"Pages workflow missing release contract: {required}")

    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    print(f"publish contract passed: {len(REQUIRED_PAGES)} pages; {version_count} versioned asset references")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
