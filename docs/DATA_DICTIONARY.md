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
- `maintenance`: eligible collateral divided by debt principal.
- `required_repayment`, `required_additional_collateral`: model actions/shortfall.
- `liquidation_proceeds`, `liquidation_event`: forced liquidation fields.
- `turnover`, `transaction_cost`, `cost_drag`: cost audit fields.

## Evidence states

`verified` means the implementation and required data passed the project's
current validation gates. `partially_implemented`, `experimental`, and
`synthetic_only` must remain visually distinct. `not_separately_verified`
means a price series must not be called Total Return.
