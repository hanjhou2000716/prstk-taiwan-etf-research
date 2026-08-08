import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("..", import.meta.url);

test("Research Lab uses cached, on-demand strategy data loading", () => {
  const loader = fs.readFileSync(new URL("site/js/core/data-loader.js", root), "utf8");
  const page = fs.readFileSync(new URL("site/js/pages/research-lab.js", root), "utf8");
  assert.match(loader, /csvCache/);
  assert.match(loader, /loadStrategySeries/);
  assert.match(page, /ensureData/);
  assert.doesNotMatch(page, /for \(const strategy of catalog\.strategies/);
});
