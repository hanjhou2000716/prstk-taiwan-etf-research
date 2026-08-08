from __future__ import annotations
import csv, math
from pathlib import Path
from .engine.metrics import calculate_metrics as canonical_metrics

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

def synthetic_2x_proxy(dates, underlying, name, annual_drag=0.0, leverage=2.0):
    """Build a transparent daily-reset leveraged proxy for pre-listing history."""
    if not dates:
        return []
    nav, out = 1.0, [{"date": dates[0], "strategy": name, "nav": 1.0,
                      "data_type": "synthetic_2x_proxy"}]
    daily_drag = annual_drag / 252.0
    for i in range(1, len(dates)):
        underlying_return = underlying[i] / underlying[i - 1] - 1
        nav *= max(0.000001, 1 + leverage * underlying_return - daily_drag)
        out.append({"date": dates[i], "strategy": name, "nav": nav,
                    "data_type": "synthetic_2x_proxy"})
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

def apply_path_costs(rows, annual_management_fee=0.0, annual_tracking_difference=0.0,
                     trading_cost_bps=0.0, turnover=0.0, trading_days=252):
    """Apply disclosed daily path costs while preserving gross NAV.

    This is deliberately separate from the strategy signal engine.  A future
    event engine can provide measured turnover per trade; until then the
    configured turnover is an explicit assumption rather than an invented
    transaction history.
    """
    if not rows:
        return rows
    daily_drag = (annual_management_fee + annual_tracking_difference) / trading_days
    daily_drag += (trading_cost_bps / 10000.0) * turnover / trading_days
    gross_prev = float(rows[0].get("nav", 1.0) or 1.0)
    net_prev = gross_prev
    for row in rows:
        gross = float(row.get("nav", 0.0) or 0.0)
        if row is rows[0]:
            net = gross
        else:
            gross_return = gross / gross_prev if gross_prev > 0 else 0.0
            net = max(0.0, net_prev * gross_return * max(0.0, 1.0 - daily_drag))
        row["nav_gross"] = gross
        row["nav_net"] = net
        row["nav"] = net
        row["transaction_cost"] = max(0.0, gross - net) if row is rows[0] else max(0.0, net_prev * (gross / gross_prev if gross_prev > 0 else 0.0) - net)
        row["cost_drag"] = max(0.0, gross - net)
        gross_prev, net_prev = gross, net
    return rows

def pledge_strategy(dates, collateral_prices, target_prices, name, annual_rate=0.033,
                    max_ltv=0.60, margin_call=1.30, rollover=1.66,
                    target_debt_ratio=0.30, dynamic=True, borrow_floor=None,
                    collateral_eligibility=1.0, forced_liquidation_ratio=1.10,
                    liquidation_haircut=0.05, target_collateral_eligibility=0.0):
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
    accrued_interest = 0.0
    events = {"margin_calls": 0, "borrow_events": 0, "repay_events": 0,
              "liquidation_events": 0, "ledger": []}

    def ledger_event(event_date, event_type, amount=0.0, reason=""):
        events["ledger"].append({"date": event_date, "action": event_type,
                                  "amount": max(0.0, float(amount)), "reason": reason})

    def values(i):
        return collateral_units * collateral_prices[i], target_units * target_prices[i]

    # Initial purchase and initial borrowing. Strategy 6 borrows once; 7-9
    # start at their target debt ratio and then rebalance dynamically.
    collateral_value, _ = values(0)
    initial_ratio = 0.60 if not dynamic else target_debt_ratio
    debt = collateral_value * min(initial_ratio, max_ltv)
    target_units = debt / target_prices[0]
    events["borrow_events"] += 1
    ledger_event(dates[0], "BORROW", debt, "initial collateral advance")
    ledger_event(dates[0], "BUY", debt, "initial target purchase")
    out = []
    for i, d in enumerate(dates):
        if i > 0:
            interest = debt * annual_rate / 252
            debt += interest
            accrued_interest += interest
            ledger_event(d, "INTEREST", interest, "daily accrual")
        collateral_value, target_value = values(i)
        eligible_collateral_value = collateral_value * collateral_eligibility
        eligible_target_value = target_value * target_collateral_eligibility
        eligible_total_value = eligible_collateral_value + eligible_target_value
        non_eligible_asset_value = target_value - eligible_target_value
        maintenance = eligible_total_value / debt if debt > 0 else float("inf")
        required_repayment = 0.0
        required_additional_collateral = max(0.0, debt * margin_call - eligible_total_value)
        liquidation_proceeds = 0.0
        liquidation_event = ""
        # Margin enforcement is independent from the borrowing policy. A
        # one-time pledge can still trigger a call or liquidation later.
        if maintenance < margin_call:
            events["margin_calls"] += 1
            # Sell target assets first and use proceeds to repay debt. If the
            # target is eligible collateral, its value leaves both numerator
            # and denominator, so the repair equation is different.
            repair_target = max(rollover, margin_call)
            if target_collateral_eligibility > 0 and repair_target > 1:
                needed = max(0.0, (repair_target * debt - eligible_total_value) / (repair_target - 1))
            else:
                needed = max(0.0, debt - eligible_total_value / repair_target)
            required_repayment = needed
            sale = min(target_value, needed)
            if sale > 0:
                target_units -= sale / target_prices[i]
                debt = max(0.0, debt - sale)
                events["repay_events"] += 1
                ledger_event(d, "REPAY", sale, "maintenance repair")
                collateral_value, target_value = values(i)
                maintenance = collateral_value / debt if debt > 0 else float("inf")
                eligible_collateral_value = collateral_value * collateral_eligibility
                eligible_target_value = target_value * target_collateral_eligibility
                eligible_total_value = eligible_collateral_value + eligible_target_value
                maintenance = eligible_total_value / debt if debt > 0 else float("inf")
                required_additional_collateral = max(0.0, debt * margin_call - eligible_total_value)
        if debt > 0 and maintenance < forced_liquidation_ratio:
            liquidation_event = "forced_liquidation_threshold"
            liquidation_proceeds = max(0.0, target_value * (1.0 - liquidation_haircut))
            debt = max(0.0, debt - liquidation_proceeds)
            target_units = 0.0
            events["liquidation_events"] += 1
            ledger_event(d, "LIQUIDATION", liquidation_proceeds, "forced liquidation threshold")
        if dynamic and maintenance >= (borrow_floor or rollover):
            max_debt = collateral_value * max_ltv
            desired = min(max_debt, collateral_value * target_debt_ratio)
            extra = max(0.0, desired - debt)
            if extra > 0:
                debt += extra
                target_units += extra / target_prices[i]
                events["borrow_events"] += 1
                ledger_event(d, "BORROW", extra, "dynamic target debt rebalance")
        collateral_value, target_value = values(i)
        eligible_collateral_value = collateral_value * collateral_eligibility
        eligible_target_value = target_value * target_collateral_eligibility
        eligible_total_value = eligible_collateral_value + eligible_target_value
        maintenance = eligible_total_value / debt if debt > 0 else float("inf")
        equity = collateral_value + target_value + cash - debt
        out.append({"date": d, "strategy": name, "nav": equity / capital,
                    "nav_gross": equity / capital, "nav_net": equity / capital,
                    "cash": cash, "interest": accrued_interest,
                    "maintenance": maintenance,
                    "debt": debt, "collateral_value": collateral_value,
                    "eligible_collateral_value": eligible_collateral_value,
                    "eligible_target_value": eligible_target_value,
                    "eligible_total_value": eligible_total_value,
                    "non_eligible_asset_value": non_eligible_asset_value,
                    "target_value": target_value,
                    "required_repayment": required_repayment,
                    "required_additional_collateral": required_additional_collateral,
                    "liquidation_proceeds": liquidation_proceeds,
                    "net_equity": equity,
                    "liquidation_event": liquidation_event,
                    "margin_call": maintenance < margin_call})
    return out, events

def metrics(rows, risk_free=0.0):
    if not rows:
        return {}
    nav = [float(r["nav"]) for r in rows]
    rets = [nav[i] / nav[i - 1] - 1 for i in range(1, len(nav))]
    years = max(len(rets) / 252, 1 / 252)
    growth = nav[-1] / nav[0] if nav[0] else 0
    total = growth - 1
    annual = growth ** (1 / years) - 1 if growth > 0 else -1
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

def horizon_metrics(rows, horizons=(20, 10, 5, 3, 1), risk_free=0.0,
                    data_type=None, proxy_basis=None):
    """Return availability and metrics by trading-year window."""
    data_type = data_type or (rows[0].get("data_type", "actual_etf") if rows else "actual_etf")
    output = []
    for years in horizons:
        observations = years * 252
        if len(rows) <= observations:
            output.append({"horizon_years": years, "status": "unavailable", "data_type": data_type,
                           **({"proxy_basis": proxy_basis} if proxy_basis else {}),
                           "reason": "listing history shorter than requested window"})
        else:
            window = rows[-(observations + 1):]
            output.append({"horizon_years": years, "status": "available", "data_type": data_type,
                           **({"proxy_basis": proxy_basis} if proxy_basis else {}),
                           **canonical_metrics(window, risk_free_rate=risk_free)})
    return output

def write_rows(path: Path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = ["date", "strategy", "nav", "nav_gross", "nav_net", "cash", "debt",
              "interest", "collateral_value", "maintenance", "gross_exposure",
              "net_exposure", "turnover", "transaction_cost", "signal", "position",
              "margin_call", "liquidation_event", "eligible_collateral_value",
              "eligible_target_value", "eligible_total_value", "non_eligible_asset_value",
              "target_value", "required_repayment",
              "required_additional_collateral", "liquidation_proceeds", "net_equity",
              "cost_drag"]
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        w.writerows({k: row.get(k) for k in fields} for row in rows)
