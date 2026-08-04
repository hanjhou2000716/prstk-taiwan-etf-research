from prstk_research.models import FinancingTerms, interest_due
from prstk_research.backtest import apply_path_costs


def test_financing_cost_is_explicit():
    terms = FinancingTerms(annual_interest_rate=0.033, interest_period_months=6)
    assert interest_due(600000, terms) == 9900.0

def test_path_cost_preserves_gross_and_changes_net_path():
    rows = [
        {"date": "2020-01-01", "nav": 1.0},
        {"date": "2020-01-02", "nav": 1.1},
    ]
    apply_path_costs(rows, annual_management_fee=0.252)
    assert rows[-1]["nav_gross"] == 1.1
    assert rows[-1]["nav_net"] < rows[-1]["nav_gross"]
    assert rows[-1]["nav"] == rows[-1]["nav_net"]
    assert rows[-1]["transaction_cost"] > 0
