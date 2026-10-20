# LPOS Portfolio Lab V0.7.1

## V0.7.1: simpler setup and stable editing

The primary path is a four-step affordability check: funds, ETF allocation, loan terms, and confirmation. Historical research, A/B/C, reports, survival assumptions, and backup/import remain available from the advanced tools hub. Mobile navigation has three main entries, with the same settings and calculations as desktop.

Numeric inputs keep their raw text while editing. Blank and incomplete values stay in a draft and block calculations instead of being coerced to zero; decimal amounts, full-width digits, grouped commas, and negative monthly cash flow are supported. The last valid workspace is stored separately from drafts under the V3 editor key, with a 600 ms merged save, save-on-blur and page-background attempts, read-back verification, and recovery of damaged data without automatic replacement. Existing V0.6/V0.7 workspace keys remain untouched during migration. Local browser tests exercise zero, intermediate minus, decimals, edit recovery, and the reproduced mobile crash path.

The candidate preview is deployed under `/lpos-portfolio-lab/preview/v071/` using the current main site as its static baseline. The official LPOS path remains the production entry until the owner completes the physical-device checklist on Android 13 / Chrome 155.0.8059.39. Browser automation is responsive simulation, not physical-phone certification.

V0.7 replaces the maintained LPOS page with a React, TypeScript, and Vite application while preserving the V0.6 page at site/lpos-portfolio-lab/legacy-v06.html as a regression baseline. The application is built into the existing Pages path; the other research pages remain static.

## Architecture and data flow

apps/lpos/src/engine/portfolio.js is the extracted V0.6 financial core and has no DOM or browser-storage side effects. Its declarations live beside it in portfolio.d.ts. The independent T+2 survival model remains in engine/survival-engine.js. research.worker.ts freezes and validates a request, loads actual source files, computes SHA-256 digests, runs the two models separately, and returns a versioned ResearchRun. workspace.ts owns the V0.6 migration, V2 local workspace, schema validation, import preview, and bundle checks. report.ts turns one completed run into the eight-section ResearchReportV1 used by both the webpage and the lazy PDF worker.

The request/result flow is:

1. Edit the local workspace draft.
2. Validate the draft and freeze ResearchRequest.
3. Load and hash only the source files used by that request.
4. Run return, fair-comparison, and T+2 survival calculations in a Worker.
5. Keep the ResearchRun and its report in the current browser session; edits mark that result stale.
6. Export the same report as selectable-text PDF, plus complete JSON replay bundle and daily-account CSV.

ScenarioV1 retains the V0.6 configuration format. WorkspaceV2, ResearchRequest, ResearchRun, ResearchReportV1, and ResearchBundleV1 are runtime-validated before use or import. A replay bundle includes exact source files and verifies their hashes and derived data/parameter fingerprints, then recomputes the results. A matching hash establishes internal consistency only; it does not authenticate the upstream data.

## Model and evidence boundaries

The return engine uses archived adjusted-price proxy data and its immediate-sale settlement approximation. It also computes a same-ETF, same-period, same-capital, same-cash-flow, zero-borrow benchmark. That benchmark is separate from A/B/C and is never presented as a ranked comparison against a different date range. The survival engine separately models daily interest, T+2 receivables, restricted cash, loan maturity, and conditional renewal. Results from one model do not establish the outcomes of the other. The fixed disclosure is:

> 研究行情是調整價格代理，非已驗證含息真實可執行融資回測。

The source audit's layer states remain visible. Passing the application's accounting checks does not clear formal_conclusions_blocked. Reference Python snapshots stay separate from user-defined same-period rankings. A/B/C require the same own capital, external net cash flow, and common dates; an interrupted strategy disables cross-period CAGR/Sharpe ranking.

## Compatibility and local privacy

- The V0.6 page is preserved at legacy-v06.html; the old V0.4 route remains as its archived redirect.
- Legacy hashes such as #portfolio, #financing, #survival, #backtest, and #sources resolve to V0.7 sections.
- Existing V0.6 browser storage is backed up locally before migration; V0.7.1 stores editor drafts and last-valid settings separately under its V3 editor key.
- Scenario, workspace, research, and replay exports remain local browser downloads. User settings are never sent to Actions or a hosted database.
- PDF renderer and the self-hosted Noto Sans TC WOFF fonts load only when the user requests a PDF.

## Development and release

The root package-lock.json pins the front-end toolchain. The PDF's regular and bold Noto Sans TC fonts are merged from the exact Unicode subsets used by the report, so required full-width punctuation has real glyphs and copy/paste mappings. Use Python 3.11 with the pinned FontTools version as well as Node 22:

    npm ci
    python -m pip install fonttools==4.67.0
    npm run fonts:lpos
    npm run typecheck
    npm test
    npm run test:lpos
    npm run build:lpos
    node scripts/lpos_v07_browser_smoke.mjs
    python scripts/lpos_v07_pdf_check.py artifacts/lpos-v07/representative-report.pdf

The browser check covers desktop and mobile in Chromium, Firefox, and WebKit, including same-capital A/B/C research, stale-result invalidation, an actual PDF download, and replay-bundle recomputation. The PDF check extracts selectable text, verifies all eight sections, exact Unicode disclosure, and matching research identifiers and CAGR against the JSON bundle, then renders every page to PNG for visual review. Fontsource's upstream Noto Sans TC font and SIL Open Font License are included in apps/lpos/THIRD_PARTY_NOTICES.txt.

deploy-pages.yml assembles the existing website and apps/lpos/dist into one Pages artifact. It tests that exact staged artifact before publishing, records the commit and app version in data/deployment.json, and rechecks the public pages, assets, user flows, PDF, and commit after deployment. The separate preview-lpos-v071.yml assembles the unchanged main site with the candidate under the isolated preview path. If release verification fails, fix the cause and publish a new validated commit. For a severe public regression, revert the deployment commit through the normal Git review flow; browser-local workspaces are not modified by site releases.
