from __future__ import annotations

import math
from statistics import mean


def _returns(nav: list[float]) -> list[float]:
    return [nav[i] / nav[i - 1] - 1.0 for i in range(1, len(nav)) if nav[i - 1] > 0]


def _quantile(values: list[float], probability: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = (len(ordered) - 1) * probability
    lower, upper = math.floor(index), math.ceil(index)
    if lower == upper:
        return ordered[lower]
    weight = index - lower
    return ordered[lower] * (1 - weight) + ordered[upper] * weight


def drawdown_events(dates: list[str], nav: list[float]) -> list[dict]:
    events: list[dict] = []
    peak_index = 0
    trough_index = 0
    peak = nav[0] if nav else 0.0
    trough = peak
    for index, value in enumerate(nav):
        if value >= peak:
            if trough < peak:
                events.append({
                    "peak": dates[peak_index], "trough": dates[trough_index],
                    "recovery": dates[index], "drawdown": trough / peak - 1,
                    "peak_to_trough_days": trough_index - peak_index,
                    "trough_to_recovery_days": index - trough_index,
                    "underwater_days": index - peak_index,
                    "recovered": True,
                })
            peak, peak_index, trough, trough_index = value, index, value, index
        elif value < trough:
            trough, trough_index = value, index
    if nav and trough < peak:
        events.append({
            "peak": dates[peak_index], "trough": dates[trough_index],
            "recovery": None, "drawdown": trough / peak - 1,
            "peak_to_trough_days": trough_index - peak_index,
            "trough_to_recovery_days": None,
            "underwater_days": len(nav) - 1 - peak_index,
            "recovered": False,
        })
    return sorted(events, key=lambda item: item["drawdown"])


def calculate_metrics(rows: list[dict], *, benchmark_rows: list[dict] | None = None,
                      risk_free_rate: float = 0.0, trading_days_per_year: int = 252,
                      annual_cost: float = 0.0) -> dict:
    """Canonical metric definition for the Python research pipeline.

    ``risk_free_rate`` is annualized and is independent from borrowing or
    pledge rates.  Cost is applied to every daily NAV observation so risk
    metrics use the same net path as the reported return.
    """
    valid = [row for row in rows if math.isfinite(float(row["nav"])) and float(row["nav"]) > 0]
    if len(valid) < 2:
        return {"status": "unavailable", "reason": "insufficient_positive_nav"}
    dates = [row["date"] for row in valid]
    gross_nav = [float(row["nav"]) for row in valid]
    daily_cost = max(0.0, annual_cost) / trading_days_per_year
    net_nav = [gross_nav[0]]
    for index in range(1, len(gross_nav)):
        net_nav.append(net_nav[-1] * gross_nav[index] / gross_nav[index - 1] * max(0.0, 1 - daily_cost))
    returns = _returns(net_nav)
    years = (len(net_nav) - 1) / trading_days_per_year
    average = mean(returns) if returns else 0.0
    variance = sum((value - average) ** 2 for value in returns) / max(1, len(returns) - 1)
    volatility = math.sqrt(variance) * math.sqrt(trading_days_per_year)
    daily_rf = risk_free_rate / trading_days_per_year
    downside = [min(0.0, value - daily_rf) for value in returns]
    downside_deviation = math.sqrt(sum(value * value for value in downside) / max(1, len(downside))) * math.sqrt(trading_days_per_year)
    growth = net_nav[-1] / net_nav[0]
    gross_growth = gross_nav[-1] / gross_nav[0]
    cagr = growth ** (1 / max(years, 1 / trading_days_per_year)) - 1
    peak = net_nav[0]
    max_dd = 0.0
    for value in net_nav:
        peak = max(peak, value)
        max_dd = min(max_dd, value / peak - 1)
    events = drawdown_events(dates, net_nav)
    ordered = sorted(returns)
    var95 = _quantile(ordered, 0.05)
    var99 = _quantile(ordered, 0.01)
    cvar95_values = [value for value in returns if var95 is not None and value <= var95]
    cvar99_values = [value for value in returns if var99 is not None and value <= var99]
    result = {
        "status": "available", "start": dates[0], "end": dates[-1], "observations": len(net_nav),
        "years": years, "gross_total_return": gross_growth - 1, "total_return": growth - 1,
        "roi": growth - 1, "cagr": cagr, "annualized_return": cagr,
        "annualized_volatility": volatility, "downside_deviation": downside_deviation,
        "sharpe": (average * trading_days_per_year - risk_free_rate) / volatility if volatility else None,
        "sortino": (average * trading_days_per_year - risk_free_rate) / downside_deviation if downside_deviation else None,
        "calmar": cagr / abs(max_dd) if max_dd else None, "max_drawdown": max_dd,
        "best_day": max(returns), "worst_day": min(returns),
        "positive_day_ratio": sum(value > 0 for value in returns) / len(returns),
        "var95": var95, "cvar95": mean(cvar95_values) if cvar95_values else None,
        "var99": var99, "cvar99": mean(cvar99_values) if cvar99_values else None,
        "cost_drag": gross_growth - growth, "ending_wealth": growth, "drawdown_events": events,
        "max_drawdown_duration": events[0]["underwater_days"] if events else 0,
        "recovery_duration": events[0]["trough_to_recovery_days"] if events else None,
        "risk_free_rate": risk_free_rate,
    }
    return result
