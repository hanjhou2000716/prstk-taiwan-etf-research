# Quant Engine

`prstk_research/engine/` is the canonical Python definition for research
metrics. The pipeline uses these functions for baseline and horizon output.

## Rate separation

- `risk_free_rate` is used only by Sharpe, Sortino, alpha and Treynor.
- `annual_interest_rate` / `borrow_rate` is used by the financing model.
- `pledge_interest_rate` is recorded in the pledge ledger.
- `cash_yield` is a portfolio cash assumption.

These values must not be substituted for one another.

## Data and evidence

Metrics are calculated on the date-aligned NAV path. Actual ETF and synthetic
proxy rows remain separate in the strategy catalog. A missing distribution
record does not become a zero dividend; Total Return remains unavailable until
the required corporate-action data is supplied.

## Beta

`calculate_beta_metrics` uses the intersection of asset and benchmark dates and
returns Beta, alpha, R², correlation, tracking error, information ratio,
Treynor, and up/down capture. Results include the common start/end dates and
observation count.
