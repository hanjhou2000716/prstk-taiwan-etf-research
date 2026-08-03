from __future__ import annotations
import csv, math
from pathlib import Path

def read_prices(path: Path, field: str = "adjusted_close") -> dict[str, float]:
    with path.open(encoding="utf-8") as f:
        return {r["date"]: float(r[field] or r["close"]) for r in csv.DictReader(f)}

def read_vix(path: Path) -> dict[str, float]:
    with path.open(encoding="utf-8") as f:
        return {r["date"]: float(r["vix"]) for r in csv.DictReader(f)}

def align(a: dict, b: dict):
    dates = sorted(set(a) & set(b))
    return dates, [a[d] for d in dates], [b[d] for d in dates]

def series(dates, values, name):
    out, nav, prev = [], 1.0, None
    for d, value in zip(dates, values):
        if prev is not None:
            nav *= value / prev
        out.append({"date": d, "strategy": name, "nav": nav})
        prev = value
    return out

def _returns(dates, prices, weights, name):
    if not dates:
        return []
    nav, out = 1.0, [{"date": dates[0], "strategy": name, "nav": 1.0}]
    for i in range(1, len(dates)):
        nav *= 1 + weights[i - 1] * (prices[i] / prices[i - 1] - 1)
        out.append({"date": dates[i], "strategy": name, "nav": nav})
    return out

def fixed_beta(dates, leveraged, name="fixed_beta_50_cash_50_00685L"):
    return _returns(dates, leveraged, [0.5] * len(dates), name)

def ma200_switch(dates, prices, name="ma200_switch_00685L"):
    nav, out = 1.0, []
    for i, d in enumerate(dates):
        if i > 0:
            # Yesterday's close and yesterday's completed 200-day average.
            signal = i - 1 >= 199 and prices[i - 1] > sum(prices[i - 200:i]) / 200
            if signal:
                nav *= prices[i] / prices[i - 1]
        out.append({"date": d, "strategy": name, "nav": nav})
    return out

def vix_switch(dates, prices, vix, threshold=25.0, name="vix_switch_00685L"):
    """Use prior-day Cboe VIX; high VIX means cash on the next ETF session."""
    known = sorted(vix)
    nav, out = 1.0, []
    for i, d in enumerate(dates):
        if i > 0:
            prior = [x for x in known if x <= dates[i - 1]]
            prior_vix = vix[prior[-1]] if prior else threshold
            if prior_vix < threshold:
                nav *= prices[i] / prices[i - 1]
        out.append({"date": d, "strategy": name, "nav": nav})
    return out

def pledge_strategy(dates, collateral_prices, target_prices, name, annual_rate=0.033,
                    max_ltv=0.60, margin_call=1.30, rollover=1.66,
                    target_debt_ratio=0.30, dynamic=True):
    """Daily marked-to-market collateral model.

    Borrowing is assumed to occur at the close when maintenance is above the
    rollover threshold; repayment occurs at the close when maintenance falls
    below the call threshold. Strategy 6 is one-time borrowing; 7-9 are
    dynamic. This is a transparent research model, not a broker simulator.
    """
    if not dates:
        return [], {"margin_calls": 0, "borrow_events": 0, "repay_events": 0}
    capital = 1.0
    collateral_units = capital / collateral_prices[0]
    target_units = 0.0
    debt = 0.0
    cash = 0.0
    events = {"margin_calls": 0, "borrow_events": 0, "repay_events": 0}

    def values(i):
        return collateral_units * collateral_prices[i], target_units * target_prices[i]

    # Initial purchase and initial borrowing. Strategy 6 borrows once; 7-9
    # start at their target debt ratio and then rebalance dynamically.
    collateral_value, _ = values(0)
    initial_ratio = 0.60 if not dynamic else target_debt_ratio
    debt = collateral_value * min(initial_ratio, max_ltv)
    target_units = debt / target_prices[0]
    events["borrow_events"] += 1
    out = []
    for i, d in enumerate(dates):
        if i > 0:
            debt *= 1 + annual_rate / 252
        collateral_value, target_value = values(i)
        maintenance = collateral_value / debt if debt > 0 else float("inf")
        if dynamic and maintenance < margin_call:
            events["margin_calls"] += 1
            # Sell target assets first and use proceeds to repay debt. If the
            # target is also collateral, the denominator adjusts naturally.
            repair_target = max(rollover, margin_call)
            needed = max(0.0, repair_target * debt - collateral_value)
            sale = min(target_value, needed)
            if sale > 0:
                target_units -= sale / target_prices[i]
                debt -= sale
                events["repay_events"] += 1
                collateral_value, target_value = values(i)
                maintenance = collateral_value / debt if debt > 0 else float("inf")
        if dynamic and maintenance >= rollover:
            max_debt = collateral_value * max_ltv
            desired = min(max_debt, collateral_value * target_debt_ratio)
            extra = max(0.0, desired - debt)
            if extra > 0:
                debt += extra
                target_units += extra / target_prices[i]
                events["borrow_events"] += 1
        collateral_value, target_value = values(i)
        equity = collateral_value + target_value + cash - debt
        out.append({"date": d, "strategy": name, "nav": equity / capital,
                    "maintenance": collateral_value / debt if debt > 0 else float("inf"),
                    "debt": debt, "collateral_value": collateral_value,
                    "target_value": target_value})
    return out, events

def metrics(rows, risk_free=0.0):
    if not rows:
        return {}
    nav = [float(r["nav"]) for r in rows]
    rets = [nav[i] / nav[i - 1] - 1 for i in range(1, len(nav))]
    years = max(len(rets) / 252, 1 / 252)
    total = nav[-1] - 1
    annual = nav[-1] ** (1 / years) - 1 if nav[-1] > 0 else -1
    mean = sum(rets) / len(rets) if rets else 0
    var = sum((x - mean) ** 2 for x in rets) / max(len(rets) - 1, 1)
    vol = math.sqrt(var) * math.sqrt(252)
    sharpe = (mean * 252 - risk_free) / vol if vol else None
    peak, maxdd = 0, 0
    for x in nav:
        peak = max(peak, x)
        maxdd = min(maxdd, x / peak - 1)
    return {"start": rows[0]["date"], "end": rows[-1]["date"],
            "total_return": total, "annualized_return": annual, "roi": total,
            "annualized_volatility": vol, "sharpe": sharpe,
            "max_drawdown": maxdd, "observations": len(rows)}

def horizon_metrics(rows, horizons=(20, 10, 5, 3, 1), risk_free=0.0):
    """Return actual-data availability and metrics by trading-year window."""
    output = []
    for years in horizons:
        observations = years * 252
        if len(rows) <= observations:
            output.append({"horizon_years": years, "status": "unavailable", "data_type": "actual_etf",
                           "reason": "listing history shorter than requested window"})
        else:
            window = rows[-(observations + 1):]
            output.append({"horizon_years": years, "status": "available", "data_type": "actual_etf",
                           **metrics(window, risk_free)})
    return output

def write_rows(path: Path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = ["date", "strategy", "nav"]
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows({k: row.get(k) for k in fields} for row in rows)
