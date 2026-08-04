from prstk_research.backtest import pledge_strategy
from prstk_research.data import apply_split_adjustments


def test_total_return_is_blank_without_explicit_distributions():
    rows = [{"date": "2020-01-01", "close": 100.0, "volume": "10"},
            {"date": "2020-01-02", "close": 101.0, "volume": "10"}]
    apply_split_adjustments(rows, [])
    assert all(row["total_return_close"] == "" for row in rows)


def test_total_return_reinvests_explicit_distribution():
    rows = [{"date": "2020-01-01", "close": 100.0, "volume": "10"},
            {"date": "2020-01-02", "close": 90.0, "volume": "10"}]
    apply_split_adjustments(rows, [{"effective_date": "2020-01-02", "action_type": "dividend", "per_share": 10}])
    assert rows[0]["total_return_close"] == 100.0 * (1 + 10 / 90)
    assert rows[1]["cash_dividend"] == 10.0


def test_pledge_rows_are_a_nonnegative_debt_ledger():
    rows, events = pledge_strategy(
        ["2020-01-01", "2020-01-02", "2020-01-03"],
        [100.0, 80.0, 70.0], [100.0, 80.0, 70.0], "test",
        annual_rate=0.033, margin_call=1.30, rollover=1.66,
        target_debt_ratio=0.30, dynamic=True,
    )
    assert all(row["debt"] >= 0 for row in rows)
    assert all("eligible_collateral_value" in row and "required_repayment" in row for row in rows)
    assert all(row["maintenance"] >= 0 for row in rows)
