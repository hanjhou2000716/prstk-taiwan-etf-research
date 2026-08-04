from prstk_research.models import FinancingTerms, interest_due


def test_financing_cost_is_explicit():
    terms = FinancingTerms(annual_interest_rate=0.033, interest_period_months=6)
    assert interest_due(600000, terms) == 9900.0
