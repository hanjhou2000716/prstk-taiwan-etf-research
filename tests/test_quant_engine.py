from prstk_research.engine.beta import calculate_beta_metrics
from prstk_research.engine.metrics import calculate_metrics, drawdown_events


def rows(values):
    return [{"date": f"2020-01-0{i + 1}", "nav": value} for i, value in enumerate(values)]


def test_canonical_metrics_golden_sequence():
    metrics = calculate_metrics(rows([100, 110, 99, 120]))
    assert round(metrics["total_return"], 8) == 0.2
    assert round(metrics["max_drawdown"], 8) == -0.1
    assert metrics["risk_free_rate"] == 0


def test_drawdown_duration_uses_event_indexes():
    events = drawdown_events(["a", "b", "c", "d"], [1, 2, 1, 2])
    assert events[0]["peak_to_trough_days"] == 1
    assert events[0]["trough_to_recovery_days"] == 1
    assert events[0]["underwater_days"] == 2


def test_beta_against_two_x_benchmark():
    asset = rows([100, 102, 101, 103, 104])
    benchmark = rows([100, 101, 100.5, 101.5, 102])
    result = calculate_beta_metrics(asset, benchmark)
    assert result["status"] == "available"
    assert result["beta"] > 1.0
    assert result["r_squared"] is not None
