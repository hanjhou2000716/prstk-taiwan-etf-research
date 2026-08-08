# PRStK Leverage & Beta Lab

Taiwan ETF quantitative research platform for 006208, 00685L, 00631L,
synthetic 2× proxies, cash, and pledge/financing scenarios.

## What it does

- Reproduces ETF strategy paths from TWSE data and explicit synthetic models.
- Calculates return, volatility, Sharpe, Sortino, drawdown, VaR/CVaR and Beta metrics.
- Compares Actual ETF and Synthetic Proxy data without mixing evidence classes.
- Models daily-reset leverage and volatility drag.
- Provides pledge ledger and maintenance/liquidation stress views.
- Supports interactive Beta Lab, Leverage Lab, Financing Lab, Risk Lab, and Portfolio Composer.
- Generates versioned CSV, JSON, validation, and research report artifacts.

## Local setup

```powershell
python -m pip install -e .
pytest -q
python scripts/validate_site.py
```

Run the pipeline with existing raw data:

```powershell
python -m prstk_research.pipeline run
```

Download missing official source data first:

```powershell
python -m prstk_research.pipeline run --download
```

## Data and evidence rules

The pipeline stores raw source files, normalized data, SHA-256 manifests,
backtest rows, metrics, corporate-action status, and reconciliation reports.
Adjusted price is not automatically Total Return. If explicit distribution data
is incomplete, the Total Return field remains unavailable.

Risk-free rate is separate from borrowing rate, pledge interest, and cash yield.
00685L collateral eligibility is currently unknown unless independently verified.

## Website

The `site/` directory is the GitHub Pages build. `deploy-pages.yml` is the only
Pages publisher. `research-pipeline.yml` updates the versioned data snapshot but
does not overwrite interactive pages.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Quant Engine](docs/quant_engine.md)
- [Data Dictionary](docs/DATA_DICTIONARY.md)
- [Testing](docs/TESTING.md)
- [Methodology](site/methodology.html)
- [Audit](site/audit.html)

This is a research system, not personalized financial advice or a guarantee of
future returns.
