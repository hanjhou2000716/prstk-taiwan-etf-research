from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"


def main() -> None:
    required_pages = [
        "index.html", "composer.html", "research-lab.html", "beta-lab.html",
        "leverage-lab.html", "financing-lab.html", "risk-lab.html",
        "sensitivity.html", "compare.html", "stress-test.html", "report.html", "methodology.html", "audit.html",
    ]
    for name in required_pages:
        path = SITE / name
        assert path.exists(), f"missing page: {name}"
        text = path.read_text(encoding="utf-8")
        assert text.count("</html>") == 1, f"invalid html end: {name}"
        assert not text.split("</html>", 1)[1].strip(), f"trailing html content: {name}"
        for script in re.findall(r'<script[^>]+src="([^"]+)"', text):
            target = SITE / urlsplit(script).path
            assert target.exists(), f"missing script {script} in {name}"
    navigation_path = SITE / "data" / "navigation.json"
    navigation = json.loads(navigation_path.read_text(encoding="utf-8"))
    assert navigation["brand"]["home"] == "index.html"
    navigation_items = list(navigation["primary"])
    navigation_items.extend(
        item for group in navigation["groups"] for item in group["items"]
    )
    for item in navigation_items:
        assert (SITE / item["href"]).exists(), f"navigation target missing: {item['href']}"
    for path in sorted(SITE.glob("*.html")):
        text = path.read_text(encoding="utf-8")
        assert text.count("js/core/site-header.js") == 1, (
            f"shared header missing or duplicated: {path.name}"
        )
        assert "legacy-header.js" not in text, f"legacy header still referenced: {path.name}"
    composer = (SITE / "composer.html").read_text(encoding="utf-8")
    assert re.search(r'js/pages/composer\.js\?v=[^"&]+', composer), "Composer script must use a versioned asset URL"
    for name in ["manifest.json", "strategy-catalog.json", "asset-catalog.json", "reconciliation_report.json"]:
        json.loads((SITE / "data" / name).read_text(encoding="utf-8"))
    reconciliation = json.loads((SITE / "data" / "reconciliation_report.json").read_text(encoding="utf-8"))
    assert "validation_layers" in reconciliation
    print(f"site validation passed: {len(required_pages)} pages")


if __name__ == "__main__":
    main()
