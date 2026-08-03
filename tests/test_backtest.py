from prstk_research.backtest import ma200_switch, fixed_beta, metrics, vix_switch, pledge_strategy

def test_ma_signal_is_delayed():
    dates=[f"2020-01-{i:02d}" for i in range(1,203)]; prices=[1.0]*200+[2.0,2.0]
    rows=ma200_switch(dates,prices); assert rows[-1]["nav"] == 1.0

def test_metrics_zero_return():
    rows=[{"date":f"2020-01-{i}","strategy":"x","nav":1.0} for i in range(1,4)]
    assert metrics(rows)["total_return"] == 0

def test_vix_switch_uses_prior_day_signal():
    dates = [f"2020-01-{i:02d}" for i in range(1, 4)]
    prices = [1.0, 2.0, 4.0]
    vix = {dates[0]: 10.0, dates[1]: 30.0, dates[2]: 30.0}
    rows = vix_switch(dates, prices, vix, threshold=25)
    assert rows[-1]["nav"] == 2.0

def test_dynamic_pledge_has_a_nav_and_events():
    dates = [f"2020-01-{i:02d}" for i in range(1, 5)]
    rows, events = pledge_strategy(dates, [100, 100, 90, 95], [100, 100, 90, 95], "x")
    assert len(rows) == 4
    assert events["borrow_events"] >= 1
