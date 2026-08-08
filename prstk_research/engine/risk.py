from __future__ import annotations

from .metrics import drawdown_events


def rolling_metric(rows: list[dict], window: int, metric):
    """Apply a metric to rolling NAV windows without using future observations."""
    output = []
    for end in range(window, len(rows) + 1):
        subset = rows[end - window:end]
        value = metric(subset)
        output.append({"date": subset[-1]["date"], "value": value})
    return output


def crisis_slice(rows: list[dict], start: str, end: str) -> list[dict]:
    return [row for row in rows if start <= row["date"] <= end]


__all__ = ["drawdown_events", "rolling_metric", "crisis_slice"]
