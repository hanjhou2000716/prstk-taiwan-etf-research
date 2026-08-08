import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("..", import.meta.url);
const read = (relativePath) => fs.readFileSync(new URL(relativePath, root), "utf8");

test("homepage exposes the evidence filters and real risk map module", () => {
  const html = read("site/index.html");
  const overview = read("site/js/pages/overview.js");
  const riskMap = read("site/js/charts/risk-map.js");

  assert.match(html, /data-risk-filter value="actual_etf"/);
  assert.match(html, /data-risk-filter value="synthetic_proxy"/);
  assert.match(html, /data-risk-filter value="experimental"/);
  assert.match(overview, /baseline_metrics\.json\?v=/);
  assert.match(overview, /renderRiskMap/);
  assert.match(riskMap, /beta_beta/);
  assert.match(riskMap, /max_drawdown/);
  assert.match(riskMap, /aria-label/);
});

test("published baseline data contains auditable beta fields", () => {
  const rows = JSON.parse(read("site/data/baseline_metrics.json"));
  assert.ok(rows.length >= 4);
  for (const row of rows) {
    assert.equal(row.status, "available");
    assert.match(row.start, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(row.end, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(typeof row.cagr, "number");
    assert.equal(typeof row.max_drawdown, "number");
    assert.equal(typeof row.beta_beta, "number");
  }
});
