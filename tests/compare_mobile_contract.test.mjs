import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("..", import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), "utf8");

test("compare mobile view is derived from canonical table rows", () => {
  const script = read("site/js/pages/compare-mobile.js");
  const css = read("site/styles/responsive.css");
  assert.match(script, /querySelector\("#table"\)/);
  assert.match(script, /MutationObserver/);
  assert.match(script, /最大回撤/);
  assert.match(css, /compare-mobile-cards/);
  assert.match(css, /compare-results-table/);
});
