import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("..", import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), "utf8");

test("report evidence rows do not interpolate catalog values into HTML", () => {
  const source = read("site/js/pages/report-evidence.js");
  assert.match(source, /evidenceBody\.replaceChildren/);
  assert.match(source, /strategy\.display_name/);
  assert.doesNotMatch(source, /evidenceRows.*innerHTML|tr\.innerHTML/);
});
