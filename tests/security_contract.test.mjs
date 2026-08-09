import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("..", import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), "utf8");

test("catalog-driven comparison and suitability rows use text nodes", () => {
  assert.doesNotMatch(read("site/js/pages/compare-scorecard.js"), /item\.innerHTML|strategy\.display_name.*innerHTML/);
  assert.doesNotMatch(read("site/js/pages/suitability-panel.js"), /row\.innerHTML/);
  assert.doesNotMatch(read("site/js/pages/horizon-panel.js"), /horizonRows.*innerHTML/);
});

test("experiment persistence and share state have failure guards", () => {
  const store = read("site/js/core/experiment-store.js");
  const urlState = read("site/js/core/url-state.js");
  assert.match(store, /try \{ localStorage\.setItem/);
  assert.match(store, /safeName/);
  assert.match(urlState, /value\.length>12000/);
  assert.match(urlState, /!Array\.isArray\(state\)/);
});
