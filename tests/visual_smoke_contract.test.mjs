import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflow = fs.readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const smoke = fs.readFileSync(new URL("../scripts/visual_smoke.mjs", import.meta.url), "utf8");

test("CI defines the responsive visual smoke matrix", () => {
  assert.match(workflow, /node scripts\/visual_smoke\.mjs/);
  assert.match(workflow, /playwright install --with-deps chromium/);
  assert.match(workflow, /upload-artifact@v4/);
  ["desktop-1920", "desktop-1440", "desktop-1280", "tablet-1024", "tablet-768", "mobile-430", "mobile-390", "mobile-360"].forEach((viewport) => assert.match(smoke, new RegExp(viewport)));
  assert.match(smoke, /scrollWidth/);
  ["composer.html", "beta-lab.html", "leverage-lab.html", "financing-lab.html", "risk-lab.html", "sensitivity.html", "methodology.html", "audit.html", "strategies.html", "builder.html", "dashboard.html", "horizons.html", "proposal.html"].forEach((page) => assert.match(smoke, new RegExp(page.replace(".", "\\."))));
  assert.match(smoke, /mobile navigation/);
  assert.match(smoke, /lab-parameters-open/);
  assert.match(smoke, /parameter sheet focus restore/);
  assert.match(smoke, /pageerror/);
});
