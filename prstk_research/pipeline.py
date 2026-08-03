from __future__ import annotations
import argparse, csv, json
from datetime import date
from pathlib import Path
from .data import download_month, normalize, validate_csv, build_manifest, months
from .backtest import read_prices, align, series, fixed_beta, ma200_switch, metrics, write_rows
from .models import FinancingTerms, maintenance_ratio, max_loan, interest_due

ROOT=Path(__file__).resolve().parents[1]

def load_json(p): return json.loads(p.read_text(encoding="utf-8"))

def run(download=False):
    cfg=load_json(ROOT/"config/research.json"); start=date.fromisoformat(cfg["start_date"]); end=date.fromisoformat(cfg["end_date"]) if cfg["end_date"] else date.today()
    raw=ROOT/"data/raw/twse"; processed=ROOT/"data/processed"; validation=ROOT/"artifacts/validation"; back=ROOT/"artifacts/backtests"; metrics_dir=ROOT/"artifacts/metrics"
    files=[]
    for symbol in ("006208","00685L"):
        if download:
            for y,m in months(start,end): files.append(download_month(symbol,y,m,raw,cfg["download_pause_seconds"]))
        else: files=list(raw.glob(f"{symbol}_*.json"))
        if not files: raise RuntimeError(f"No raw data for {symbol}. Run with --download.")
        sym_files=[p for p in files if p.name.startswith(symbol+"_")]
        normalize(symbol,sym_files,processed/f"{symbol}.csv")
        report=validate_csv(processed/f"{symbol}.csv"); (validation/f"{symbol}.json").parent.mkdir(parents=True,exist_ok=True); (validation/f"{symbol}.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
        if not report["valid"]: raise RuntimeError(f"Validation failed for {symbol}: {report}")
    build_manifest(list(raw.glob("*.json"))+list(processed.glob("*.csv")),ROOT,ROOT/"artifacts/manifests/manifest.json")
    p208=read_prices(processed/"006208.csv"); p685=read_prices(processed/"00685L.csv"); dates,a,b=align(p208,p685)
    results={"buy_hold_006208":series(dates,a,"buy_hold_006208"),"buy_hold_00685L":series(dates,b,"buy_hold_00685L"),"fixed_beta_50_cash_50_00685L":fixed_beta(dates,b),"ma200_switch_00685L":ma200_switch(dates,b)}
    metric_rows=[]
    for name,rows in results.items():
        write_rows(back/f"{name}.csv",rows); metric_rows.append(dict(strategy=name,**metrics(rows,cfg["risk_free_rate"])))
    metrics_dir.mkdir(parents=True,exist_ok=True)
    with (metrics_dir/"baseline_metrics.json").open("w",encoding="utf-8") as f: json.dump(metric_rows,f,ensure_ascii=False,indent=2)
    terms=FinancingTerms(); financing={"terms":terms.__dict__,"example": {"collateral_value":1000000,"max_loan":max_loan(1000000,terms),"six_month_interest":interest_due(600000,terms),"maintenance_at_max_loan":maintenance_ratio(1000000,600000)}}
    (metrics_dir/"financing_model.json").write_text(json.dumps(financing,ensure_ascii=False,indent=2),encoding="utf-8")
    write_report(metric_rows, report_date=end.isoformat())
    print(json.dumps({"status":"ok","rows":len(dates),"reports":"artifacts/reports/research_report.html"},ensure_ascii=False))

def write_report(rows, report_date):
    body="".join(f"<tr><td>{r['strategy']}</td><td>{r.get('start')}</td><td>{r.get('end')}</td><td>{r.get('total_return')}</td><td>{r.get('annualized_return')}</td><td>{r.get('sharpe')}</td><td>{r.get('max_drawdown')}</td></tr>" for r in rows)
    html=f"""<!doctype html><meta charset='utf-8'><title>PRStK Research Report</title><h1>台灣 ETF 研究報告</h1><p>資料截止日：{report_date}。本報告僅呈現實際執行產物，未下載或未驗證的資料不會以數字代替。</p><table border='1'><tr><th>策略</th><th>開始</th><th>結束</th><th>總報酬</th><th>年化</th><th>Sharpe</th><th>最大回撤</th></tr>{body}</table><h2>限制</h2><p>TWSE 日成交資料未自動等同於含息總報酬；配息、公司行動、交易稅與滑價需要額外資料與假設。質押九策略目前已規格化，但尚未列入基準回測。</p>"""
    p=ROOT/"artifacts/reports/research_report.html"; p.parent.mkdir(parents=True,exist_ok=True); p.write_text(html,encoding="utf-8")

def main():
    ap=argparse.ArgumentParser(); sub=ap.add_subparsers(dest="command",required=True); r=sub.add_parser("run"); r.add_argument("--download",action="store_true"); args=ap.parse_args(); run(args.download)
if __name__ == "__main__": main()
