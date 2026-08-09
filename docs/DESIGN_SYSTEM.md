# PRStK Design System

The public site uses a low-saturation editorial research visual language: warm paper background, dark graphite text, restrained green/brown risk accents, thin rules, and generous spacing. It is intentionally distinct from a neon trading dashboard.

## Entry point

`site/styles/design-system.css` is loaded by the shared header after the legacy page stylesheet. It imports the design-system modules in dependency order:

1. `tokens.css` — colors, spacing, type scale, breakpoints, motion.
2. `base.css` — reset, focus treatment, visually-hidden utility, status dots.
3. `layout.css` — shells, workbench grids, evidence strips.
4. `components.css` — cards, notes, charts, tables, risk-map presentation.
5. `typography.css`, `navigation.css`, `buttons.css`, `forms.css` — semantic page primitives.
6. `metrics.css`, `cards.css`, `tables.css`, `charts.css`, `lab.css` — research-specific surfaces.
7. `responsive.css`, `motion.css`, `print.css`, `lab-workbench.css` — viewport, motion, print, and lab behavior.

## Rules

- Use semantic HTML before adding a visual class.
- Keep Actual ETF, Synthetic Proxy, Experimental, and unavailable states visually distinct.
- Never use color as the only state signal; pair it with text or a status badge.
- Use tabular numerals for metrics and two decimal places for percentages in presentation code.
- Keep research data tables available behind chart controls for keyboard and screen-reader users.
- Honor `prefers-reduced-motion`; transitions should explain state changes, not decorate every interaction.
- Keep local overflow ownership explicit: tables and horizontal lab tabs may scroll within their own containers; `body` and `html` must not hide layout defects with a blanket overflow mask.
- Use status text together with color so Verified, Experimental, Synthetic, Warning, and Blocked states remain understandable without color vision.

## Responsive behavior

At 820px the research workbench collapses to one column. At 600px metric grids become two columns, Compare renders canonical table rows as mobile cards, and the shared lab workbench exposes Summary / Charts / Risk / Parameters tabs. Parameters move into the mobile view instead of being removed from the page.
