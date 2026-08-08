# PRStK Leverage & Beta Lab Architecture

## Runtime flow

```text
TWSE / Cboe source
  -> raw JSON/CSV
  -> normalized asset data
  -> corporate-action adjustment
  -> Python strategy and ledger engine
  -> artifacts (CSV / JSON / validation)
  -> site/data snapshot
  -> browser research labs
```

The research pipeline is the source of published backtest rows. Browser labs
may run interactive portfolio, Beta, leverage, and risk calculations from the
same versioned snapshot, but must not silently replace missing source data.

## Engine boundaries

- `prstk_research/engine/metrics.py`: canonical return and risk definitions.
- `prstk_research/engine/beta.py`: benchmark-relative statistics.
- `prstk_research/engine/leverage.py`: daily-reset theoretical leverage.
- `prstk_research/backtest.py`: strategy-specific paths and pledge ledger.
- `site/js/core/metrics.js`: browser metrics used by interactive reports.
- `site/js/core/portfolio-engine.js`: browser portfolio composition and rebalancing.

## Publication

`research-pipeline.yml` produces data artifacts and syncs the site snapshot.
`deploy-pages.yml` is the only Pages publisher. Deployment metadata records
commit SHA, data end date, model version, and deployment time.
