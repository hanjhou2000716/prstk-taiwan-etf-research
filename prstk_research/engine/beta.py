from __future__ import annotations

import math
from statistics import mean


def _daily_returns(rows: list[dict]) -> dict[str, float]:
    return {
        rows[index]["date"]: float(rows[index]["nav"]) / float(rows[index - 1]["nav"]) - 1
        for index in range(1, len(rows))
        if float(rows[index - 1]["nav"]) > 0 and float(rows[index]["nav"]) > 0
    }


def calculate_beta_metrics(rows: list[dict], benchmark_rows: list[dict], *, risk_free_rate: float = 0.0,
                           trading_days_per_year: int = 252) -> dict:
    asset = _daily_returns(rows)
    benchmark = _daily_returns(benchmark_rows)
    dates = sorted(set(asset) & set(benchmark))
    if len(dates) < 3:
        return {"status": "unavailable", "reason": "insufficient_common_returns", "observations": len(dates)}
    asset_returns = [asset[date] for date in dates]
    benchmark_returns = [benchmark[date] for date in dates]
    asset_mean, benchmark_mean = mean(asset_returns), mean(benchmark_returns)
    covariance = sum((a - asset_mean) * (b - benchmark_mean) for a, b in zip(asset_returns, benchmark_returns)) / (len(dates) - 1)
    benchmark_variance = sum((b - benchmark_mean) ** 2 for b in benchmark_returns) / (len(dates) - 1)
    asset_variance = sum((a - asset_mean) ** 2 for a in asset_returns) / (len(dates) - 1)
    beta = covariance / benchmark_variance if benchmark_variance else None
    correlation = covariance / math.sqrt(asset_variance * benchmark_variance) if asset_variance and benchmark_variance else None
    daily_rf = risk_free_rate / trading_days_per_year
    alpha_daily = asset_mean - daily_rf - (beta or 0) * (benchmark_mean - daily_rf)
    tracking = [a - b for a, b in zip(asset_returns, benchmark_returns)]
    tracking_error = math.sqrt(sum((value - mean(tracking)) ** 2 for value in tracking) / max(1, len(tracking) - 1)) * math.sqrt(trading_days_per_year)
    up = [i for i, value in enumerate(benchmark_returns) if value > 0]
    down = [i for i, value in enumerate(benchmark_returns) if value < 0]
    up_capture = mean([asset_returns[i] for i in up]) / mean([benchmark_returns[i] for i in up]) if up and mean([benchmark_returns[i] for i in up]) else None
    down_capture = mean([asset_returns[i] for i in down]) / mean([benchmark_returns[i] for i in down]) if down and mean([benchmark_returns[i] for i in down]) else None
    return {
        "status": "available", "start": dates[0], "end": dates[-1], "observations": len(dates),
        "beta": beta, "alpha": alpha_daily * trading_days_per_year,
        "r_squared": correlation ** 2 if correlation is not None else None,
        "correlation": correlation, "tracking_error": tracking_error,
        "information_ratio": (mean(tracking) * trading_days_per_year / tracking_error) if tracking_error else None,
        "treynor": ((asset_mean * trading_days_per_year - risk_free_rate) / beta) if beta else None,
        "up_capture": up_capture, "down_capture": down_capture,
        "risk_free_rate": risk_free_rate,
    }
