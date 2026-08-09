# PRStK UI Architecture

## Shared shell

Every public page provides a semantic header placeholder. `site/js/core/site-header.js` loads the navigation catalog, renders the PRStK and SFC.e image pair, injects the platform navigation, and attaches the mobile drawer. The catalog is the source of truth for active links, menu groups, and page descriptions.

The drawer supports keyboard focus, Escape to close, outside-click close, `aria-expanded`, `aria-controls`, and focus restoration. No page should recreate the brand through CSS pseudo-elements.

The header contract is a single flex row on desktop: brand, flexible space, and navigation. At mobile widths the brand remains one row with `L&B Platform` and an icon-only 44px menu button. The two first-level research groups are generated from `site/data/navigation.json`; individual pages do not own a second navigation tree.

## Research workbench

Research pages use one of two shared shells:

- `.lab-layout` — classic parameter sidebar plus result area.
- `.lab-workbench` — responsive workbench with summary, chart, risk, and parameter regions.

`site/js/core/lab-workbench.js` detects the current page's sections and adds the mobile tab view without changing the underlying calculation modules. The desktop sidebar remains available; on mobile the Parameters tab is an explicit view.

## Chart contract

`site/js/charts/svg-charts.js` is the shared chart adapter. Pages pass already aligned rows and metric results to `lineChart`, `drawdownChart`, or `heatmap`. The adapter provides legend state, scale toggle, recent-window zoom, crosshair tooltip, and an accessible data table. It does not calculate portfolio returns or invent missing values.

Chart resize is owned by the shared adapter through `ResizeObserver`. Page modules must not redraw charts from a global `window.resize` listener. Every series should provide a semantic name, type, and unit. Tooltips expose the date, value, cumulative return where applicable, and benchmark excess when a benchmark series is present.

## Data and state

- Pipeline data lives under `site/data` and is versioned through the manifest.
- Runtime experiments are local-only `Experiment` objects and can be exported as JSON.
- Query parameters may preselect a strategy, but complete daily series are never placed in a URL.
- Unavailable or experimental data remains visible as a status and limitation, never silently substituted.

## Page responsibilities

| Area | Primary responsibility |
|---|---|
| Overview | Evidence-backed entry point and Beta × CAGR × drawdown map |
| Research Lab | One strategy or custom portfolio experiment |
| Beta / Leverage / Financing / Risk | Focused analytical labs using shared metrics and chart primitives |
| Compare | Common-period comparison and canonical comparison table |
| Report | Research narrative and chart presentation |
| Audit / Methodology | Sources, model assumptions, validation state, and limitations |

## Legacy route policy

`builder.html`, `dashboard.html`, `horizons.html`, and `proposal.html` are historical compatibility routes, not a second product surface. They display an archive notice with a link to the current Research Lab, Compare, or Methodology destination. New features belong only on current routes.

## Runtime safety

Data-driven labels are inserted with DOM text nodes rather than string-interpolated HTML. Experiment storage is local-only, handles unavailable storage without breaking the page, limits serialized share state, and sanitizes download filenames. Research results remain blocked when reconciliation evidence is incomplete.
