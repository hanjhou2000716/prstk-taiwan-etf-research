# Testing Guide

## Local checks

```bash
pytest -q
python scripts/validate_site.py
```

For browser modules:

```bash
node --check site/js/core/metrics.js
node --check site/js/core/beta-engine.js
node --check site/js/core/leverage-engine.js
```

## Required invariants

- NAV is finite, positive, and starts at 1.
- Debt never becomes negative.
- Actual and Synthetic data types remain identifiable.
- Metrics use common dates for benchmark comparisons.
- Signals do not use future observations.
- Missing corporate actions remain unavailable, not zero-filled.

## CI

CI runs unit tests, site contracts, JSON parsing, required-page checks, and
JavaScript syntax checks. Pages deployment runs a separate HTTP smoke test and
verifies published commit metadata.
