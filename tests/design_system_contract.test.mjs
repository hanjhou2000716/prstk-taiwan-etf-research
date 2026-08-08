import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("..", import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), "utf8");

test("design system is split into the required maintainable modules", () => {
  const entry = read("site/styles/design-system.css");
  ["typography", "navigation", "buttons", "forms", "metrics", "cards", "tables", "charts", "lab"].forEach((module) => {
    assert.match(entry, new RegExp(`@import url\\("${module}\\.css"\\)`));
    assert.ok(fs.existsSync(new URL(`site/styles/${module}.css`, root)), `${module}.css exists`);
  });
  assert.match(read("docs/UI_ARCHITECTURE.md"), /Chart contract/);
  assert.match(read("docs/DESIGN_SYSTEM.md"), /prefers-reduced-motion/);
});
