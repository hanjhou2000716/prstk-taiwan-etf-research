from __future__ import annotations
import csv, json, math
from datetime import datetime, timezone
from pathlib import Path

def _read_rows(path: Path):
    with path.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))

def build_reconciliation(root: Path) -> dict:
    backtests = root / "artifacts" / "backtests"
    data_source = "artifacts"
    if not list(backtests.glob("*.csv")):
        backtests = root / "site" / "data" / "backtests"
        data_source = "site_snapshot"
    checks, warnings, failures = [], [], []
    for path in sorted(backtests.glob("*.csv")):
        rows = _read_rows(path)
        finite = True
        non_positive = []
        dates = []
        for row in rows:
            dates.append(row.get("date"))
            try:
                nav = float(row.get("nav", "nan"))
                finite = finite and math.isfinite(nav)
                if nav <= 0:
                    non_positive.append(row.get("date"))
            except (TypeError, ValueError):
                finite = False
        first_ok = bool(rows) and abs(float(rows[0].get("nav", 0)) - 1.0) < 1e-9
        duplicate_dates = len(dates) != len(set(dates))
        item = {"file": path.name, "rows": len(rows), "start": dates[0] if dates else None,
                "end": dates[-1] if dates else None, "first_nav_is_one": first_ok,
                "finite_nav": finite, "non_positive_dates": non_positive[:20],
                "duplicate_dates": duplicate_dates}
        checks.append(item)
        if not first_ok:
            failures.append({"file": path.name, "issue": "NAV 首值不是 1.0"})
        if not finite or non_positive:
            failures.append({"file": path.name, "issue": "NAV 含有非有限或非正值"})
        if duplicate_dates:
            failures.append({"file": path.name, "issue": "日期重複"})
        for previous, current in zip(rows, rows[1:]):
            try:
                change = float(current["nav"]) / float(previous["nav"]) - 1
                if abs(change) > 0.25:
                    warnings.append({"file": path.name, "date": current.get("date"), "issue": "單日 NAV 變動超過 25%", "return": change})
            except (KeyError, ZeroDivisionError, ValueError):
                pass
    baseline = root / "artifacts" / "metrics" / "baseline_metrics.json"
    if not baseline.exists():
        baseline = root / "site" / "data" / "baseline_metrics.json"
    metrics_available = baseline.exists()
    if not metrics_available:
        failures.append({"file": str(baseline), "issue": "baseline metrics 不存在"})
    schema_status = "failed" if failures else "passed"
    corporate_report = root / "artifacts" / "validation" / "corporate_actions.json"
    if not corporate_report.exists():
        corporate_report = root / "site" / "data" / "corporate_actions.json"
    corporate_status = "not_run"
    if corporate_report.exists():
        try:
            assets = json.loads(corporate_report.read_text(encoding="utf-8")).get("assets", {})
            corporate_status = "passed" if assets and all(
                value.get("configured_actions", 0) >= value.get("split_actions", 0)
                and value.get("total_return_status") == "available"
                for value in assets.values()
            ) else "partial"
        except (OSError, json.JSONDecodeError):
            corporate_status = "failed"
    validation_layers = {
        "source_integrity": "passed" if data_source in {"artifacts", "site_snapshot"} else "not_run",
        "schema_validation": schema_status,
        "corporate_action_validation": corporate_status,
        "backtest_engine_validation": "not_run",
        "lookahead_validation": "not_run",
        "metric_validation": "not_run",
        "python_js_parity": "not_run",
        "broker_assumption_validation": "assumption_only",
        "publish_readiness": "blocked" if failures or warnings else "pending_required_layers"
    }
    report = {"generated_at": datetime.now(timezone.utc).isoformat(), "data_source": data_source, "status": "failed" if failures else ("warning" if warnings else "passed"),
              "publish_blocked": bool(failures), "formal_conclusions_blocked": validation_layers["publish_readiness"] != "passed", "validation_layers": validation_layers, "checks": checks, "warnings": warnings, "failures": failures,
              "summary": {"files_checked": len(checks), "warnings": len(warnings), "failures": len(failures), "baseline_metrics_present": metrics_available, "corporate_actions_present": corporate_report.exists()}}
    for target in (root / "artifacts" / "validation" / "reconciliation_report.json", root / "site" / "data" / "reconciliation_report.json"):
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report
