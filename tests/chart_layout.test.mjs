import assert from "node:assert/strict";
import test from "node:test";

import {
  evenlySpacedTicks,
  maxTextWidth,
  measureTextWidth,
  responsiveTickCount,
  yAxisLayout,
} from "../site/js/charts/chart-layout.js";

test("y-axis layout reserves a readable gap between title and tick labels", () => {
  const labels = ["-100.00%", "0.00%", "125.00%"];
  const layout = yAxisLayout({ tickLabels: labels, axisTitle: "CAGR", minLeft: 0 });
  const tickWidth = maxTextWidth(labels);

  assert.ok(layout.left >= tickWidth + 16);
  assert.ok(layout.tickX < layout.left);
  assert.ok(layout.axisTitleX < layout.tickX - 8);
});

test("tick helpers remain finite for identical values and narrow charts", () => {
  assert.deepEqual(evenlySpacedTicks(5, 5, 3), [5, 5, 5]);
  assert.deepEqual(evenlySpacedTicks(0, 1, 5), [0, 0.25, 0.5, 0.75, 1]);
  assert.equal(responsiveTickCount(180, 44, { min: 3, max: 5 }), 3);
  assert.equal(responsiveTickCount(800, 44, { min: 3, max: 5 }), 5);
});

test("text measurement supports long and multilingual labels without DOM", () => {
  assert.ok(measureTextWidth("00685L 正二策略 100.00%") > measureTextWidth("Beta"));
  assert.ok(Number.isFinite(measureTextWidth("—")));
});

test("layout inputs cover negative, three-digit, empty, single-point and repeated-value cases", () => {
  const labels = ["-999.99%", "0.00%", "125.00%"];
  const layout = yAxisLayout({ tickLabels: labels, axisTitle: "CAGR" });
  assert.ok(layout.left > 0);
  assert.equal(maxTextWidth([]), 0);
  assert.deepEqual(evenlySpacedTicks(12, 12, 5), [12, 12, 12, 12, 12]);
  assert.equal(responsiveTickCount(0, 100, { min: 3, max: 5 }), 3);
  assert.ok(maxTextWidth(["非常長的策略名稱／Synthetic 2X Proxy"]) > layout.tickWidth);
});
