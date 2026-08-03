from prstk_research.backtest import ma200_switch, fixed_beta, metrics

def test_ma_signal_is_delayed():
    dates=[f"2020-01-{i:02d}" for i in range(1,203)]; prices=[1.0]*200+[2.0,2.0]
    rows=ma200_switch(dates,prices); assert rows[-1]["nav"] == 1.0

def test_metrics_zero_return():
    rows=[{"date":f"2020-01-{i}","strategy":"x","nav":1.0} for i in range(1,4)]
    assert metrics(rows)["total_return"] == 0
