from __future__ import annotations
import csv, math
from pathlib import Path

def read_prices(path: Path) -> dict[str,float]:
    with path.open(encoding="utf-8") as f: return {r["date"]: float(r["close"]) for r in csv.DictReader(f)}

def align(a: dict, b: dict):
    dates = sorted(set(a) & set(b)); return dates, [a[d] for d in dates], [b[d] for d in dates]

def series(dates, values, name):
    out=[]; nav=1.0; prev=None
    for d, value in zip(dates, values):
        if prev is not None: nav *= value / prev
        out.append({"date": d, "strategy": name, "nav": nav})
        prev=value
    return out

def fixed_beta(dates, leveraged, name="fixed_beta_50_cash_50_00685L"):
    return series(dates, leveraged, name) if not dates else _returns(dates, leveraged, [0.5]*len(dates), name)

def _returns(dates, prices, weights, name):
    nav=1.0; out=[{"date": dates[0], "strategy": name, "nav": nav}]
    for i in range(1,len(dates)):
        nav *= 1 + weights[i-1] * (prices[i]/prices[i-1]-1)
        out.append({"date":dates[i],"strategy":name,"nav":nav})
    return out

def ma200_switch(dates, prices, name="ma200_switch_00685L"):
    nav=1.0; out=[]
    for i,d in enumerate(dates):
        if i > 0:
            signal = i-1 >= 199 and prices[i-1] > sum(prices[i-200:i]) / 200
            nav *= prices[i]/prices[i-1] if signal else 1.0
        out.append({"date":d,"strategy":name,"nav":nav})
    return out

def metrics(rows, risk_free=0.0):
    if not rows: return {}
    nav=[float(r["nav"]) for r in rows]; rets=[nav[i]/nav[i-1]-1 for i in range(1,len(nav))]
    years=max((len(rets)/252), 1/252); total=nav[-1]-1; annual=nav[-1]**(1/years)-1
    mean=sum(rets)/len(rets) if rets else 0; var=sum((x-mean)**2 for x in rets)/max(len(rets)-1,1); vol=math.sqrt(var)*math.sqrt(252)
    sharpe=(mean*252-risk_free)/vol if vol else None; peak=0; maxdd=0
    for x in nav: peak=max(peak,x); maxdd=min(maxdd,x/peak-1)
    return {"start":rows[0]["date"],"end":rows[-1]["date"],"total_return":total,"annualized_return":annual,"roi":total,"annualized_volatility":vol,"sharpe":sharpe,"max_drawdown":maxdd,"observations":len(rows)}

def write_rows(path: Path, rows):
    path.parent.mkdir(parents=True,exist_ok=True)
    with path.open("w",newline="",encoding="utf-8") as f:
        w=csv.DictWriter(f,fieldnames=["date","strategy","nav"]); w.writeheader(); w.writerows(rows)
