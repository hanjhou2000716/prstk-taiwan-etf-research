import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflow = fs.readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const smoke = fs.readFileSync(new URL("../scripts/visual_smoke.mjs", import.meta.url), "utf8");

test("CI defines the responsive visual smoke matrix", () => {
  assert.match(workflow, /node scripts\/visual_smoke\.mjs/);
  assert.match(workflow, /playwright install --with-deps chromium/);
  assert.match(workflow, /upload-artifact@v4/);
  ["mobile-320", "mobile-390", "tablet-768", "desktop-1440"].forEach((viewport) => assert.match(smoke, new RegExp(viewport)));
  assert.match(smoke, /scrollWidth/);
  assert.match(smoke, /pageerror/);
});
