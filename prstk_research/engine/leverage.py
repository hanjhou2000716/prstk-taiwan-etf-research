from __future__ import annotations


def theoretical_daily_reset(underlying_rows: list[dict], leverage: float = 2.0) -> list[dict]:
    if not underlying_rows:
        return []
    nav = 1.0
    result = [{"date": underlying_rows[0]["date"], "nav": nav}]
    for previous, current in zip(underlying_rows, underlying_rows[1:]):
        nav *= 1 + leverage * (float(current["nav"]) / float(previous["nav"]) - 1)
        result.append({"date": current["date"], "nav": nav})
    return result


def leverage_gap(underlying_rows: list[dict], actual_rows: list[dict], leverage: float = 2.0) -> dict:
    actual_by_date = {row["date"]: row for row in actual_rows}
    common = [row for row in underlying_rows if row["date"] in actual_by_date]
    theoretical = theoretical_daily_reset(common, leverage)
    if len(common) < 2:
        return {"status": "unavailable", "observations": len(common)}
    actual_start = float(actual_by_date[common[0]["date"]]["nav"])
    actual_return = float(actual_by_date[common[-1]["date"]]["nav"]) / actual_start - 1
    theoretical_return = theoretical[-1]["nav"] - 1
    return {
        "status": "available", "start": common[0]["date"], "end": common[-1]["date"],
        "observations": len(common), "actual_return": actual_return,
        "theoretical_return": theoretical_return,
        "leverage_gap": actual_return - theoretical_return,
        "capture_ratio": actual_return / theoretical_return if theoretical_return else None,
    }
