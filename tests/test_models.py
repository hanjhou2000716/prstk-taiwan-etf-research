from prstk_research.models import FinancingTerms, maintenance_ratio, max_loan, interest_due, classify_maintenance

def test_financing_terms():
    t=FinancingTerms(); assert max_loan(1000,t)==600; assert interest_due(600,t)==9.9
    assert maintenance_ratio(130,100)==1.3; assert classify_maintenance(1.29,t)=="margin_call"; assert classify_maintenance(1.67,t)=="release_eligible"
