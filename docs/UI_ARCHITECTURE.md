# PRStK UI Architecture

## Shared shell

Every public page provides a semantic header placeholder. `site/js/core/site-header.js` loads the navigation catalog, renders the PRStK and SFC.e image pair, injects the platform navigation, and attaches the mobile drawer. The catalog is the source of truth for active links, menu groups, and page descriptions.

The drawer supports keyboard focus, Escape to close, outside-click close, `aria-expanded`, `aria-controls`, and focus restoration. No page should recreate the brand through CSS pseudo-elements.

## Research workbench

Research pages use one of two shared shells:

- `.lab-layout` — classic parameter sidebar plus result area.
- `.lab-workbench` — responsive workbench with summary, chart, risk, and parameter regions.

`site/js/core/lab-workbench.js` detects the current page's sections and adds the mobile tab view without changing the underlying calculation modules. The desktop sidebar remains available; on mobile the Parameters tab is an explicit view.

## Chart contract

`site/js/charts/svg-charts.js` is the shared chart adapter. Pages pass already aligned rows and metric results to `lineChart`, `drawdownChart`, or `heatmap`. The adapter provides legend state, scale toggle, recent-window zoom, crosshair tooltip, and an accessible data table. It does not calculate portfolio returns or invent missing values.

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
