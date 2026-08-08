from prstk_research.engine.leverage import leverage_gap, theoretical_daily_reset


def test_theoretical_daily_reset_is_path_dependent():
    result = theoretical_daily_reset([{"date": "a", "nav": 1}, {"date": "b", "nav": 1.1}, {"date": "c", "nav": 1}], 2)
    assert round(result[-1]["nav"], 8) == round(0.9818181818, 8)


def test_leverage_gap_uses_common_dates():
    result = leverage_gap([{"date": "a", "nav": 1}, {"date": "b", "nav": 1.1}], [{"date": "b", "nav": 1}, {"date": "c", "nav": 1.2}], 2)
    assert result["status"] == "unavailable"
