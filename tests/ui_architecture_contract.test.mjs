import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("..", import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), "utf8");

test("mobile workbench provides an accessible parameter bottom sheet", () => {
  const script = read("site/js/core/lab-workbench.js");
  const css = read("site/styles/lab-workbench.css");
  assert.match(script, /role", "dialog"/);
  assert.match(script, /lab-parameters-close/);
  assert.match(script, /aria-hidden/);
  assert.match(script, /lab-parameters-open/);
  assert.match(css, /position: fixed/);
  assert.match(css, /max-height: calc\(100dvh - 88px\)/);
  assert.match(css, /prefers-reduced-motion/);
});

test("navigation rules have one modular source and no positional mobile selector", () => {
  const navigation = read("site/styles/navigation.css");
  const legacy = read("site/styles.css");
  assert.match(navigation, /nav-menu-panel/);
  assert.match(navigation, /menu-toggle/);
  assert.match(navigation, /lab-secondary-nav/);
  assert.doesNotMatch(legacy, /nav-menu-panel/);
  assert.doesNotMatch(legacy, /nav\.open > a:nth-child/);
  assert.ok(!fs.existsSync(new URL("site/js/core/legacy-header.js", root)), "legacy header module removed");
});
