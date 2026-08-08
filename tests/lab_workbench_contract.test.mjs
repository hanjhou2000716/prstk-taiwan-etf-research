import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("..", import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), "utf8");

test("research lab includes the shared mobile workbench shell", () => {
  const html = read("site/research-lab.html");
  const header = read("site/js/core/site-header.js");
  const script = read("site/js/core/lab-workbench.js");
  const css = read("site/styles/lab-workbench.css");
  assert.match(header, /lab-workbench\.js\?v=/);
  assert.match(html, /site-header\.js\?v=/);
  assert.match(script, /aria-controls/);
  assert.match(script, /ArrowLeft/);
  assert.match(script, /lab-mobile-tabs/);
  assert.match(css, /max-width: 820px/);
  assert.match(css, /data-lab-view=\"parameters\"/);
});

test("all primary labs expose a common workbench layout", () => {
  for (const page of ["composer", "research-lab", "beta-lab", "leverage-lab", "financing-lab", "risk-lab"]) {
    const html = read(`site/${page}.html`);
    assert.match(html, /class="lab-layout/);
    assert.match(html, /site-header\.js\?v=/);
  }
});
