from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"


def main() -> None:
    required_pages = [
        "index.html", "composer.html", "research-lab.html", "beta-lab.html",
        "leverage-lab.html", "financing-lab.html", "risk-lab.html",
        "compare.html", "stress-test.html", "report.html", "methodology.html", "audit.html",
    ]
    for name in required_pages:
        path = SITE / name
        assert path.exists(), f"missing page: {name}"
        text = path.read_text(encoding="utf-8")
        assert text.count("</html>") == 1, f"invalid html end: {name}"
        assert not text.split("</html>", 1)[1].strip(), f"trailing html content: {name}"
        for script in re.findall(r'<script[^>]+src="([^"]+)"', text):
            target = SITE / script
            assert target.exists(), f"missing script {script} in {name}"
    for name in ["manifest.json", "strategy-catalog.json", "asset-catalog.json", "reconciliation_report.json"]:
        json.loads((SITE / "data" / name).read_text(encoding="utf-8"))
    reconciliation = json.loads((SITE / "data" / "reconciliation_report.json").read_text(encoding="utf-8"))
    assert "validation_layers" in reconciliation
    print(f"site validation passed: {len(required_pages)} pages")


if __name__ == "__main__":
    main()
