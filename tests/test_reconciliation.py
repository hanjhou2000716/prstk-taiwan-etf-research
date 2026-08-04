import json

from prstk_research.reconciliation import build_reconciliation


def test_reconciliation_uses_site_snapshot_when_artifacts_are_missing(tmp_path):
    backtests = tmp_path / "site" / "data" / "backtests"
    backtests.mkdir(parents=True)
    (backtests / "demo.csv").write_text("date,nav\n2024-01-02,1.0\n2024-01-03,1.1\n", encoding="utf-8")
    metrics = tmp_path / "site" / "data" / "baseline_metrics.json"
    metrics.write_text(json.dumps([]), encoding="utf-8")

    report = build_reconciliation(tmp_path)

    assert report["status"] == "passed"
    assert report["data_source"] == "site_snapshot"
    assert report["summary"]["files_checked"] == 1
    assert report["publish_blocked"] is False
