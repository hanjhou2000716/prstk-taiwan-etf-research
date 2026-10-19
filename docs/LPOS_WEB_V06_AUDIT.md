# LPOS Portfolio Lab Web V0.6

Scope: retain V0.1–V0.5, audit financial accounting, improve ETF allocation and per-fund collateral editing, enforce fair A/B/C comparison, and concentrate return/risk/survival evidence. No advanced PDF report or visual redesign.

## Accounting contract

- Own ETF market value = own capital × (1 − cash fraction) / (1 + buy cost).
- Each fund's recognized collateral = its own ETF market value × pledge fraction, or zero when blocked. Loan-financed holdings do not recursively create collateral.
- Credit capacity = sum of each recognized collateral × its own LTV. Loan principal = capacity × utilization.
- Origination fees reduce usable loan proceeds. Remaining loan proceeds split into invested budget and liquid cash; buying costs reduce market value rather than create an extra liability.
- Assets = own holdings + borrowed holdings + liquid cash. Initial net assets = own capital − initial trading and origination fees. Fee differences between strategies remain visible.
- Survival daily equity = holdings + spendable cash + restricted cash + T+2 receivables − principal − accrued interest. ACT/365 uses elapsed calendar days, including weekends. Principal repayment reduces cash and debt together.
- Sale receivables settle after two observed trading sessions; they cannot fund same-day payments. Restricted collateral cash is not spendable.

## Corrections and protections

- Reject duplicate symbols on import and empty numerical inputs. Weight sums must equal 100% within floating-point tolerance; normalization uses largest remainders at 0.1 percentage-point precision.
- Show per-fund borrowing capacity; disable pledge/LTV edits for blocked collateral while preserving prior values for re-enabling.
- Include initial fees in drawdown relative to original own capital.
- Capture scenario/settings/request stamps before asynchronous market loading. Edits invalidate old results and exports.
- Survival horizon ends at the precise calendar-month anniversary. Inadequate source coverage is explicitly marked, and excluded from the five-case completion count.
- Record the failure-day terminal balance separately from the successful daily ledger. End figures and realized end date refer to that terminal record when present.
- Fair comparisons require equal starting own capital and equal monthly external net cash flows. All strategies receive one intersection of observed dates and common backtest settings. No missing-price interpolation or hidden parameter normalization.
- If any strategy fails before the common endpoint, annualized comparison ranking is suppressed for the whole group. Actual periods, debt, failures and partial paths remain visible.

## Method boundaries

Research market data are adjusted-price proxies, **not verified dividend-inclusive returns or a real executable financing backtest**. The return engine retains its disclosed immediate-sale-proceeds and unverified collateral-release/rebalancing assumptions. The separate survival engine models T+2 and bullet maturity. They do not claim numerical equivalence; the overview reports their separate realized periods and methods. Leverage ETF stress is a one-time factor approximation. Margin thresholds and cure policy are research assumptions, not validated broker terms. Conditional loan renewal is never approval. Five scenario completions are not a probability estimate.

## Validation

`node --test tests/lpos_v06.test.mjs` exercises independent accounting examples, 300 seeded allocations, field validation, blocked collateral, calendar-day interest, every daily ledger identity, T+2 dates, principal repayment, failure-day records, horizon coverage, fair comparison refusal, external-flow-neutral returns, initial-fee drawdown, and stale asynchronous results.

V0.3 source-price parity and V0.5 integration/semantics regressions remain in the release workflow. `scripts/lpos_v06_browser_smoke.mjs` exercises actual desktop and mobile browser controls, weight normalization, collateral eligibility, A/B/C capital/flow refusal, saved A/B/C comparisons, overview calculation, stale-result hiding and all existing navigation areas. The Pages workflow runs tests before deployment and repeats browser checks on the public URL, verifies the published commit in `data/deployment.json`, and uploads screenshots.

Acceptance: open `/lpos-portfolio-lab/index.html`, apply the supported ETF sample if needed, edit allocation/pledge fields, save A/B/C under equal own capital and external flows, run comparison and overview, then change APR and confirm old results disappear. Existing historical snapshots, dynamic backtest, survival settings, exports and V0.4 redirect remain available.
