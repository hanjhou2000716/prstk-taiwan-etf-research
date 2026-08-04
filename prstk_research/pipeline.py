from __future__ import annotations
import argparse, json
from datetime import date
from pathlib import Path
from .data import (download_month, download_vix, normalize, normalize_vix,
                   validate_csv, build_manifest, months)
from .backtest import (read_prices, read_vix, align, series, fixed_beta,
                       ma200_switch, vix_switch, pledge_strategy, metrics, horizon_metrics,
                       synthetic_2x_proxy, write_rows)
from .models import FinancingTerms, maintenance_ratio, max_loan, interest_due
from .reconciliation import build_reconciliation

ROOT = Path(__file__).resolve().parents[1]

def load_json(p):
    return json.loads(p.read_text(encoding="utf-8"))

def run(download=False):
    cfg = load_json(ROOT / "config/research.json")
    instruments = load_json(ROOT / "config/instruments.json")
    start = date.fromisoformat(cfg["start_date"])
    end = date.fromisoformat(cfg["end_date"]) if cfg["end_date"] else date.today()
    raw, processed = ROOT / "data/raw/twse", ROOT / "data/processed"
    validation = ROOT / "artifacts/validation"
    back, metrics_dir = ROOT / "artifacts/backtests", ROOT / "artifacts/metrics"
    all_files = []
    actions_config = load_json(ROOT / "config/corporate_actions.json")
    for symbol in ("0050", "006208", "00685L", "00631L"):
        listing = instruments.get(symbol, {}).get("listing_date") or {"006208": "2012-06-22"}.get(symbol)
        symbol_start = max(start, date.fromisoformat(listing)) if listing else start
        if download:
            all_files.extend(download_month(symbol, y, m, raw, cfg["download_pause_seconds"])
                             for y, m in months(symbol_start, end))
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

    p050 = read_prices(processed / "0050.csv")
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
    proxy_dates = sorted(p050)
    proxy_values = [p050[d] for d in proxy_dates]
    results["synthetic_2x_proxy_00685L"] = synthetic_2x_proxy(
        proxy_dates, proxy_values, "synthetic_2x_proxy_00685L", cfg.get("synthetic_annual_drag", 0.0))
    results["synthetic_2x_proxy_00631L"] = synthetic_2x_proxy(
        proxy_dates, proxy_values, "synthetic_2x_proxy_00631L", cfg.get("synthetic_annual_drag", 0.0))
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
        is_proxy = name.startswith("synthetic_2x_proxy_")
        horizon_rows.extend(dict(strategy=name, **x) for x in horizon_metrics(
            rows, risk_free=cfg["risk_free_rate"],
            data_type="synthetic_2x_proxy" if is_proxy else "actual_etf",
            proxy_basis="0050.TWSE adjusted price, daily 2x reset" if is_proxy else None))
    metrics_dir.mkdir(parents=True, exist_ok=True)
    (metrics_dir / "baseline_metrics.json").write_text(json.dumps(metric_rows, ensure_ascii=False, indent=2), encoding="utf-8")
    (metrics_dir / "horizon_metrics.json").write_text(json.dumps(horizon_rows, ensure_ascii=False, indent=2), encoding="utf-8")
    (metrics_dir / "strategy_events.json").write_text(json.dumps(events, ensure_ascii=False, indent=2), encoding="utf-8")
    financing = {"terms": terms, "example": {"collateral_value": 1000000,
                 "max_loan": max_loan(1000000, FinancingTerms(**{k: terms[k] for k in ["annual_interest_rate", "max_loan_to_collateral", "interest_period_months"]})),
                 "six_month_interest": interest_due(600000, FinancingTerms(**{k: terms[k] for k in ["annual_interest_rate", "max_loan_to_collateral", "interest_period_months"]})),
                 "maintenance_at_max_loan": maintenance_ratio(1000000, 600000)}}
    (metrics_dir / "financing_model.json").write_text(json.dumps(financing, ensure_ascii=False, indent=2), encoding="utf-8")
    reconciliation = build_reconciliation(ROOT)
    write_broker_report(metric_rows, horizon_rows, end.isoformat())
    print(json.dumps({"status": "ok" if not reconciliation["publish_blocked"] else "warning", "strategies": len(results), "rows": len(dates), "reconciliation": reconciliation["status"], "reports": "artifacts/reports/research_report.html"}, ensure_ascii=False))

def write_report(rows, report_date):
    body = "".join(f"<tr><td>{r['strategy']}</td><td>{r.get('total_return')}</td><td>{r.get('annualized_return')}</td><td>{r.get('sharpe')}</td><td>{r.get('max_drawdown')}</td></tr>" for r in rows)
    html = f"<!doctype html><meta charset='utf-8'><title>PRStK Research Report</title><h1>台灣 ETF 九策略研究報告</h1><p>資料截止日：{report_date}。以下為實際執行產物。</p><table border='1'><tr><th>策略</th><th>總報酬</th><th>年化</th><th>Sharpe</th><th>最大回撤</th></tr>{body}</table><p>策略 8、9 假設 00685L 可作擔保品，需另行向券商確認。</p>"
    p = ROOT / "artifacts/reports/research_report.html"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(html, encoding="utf-8")

def write_broker_report(rows, horizons, report_date):
    def pct(value, available=True):
        return f"{value:.2%}" if available else "—"
    body = "".join(f"<tr><td>{r['strategy']}</td><td>{r.get('total_return', 0):.2%}</td><td>{r.get('annualized_return', 0):.2%}</td><td>{(r.get('sharpe') or 0):.2f}</td><td>{r.get('max_drawdown', 0):.2%}</td></tr>" for r in rows)
    hbody = "".join(f"<tr><td>{h['strategy']}</td><td>{h['horizon_years']}年</td><td>{h['data_type']}</td><td>{h.get('start', '—')}</td><td>{pct(h.get('total_return', 0), h.get('status') == 'available')}</td><td>{pct(h.get('max_drawdown', 0), h.get('status') == 'available')}</td></tr>" for h in horizons)
    html = f"""<!doctype html><meta charset='utf-8'><title>PRStK 台灣 ETF 量化研究報告</title>
<style>body{{font-family:system-ui,'Noto Sans TC',sans-serif;max-width:1180px;margin:auto;padding:32px;color:#242424;background:#f7f7f5;line-height:1.6}}h1{{font-weight:500;letter-spacing:-.04em}}h2{{margin-top:32px;font-weight:550}}table{{width:100%;border-collapse:collapse;margin:12px 0 24px;font-size:13px;background:#fff}}th,td{{padding:11px;border-bottom:1px solid #deded8;text-align:right}}th:first-child,td:first-child{{text-align:left}}th{{color:#777772;font-weight:550}}.hero{{background:#ededE8;border-left:2px solid #54544e;padding:18px}}.note{{background:#f0f0ec;padding:14px;border-left:2px solid #b8b8b0}}</style>
<h1>PRStK 台灣 ETF 槓桿與質押量化研究報告</h1><p>報告日期：{report_date}｜研究標的：006208、00685L、00631L</p>
<div class='hero'><strong>閱讀方式：</strong>實際 ETF 報酬與合成正二代理分開列示。合成代理不是歷史上存在的 ETF，不得直接視為可交易績效。</div>
<h2>一、執行摘要</h2><p>本報告由可重跑的日頻資料管線產生，涵蓋九個基準策略、交易日對齊、質押利息與維持率、風險指標，以及 20／10／5／3／1 年視窗。資料不足時顯示 unavailable，不補猜。</p>
<h2>二、策略績效總覽</h2><table><tr><th>策略</th><th>累積報酬</th><th>年化報酬</th><th>Sharpe</th><th>最大回撤</th></tr>{body}</table>
<h2>三、長期視窗與合成正二</h2><table><tr><th>策略</th><th>視窗</th><th>資料類型</th><th>起始日</th><th>累積報酬</th><th>最大回撤</th></tr>{hbody}</table>
<div class='note'><strong>合成代理定義：</strong>使用 TWSE 0050 調整後收盤價的每日報酬乘以 2，逐日重置；未宣稱包含實際 ETF 的管理費、追蹤差、申購贖回、稅費與流動性。它只用來延伸產品上市前的歷史情境。</div>
<h2>四、質押模型與風險</h2><p>模型使用年利率 3.3%、最高借款成數 60%、半年計息；維持率為擔保品市值／借款本金，130% 追繳、166% 借新還舊、167% 退擔保。這是研究用透明模型，不等同特定券商的即時風控或契約解釋。</p>
<h2>五、資料、稽核與限制</h2><ul><li>ETF 日資料：TWSE 官方成交資料；分割調整另存 adjustment_factor。</li><li>VIX：Cboe 歷史資料；策略 3 使用前一交易日訊號。</li><li>均線策略：200 日均線訊號延後一個交易日，避免 look-ahead bias。</li><li>未納入完整配息、稅、滑價與個別券商可借標的限制時，不得將結果視為投資建議。</li></ul>"""
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
