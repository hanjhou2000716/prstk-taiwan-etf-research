import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("..", import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), "utf8");

test("design system is the direct stylesheet entrypoint", () => {
  for (const file of fs.readdirSync(new URL("site", root)).filter((name) => name.endsWith(".html"))) {
    const html = read(`site/${file}`);
    assert.match(html, /styles\/design-system\.css/);
    assert.doesNotMatch(html, /href=["']styles\.css/);
  }
});

test("global navigation has one home link and two grouped first-level menus", () => {
  const navigation = JSON.parse(read("site/data/navigation.json"));
  assert.equal(navigation.primary.length, 1);
  assert.equal(navigation.groups.length, 2);
  assert.equal(navigation.groups[0].label, "研究實驗室");
  assert.equal(navigation.groups[1].label, "研究中心");
});

test("charts use natural-flow stages and responsive rendering", () => {
  const chart = read("site/js/charts/svg-charts.js");
  const css = read("site/styles/charts.css");
  assert.match(chart, /ResizeObserver/);
  assert.match(chart, /chart-stage/);
  assert.doesNotMatch(chart, /Math\.max\(420/);
  assert.doesNotMatch(chart, /Math\.max\(500/);
  assert.match(css, /\.chart-stage/);
  assert.match(css, /min-height/);
});

test("production chart labels never fall back to Series N", () => {
  const chart = read("site/js/charts/svg-charts.js");
  assert.doesNotMatch(chart, /Series \$\{/);
  assert.match(chart, /研究序列/);
});

test("brand exposes desktop and mobile platform names", () => {
  const header = read("site/js/core/site-header.js");
  const navigation = JSON.parse(read("site/data/navigation.json"));
  assert.match(header, /brand-platform-name-desktop/);
  assert.match(header, /brand-platform-name-mobile/);
  assert.equal(navigation.brand.platformName, "Leverage & Beta Platform");
  assert.equal(navigation.brand.mobilePlatformName, "L&B Platform");
});

test("lab charts expose semantic series metadata and disable invalid log scales", () => {
  const beta = read("site/js/pages/beta-lab.js");
  const composer = read("site/js/pages/composer.js");
  const financing = read("site/js/pages/financing-lab.js");
  const chart = read("site/js/charts/svg-charts.js");
  assert.match(beta, /type: 'beta'/);
  assert.match(beta, /logScale: false/);
  assert.match(composer, /type: 'portfolio'/);
  assert.match(composer, /unit: 'nav'/);
  assert.match(financing, /type: 'maintenance-ratio'/);
  assert.match(financing, /type: 'margin-call-threshold'/);
  assert.match(chart, /export function drawdownChart/);
});

test("mobile lab parameter drawer restores focus after Escape", () => {
  const workbench = read("site/js/core/lab-workbench.js");
  assert.match(workbench, /lastFocusedElement/);
  assert.match(workbench, /preventScroll: true/);
  assert.match(workbench, /event\.key === "Escape"/);
});

test("report and risk charts keep semantic, date-keyed series", () => {
  const report = read("site/js/pages/report.js");
  const lab = read("site/js/pages/research-lab.js");
  const risk = read("site/js/pages/risk-lab.js");
  assert.match(report, /type: 'strategy-nav'/);
  assert.match(report, /date: row\.date/);
  assert.match(lab, /unit: 'nav'/);
  assert.match(risk, /type: 'rolling-cagr'/);
  assert.match(risk, /type: 'rolling-volatility'/);
});

test("report metrics are finalized through text nodes", () => {
  const report = read("site/js/pages/report.js");
  assert.match(report, /const metricsBody = document\.querySelector\('#metrics'\)/);
  assert.match(report, /metricsBody\.replaceChildren/);
  assert.match(report, /cell\.textContent = String\(value\)/);
});

test("stress path chart names every risk threshold", () => {
  const stress = read("site/js/pages/stress-test.js");
  assert.match(stress, /type: 'maintenance-ratio'/);
  assert.match(stress, /type: 'margin-call-threshold'/);
  assert.match(stress, /type: 'rollover-threshold'/);
  assert.match(stress, /type: 'liquidation-threshold'/);
  assert.match(stress, /renderMatrix/);
});
