from __future__ import annotations

import csv
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SITE_DATA = ROOT / "site" / "data"
ALLOWED_STATUS = {"verified", "partially_implemented", "experimental", "synthetic_only", "data_unavailable", "not_implemented"}


def load(name: str):
    return json.loads((SITE_DATA / name).read_text(encoding="utf-8"))


def main() -> None:
    catalog = load("strategy-catalog.json")
    strategies = catalog.get("strategies", [])
    ids = [item.get("strategy_id") for item in strategies]
    assert strategies and all(ids), "strategy catalog must contain strategy_id values"
    assert len(ids) == len(set(ids)), "strategy_id values must be unique"
    assert all(item.get("implementation_status") in ALLOWED_STATUS for item in strategies), "unknown implementation status"
    assert all(item.get("model_version") for item in strategies), "every strategy needs a model version"

    actual = [item for item in strategies if item.get("data_type") == "actual_etf"]
    synthetic = [item for item in strategies if item.get("data_type") == "synthetic_2x_proxy"]
    assert actual and synthetic, "catalog must keep actual and synthetic strategies distinguishable"
    assert not any(item.get("implementation_status") == "verified" for item in synthetic), "synthetic strategies cannot be verified actual ETFs"

    missing_csv = []
    for strategy_id in ids:
        path = SITE_DATA / "backtests" / f"{strategy_id}.csv"
        if not path.exists():
            missing_csv.append(strategy_id)
            continue
        with path.open(encoding="utf-8", newline="") as handle:
            rows = list(csv.DictReader(handle))
        assert rows, f"empty backtest: {strategy_id}"
        assert all(row.get("date") and row.get("nav") for row in rows), f"invalid backtest schema: {strategy_id}"
    assert not missing_csv, f"catalog strategies without backtest CSV: {missing_csv}"
    catalog_ids = set(ids)
    orphan_csv = sorted(path.stem for path in (SITE_DATA / "backtests").glob("*.csv") if path.stem not in catalog_ids)
    assert not orphan_csv, f"backtest CSVs missing from strategy catalog: {orphan_csv}"

    reconciliation = load("reconciliation_report.json")
    layers = reconciliation.get("validation_layers", {})
    required_layers = {"source_integrity", "schema_validation", "corporate_action_validation", "backtest_engine_validation", "lookahead_validation", "metric_validation", "python_js_parity", "broker_assumption_validation", "publish_readiness"}
    assert required_layers <= layers.keys(), f"missing reconciliation layers: {sorted(required_layers - layers.keys())}"
    if reconciliation.get("formal_conclusions_blocked"):
        print("research contract valid; formal conclusions remain blocked by reconciliation evidence")
    else:
        print("research contract valid; formal conclusions are not blocked")
    print(f"strategies={len(strategies)} actual={len(actual)} synthetic={len(synthetic)}")


if __name__ == "__main__":
    main()
