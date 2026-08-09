import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("..", import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), "utf8");

test("all published pages use the shared header mount", () => {
  for (const file of fs.readdirSync(new URL("site/", root)).filter((name) => name.endsWith(".html"))) {
    assert.match(read(`site/${file}`), /<header class="site-header" data-site-header><\/header>/, file);
  }
});

test("mobile brand and menu follow the product contract", () => {
  const header = read("site/js/core/site-header.js");
  const navigation = read("site/data/navigation.json");
  const css = read("site/styles/navigation.css");
  assert.match(navigation, /"platformName": "Leverage & Beta Platform"/);
  assert.match(navigation, /"mobilePlatformName": "L&B Platform"/);
  assert.match(header, /menu-icon/);
  assert.doesNotMatch(header, /menu-icon.*選單/);
  assert.match(header, /aria-expanded/);
  assert.match(header, /aria-controls/);
  assert.match(css, /min-width:44px/);
});

test("legacy routes announce their replacement instead of acting as a second product", () => {
  const archive = read("site/js/core/legacy-archive.js");
  assert.match(archive, /builder\.html/);
  assert.match(archive, /dashboard\.html/);
  assert.match(archive, /horizons\.html/);
  assert.match(archive, /proposal\.html/);
  for (const file of ["builder.html", "dashboard.html", "horizons.html", "proposal.html"]) {
    assert.match(read(`site/${file}`), /legacy-archive\.js/);
  }
});

test("chart tooltips expose research context and resize ownership", () => {
  const chart = read("site/js/charts/svg-charts.js");
  assert.match(chart, /累積報酬/);
  assert.match(chart, /相對/);
  assert.match(chart, /ResizeObserver/);
  assert.match(chart, /root\.__chartCleanup/);
  assert.doesNotMatch(chart, /Series \$\{/);
});

test("global overflow is not used as a blanket page mask", () => {
  const base = read("site/styles/base.css");
  const legacy = read("site/styles/legacy-compat.css");
  assert.doesNotMatch(base, /body\{[^}]*overflow-x/);
  assert.doesNotMatch(legacy, /html,body\{max-width:100%;overflow-x/);
  assert.match(read("site/styles/tables.css"), /overflow-x:auto/);
});
