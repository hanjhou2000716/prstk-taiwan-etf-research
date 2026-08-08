import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { calculateMetrics } from "../site/js/core/metrics.js";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/quant_series.json", import.meta.url), "utf8"));
const python = spawnSync("python", ["-c", `
import json
import sys
from prstk_research.engine.metrics import calculate_metrics
from prstk_research.engine.beta import calculate_beta_metrics
payload = json.load(sys.stdin)
params = payload["parameters"]
result = calculate_metrics(payload["asset"], benchmark_rows=payload["benchmark"], risk_free_rate=params["riskFreeRate"], trading_days_per_year=params["tradingDaysPerYear"], annual_cost=params["annualCost"])
daily_cost = max(0.0, params["annualCost"]) / params["tradingDaysPerYear"]
net_rows = [dict(payload["asset"][0])]
for index in range(1, len(payload["asset"])):
    previous = float(payload["asset"][index - 1]["nav"])
    current = float(payload["asset"][index]["nav"])
    net_rows.append({"date": payload["asset"][index]["date"], "nav": net_rows[-1]["nav"] * current / previous * (1 - daily_cost)})
beta = calculate_beta_metrics(net_rows, payload["benchmark"], risk_free_rate=params["riskFreeRate"], trading_days_per_year=params["tradingDaysPerYear"])
result.update({key: beta[key] for key in ("beta", "alpha", "correlation")})
print(json.dumps(result, allow_nan=False))
`], { input: JSON.stringify(fixture), encoding: "utf8" });

assert.equal(python.status, 0, python.stderr);
const pythonResult = JSON.parse(python.stdout);
const jsResult = calculateMetrics(fixture.asset, {
  benchmarkRows: fixture.benchmark,
  riskFreeRate: fixture.parameters.riskFreeRate,
  tradingDaysPerYear: fixture.parameters.tradingDaysPerYear,
  annualCost: fixture.parameters.annualCost,
});

const fields = [
  "totalReturn", "grossTotalReturn", "cagr", "annualizedVolatility", "downsideDeviation",
  "sharpe", "sortino", "maxDrawdown", "var95", "cvar95", "var99", "cvar99",
  "costDrag", "endingWealth", "beta", "alpha", "correlation",
];

test("Python and JavaScript metric engines agree on the shared fixture", () => {
  for (const field of fields) {
    const pythonValue = pythonResult[field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)];
    const jsValue = jsResult[field];
    assert.ok(Number.isFinite(pythonValue), `${field} Python result is finite`);
    assert.ok(Number.isFinite(jsValue), `${field} JavaScript result is finite`);
    assert.ok(Math.abs(pythonValue - jsValue) < 1e-10, `${field}: ${pythonValue} != ${jsValue}`);
  }
  assert.equal(pythonResult.observations, jsResult.observations);
  assert.equal(pythonResult.start, jsResult.start);
  assert.equal(pythonResult.end, jsResult.end);
});
