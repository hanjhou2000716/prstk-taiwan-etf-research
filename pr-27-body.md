## Objective

Normalize the remaining legacy horizon route so every published HTML route has a valid document structure and participates in the responsive smoke matrix.

## Changes

- Rebuild `site/horizons.html` as a valid UTF-8 HTML document with explicit `head` and `body` boundaries.
- Preserve the existing 20／10／5／3／1 year horizon table, Actual ETF versus Synthetic Proxy disclosure, and `horizon_metrics.json` data flow.
- Use the shared PRStK／SFC.e header and footer copy.
- Extend static site validation to all legacy routes still present in the repository.
- Extend responsive browser smoke coverage to builder, dashboard, horizons, and proposal pages.

## Quant / Financial Impact

No financial formulas, data files, strategy definitions, or metrics are changed. This is a document-integrity and QA coverage change only.

## UI Impact

The legacy horizon page now uses the same semantic header, breadcrumb, table, disclosure, and responsive behavior as the current platform pages.

## Tests

- `python scripts/validate_site.py`
- `pytest -q`
- `node --test tests/*.test.mjs`
- `python -m compileall -q prstk_research`
- `git diff --check`
- Responsive visual smoke: expanded to 18 pages × 4 viewports.

## Dependency

Depends on PR #45.

## Breaking Change

None. The legacy URL and horizon data schema remain unchanged.

## Migration Needed

None.

## Known Limitations

The legacy route remains outside the primary research workflow; it is retained for backward compatibility and now explicitly uses the same shared navigation runtime.
