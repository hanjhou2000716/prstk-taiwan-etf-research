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
