import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("..", import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), "utf8");

test("shared chart module exposes accessible interaction primitives", () => {
  const chart = read("site/js/charts/svg-charts.js");
  const layout = read("site/js/charts/chart-layout.js");
  const css = read("site/styles/components.css");
  assert.match(chart, /pointermove/);
  assert.match(chart, /chart-tooltip/);
  assert.match(chart, /chart-data-table/);
  assert.match(chart, /aria-pressed/);
  assert.match(chart, /放大最近區間/);
  assert.match(chart, /yAxisLayout/);
  assert.match(chart, /data-chart-text/);
  assert.match(layout, /measureTextWidth/);
  assert.match(layout, /responsiveTickCount/);
  assert.match(css, /\.chart-controls/);
  assert.match(css, /\.chart-tooltip/);
  assert.match(css, /\.chart-data-table/);
  assert.match(css, /\.chart-scroll/);
});
