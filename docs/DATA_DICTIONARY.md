# Data Dictionary

## Asset data

- `close`: raw TWSE close.
- `adjusted_close`: split-adjusted close based on explicitly configured actions.
- `total_return_close`: only populated when explicit distribution records are complete.
- `cash_dividend`: per-share distribution on ex-date, when supplied.
- `split_ratio`: cumulative configured split factor.
- `source_file`: raw source filename.

## Backtest rows

- `nav`: reported net NAV path.
- `nav_gross`: path before configured path costs.
- `nav_net`: path after configured path costs.
- `cash`, `debt`, `interest`: financing ledger values.
- `collateral_value`, `eligible_collateral_value`: collateral measurements.
- `eligible_target_value`, `eligible_total_value`: target asset value accepted
  as collateral and the total maintenance numerator.
- `non_eligible_asset_value`, `target_value`: target asset values excluded
  from or included in the portfolio ledger.
- `maintenance`: eligible collateral divided by debt principal.
- `required_repayment`, `required_additional_collateral`: model actions/shortfall.
- `liquidation_proceeds`, `liquidation_event`: forced liquidation fields.
- `turnover`, `transaction_cost`, `cost_drag`: cost audit fields.

Pledge strategy events also include a transaction ledger with `date`,
`action`, `amount`, and `reason`. Actions include `BUY`, `BORROW`,
`INTEREST`, `REPAY`, and `LIQUIDATION`. It is an audit trail for the research
model, not a broker execution statement.

Portfolio Composer returns the same type of ledger in `result.ledger`, with
asset, quantity, price, gross amount, transaction fee, signal, and reason for
each initial allocation or rebalance. Composer rejects leverage and short
weights until a matching financing/short-cost model is supplied; it does not
silently convert those unsupported positions into fake NAV.

## Return-series classification

`close` is raw price return, `adjusted_close` is a split-adjusted price-return
proxy, and `total_return_close` is populated only when explicit distribution
amount and ex-date evidence is complete. The pipeline publishes the status and
reason in `site/data/corporate_actions.json`; unavailable total-return data is
never treated as zero distributions.

## Evidence states

`verified` means the implementation and required data passed the project's
current validation gates. `partially_implemented`, `experimental`, and
`synthetic_only` must remain visually distinct. `not_separately_verified`
means a price series must not be called Total Return.
