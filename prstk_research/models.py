from __future__ import annotations
from dataclasses import dataclass

@dataclass(frozen=True)
class FinancingTerms:
    annual_interest_rate: float = .033
    max_loan_to_collateral: float = .60
    interest_period_months: int = 6
    margin_call: float = 1.30
    rollover: float = 1.66
    release: float = 1.67

def maintenance_ratio(collateral_value: float, principal: float) -> float:
    return float("inf") if principal <= 0 else collateral_value / principal

def max_loan(collateral_value: float, terms: FinancingTerms = FinancingTerms()) -> float:
    return collateral_value * terms.max_loan_to_collateral

def interest_due(principal: float, terms: FinancingTerms = FinancingTerms()) -> float:
    return principal * terms.annual_interest_rate * terms.interest_period_months / 12

def classify_maintenance(ratio: float, terms: FinancingTerms = FinancingTerms()) -> str:
    if ratio < terms.margin_call: return "margin_call"
    if ratio < terms.rollover: return "not_eligible_for_rollover"
    if ratio < terms.release: return "rollover_only"
    return "release_eligible"
