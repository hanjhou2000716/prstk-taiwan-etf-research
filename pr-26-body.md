## Objective

Recover the missing shared UI architecture required for the interactive research platform and make the responsive smoke matrix exercise real user interactions.

## Changes

- Add an accessible mobile parameter bottom sheet to every primary lab.
- Add close, Escape, focus-return, `aria-hidden`, `aria-modal`, and responsive state handling.
- Move shared mega-menu, mobile drawer, focus, and secondary lab navigation rules into `site/styles/navigation.css`.
- Remove the positional mobile navigation selector and the confirmed unused legacy header module.
- Repair the legacy builder page document boundary so its script is inside the body.
- Expand browser smoke coverage from 5 pages to 14 primary platform pages across 320, 390, 768, and 1440 widths.
- Smoke-test mobile menu open/close and lab parameter-sheet open/close behavior.
- Add a UI architecture contract test for the bottom sheet and modular navigation source.

## Quant / Financial Impact

No financial formulas, source data, strategy definitions, or backtest outputs are changed. This PR only improves interaction, accessibility, and QA coverage.

## UI Impact

Mobile users can open parameters in a fixed, scrollable bottom sheet without losing the result context. Desktop lab layouts remain two-column. Shared navigation behavior is now backed by the design-system navigation module.

## Tests

- `python scripts/validate_site.py`
- `pytest -q` — 21 passed
- `node --test tests/*.test.mjs` — 35 passed
- `python -m compileall -q prstk_research`
- `git diff --check`
- Responsive visual smoke — 14 pages × 4 viewports passed locally with Chromium.

## Risks

- The repository still contains deprecated legacy routes outside the primary navigation. They are not part of the new smoke matrix.
- Local smoke used the installed Chrome executable because the bundled Playwright browser download was unavailable on this Windows environment; CI continues to install and use Chromium.

## Dependency

Depends on PR #43. Must be merged after PRs #33, #34, #35, #36, #37, #38, #40, #41, #42, and #43.

## Breaking Change

None for data, strategy IDs, or public page URLs. The unused `legacy-header.js` module is removed after confirming no page references it.

## Migration Needed

None.

## Known Limitations

Full production Pages smoke remains a post-merge check because this branch is not deployed until the PR chain is merged.
