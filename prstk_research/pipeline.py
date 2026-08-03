from __future__ import annotations
import argparse, json
from datetime import date
from pathlib import Path
from .data import (download_month, download_vix, normalize, normalize_vix,
                   validate_csv, build_manifest, months)
from .backtest import (read_prices, read_vix, align, series, fixed_beta,
                       ma200_switch, vix_switch, pledge_strategy, metrics, horizon_metrics,
                       write_rows)
from .models import FinancingTerms, maintenance_ratio, max_loan, interest_due

ROOT = Path(__file__).resolve().parents[1]

def load_json(p):
    return json.loads(p.read_text(encoding="utf-8"))

def run(download=False):
    cfg = load_json(ROOT / "config/research.json")
    start = date.fromisoformat(cfg["start_date"])
    end = date.fromisoformat(cfg["end_date"]) if cfg["end_date"] else date.today()
    raw, processed = ROOT / "data/raw/twse", ROOT / "data/processed"
    validation = ROOT / "artifacts/validation"
    back, metrics_dir = ROOT / "artifacts/backtests", ROOT / "artifacts/metrics"
    all_files = []
    actions_config = load_json(ROOT / "config/corporate_actions.json")
    for symbol in ("006208", "00685L", "00631L"):
        if download:
            all_files.extend(download_month(symbol, y, m, raw, cfg["download_pause_seconds"])
                             for y, m in months(start, end))
        else:
            all_files = list(raw.glob("*.json"))
        sym_files = [p for p in all_files if p.name.startswith(symbol + "_")]
        if not sym_files:
            raise RuntimeError(f"No raw data for {symbol}. Run with --download.")
        normalize(symbol, sym_files, processed / f"{symbol}.csv", actions_config.get(symbol, []))
        report = validate_csv(processed / f"{symbol}.csv")
        validation.mkdir(parents=True, exist_ok=True)
        (validation / f"{symbol}.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        if not report["valid"]:
            raise RuntimeError(f"Validation failed for {symbol}: {report}")

    vix_raw, vix_processed = ROOT / "data/raw/vix/VIX_History.csv", ROOT / "data/processed/vix.csv"
    if download:
        download_vix(vix_raw)
    elif not vix_raw.exists():
        raise RuntimeError("No Cboe VIX data. Run with --download.")
    normalize_vix(vix_raw, vix_processed)
    build_manifest(list(raw.glob("*.json")) + [vix_raw, *processed.glob("*.csv")], ROOT, ROOT / "artifacts/manifests/manifest.json")

    p208, p685 = read_prices(processed / "006208.csv"), read_prices(processed / "00685L.csv")
    p631, vix = read_prices(processed / "00631L.csv"), read_vix(vix_processed)
    dates, a, b = align(p208, p685)
    vix_values = []
    known = sorted(vix)
    for d in dates:
        previous = [x for x in known if x <= d]
        vix_values.append(vix[previous[-1]] if previous else 25.0)
    terms = load_json(ROOT / "config/financing.json")
    rate, max_ltv = terms["annual_interest_rate"], terms["max_loan_to_collateral"]
    thresholds = terms["maintenance_ratio"]
    dates631 = sorted(set(p631) & set(p208))
    results, events = {}, {}
    results["buy_hold_006208"] = series(dates, a, "buy_hold_006208")
    results["buy_hold_00685L"] = series(dates, b, "buy_hold_00685L")
    results["buy_hold_00631L"] = series(dates631, [p631[d] for d in dates631], "buy_hold_00631L")
    results["fixed_beta_50_cash_50_00685L"] = fixed_beta(dates, b)
    results["ma200_switch_00685L"] = ma200_switch(dates, b)
    results["vix_switch_00685L"] = vix_switch(dates, b, dict(zip(dates, vix_values)), cfg["vix_exit_threshold"])

    rows, ev = pledge_strategy(dates, a, a, "pledge_006208_once", rate, max_ltv,
                                thresholds["margin_call"], thresholds["rollover"], 0.30, False)
    results["pledge_006208_once"], events["pledge_006208_once"] = rows, ev
    rows, ev = pledge_strategy(dates, a, a, "pledge_006208_dynamic", rate, max_ltv,
                                thresholds["margin_call"], thresholds["rollover"], 0.30, True)
    results["pledge_006208_dynamic"], events["pledge_006208_dynamic"] = rows, ev
    rows, ev = pledge_strategy(dates, b, a, "pledge_00685L_buy_006208", rate, max_ltv,
                                3.00, thresholds["rollover"], 0.20, True)
    results["pledge_00685L_buy_006208"], events["pledge_00685L_buy_006208"] = rows, ev
    rows, ev = pledge_strategy(dates, b, b, "pledge_00685L_buy_00685L", rate, max_ltv,
                                4.00, thresholds["rollover"], 0.20, True)
    results["pledge_00685L_buy_00685L"], events["pledge_00685L_buy_00685L"] = rows, ev

    metric_rows, horizon_rows = [], []
    for name, rows in results.items():
        write_rows(back / f"{name}.csv", rows)
        metric_rows.append(dict(strategy=name, **metrics(rows, cfg["risk_free_rate"])))
        horizon_rows.extend(dict(strategy=name, **x) for x in horizon_metrics(rows, risk_free=cfg["risk_free_rate"]))
    metrics_dir.mkdir(parents=True, exist_ok=True)
    (metrics_dir / "baseline_metrics.json").write_text(json.dumps(metric_rows, ensure_ascii=False, indent=2), encoding="utf-8")
    (metrics_dir / "horizon_metrics.json").write_text(json.dumps(horizon_rows, ensure_ascii=False, indent=2), encoding="utf-8")
    (metrics_dir / "strategy_events.json").write_text(json.dumps(events, ensure_ascii=False, indent=2), encoding="utf-8")
    financing = {"terms": terms, "example": {"collateral_value": 1000000,
                 "max_loan": max_loan(1000000, FinancingTerms(**{k: terms[k] for k in ["annual_interest_rate", "max_loan_to_collateral", "interest_period_months"]})),
                 "six_month_interest": interest_due(600000, FinancingTerms(**{k: terms[k] for k in ["annual_interest_rate", "max_loan_to_collateral", "interest_period_months"]})),
                 "maintenance_at_max_loan": maintenance_ratio(1000000, 600000)}}
    (metrics_dir / "financing_model.json").write_text(json.dumps(financing, ensure_ascii=False, indent=2), encoding="utf-8")
    write_report(metric_rows, end.isoformat())
    print(json.dumps({"status": "ok", "strategies": len(results), "rows": len(dates), "reports": "artifacts/reports/research_report.html"}, ensure_ascii=False))

def write_report(rows, report_date):
    body = "".join(f"<tr><td>{r['strategy']}</td><td>{r.get('total_return')}</td><td>{r.get('annualized_return')}</td><td>{r.get('sharpe')}</td><td>{r.get('max_drawdown')}</td></tr>" for r in rows)
    html = f"<!doctype html><meta charset='utf-8'><title>PRStK Research Report</title><h1>台灣 ETF 九策略研究報告</h1><p>資料截止日：{report_date}。以下為實際執行產物。</p><table border='1'><tr><th>策略</th><th>總報酬</th><th>年化</th><th>Sharpe</th><th>最大回撤</th></tr>{body}</table><p>策略 8、9 假設 00685L 可作擔保品，需另行向券商確認。</p>"
    p = ROOT / "artifacts/reports/research_report.html"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(html, encoding="utf-8")

def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="command", required=True)
    r = sub.add_parser("run")
    r.add_argument("--download", action="store_true")
    args = ap.parse_args()
    run(args.download)

if __name__ == "__main__":
    main()
