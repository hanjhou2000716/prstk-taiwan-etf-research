import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflow = fs.readFileSync(new URL("../.github/workflows/deploy-pages.yml", import.meta.url), "utf8");

test("Pages deployment publishes the split design system and smoke-tests it", () => {
  assert.match(workflow, /cp -r site\/styles artifacts\/reports\/styles/);
  assert.match(workflow, /styles\/design-system\.css/);
  assert.match(workflow, /data\/deployment\.json/);
});
