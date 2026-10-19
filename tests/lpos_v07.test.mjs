import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as core from "../apps/lpos/src/engine/portfolio.js";

const legacyHtml = readFileSync("site/lpos-portfolio-lab/legacy-v06.html", "utf8");
const legacyCode = legacyHtml.match(/<script>([\s\S]*?)<\/script>/)?.[1];
const survivalCode = readFileSync("apps/lpos/src/engine/survival-engine.js", "utf8");
assert.ok(legacyCode, "V0.6 regression baseline is present");

function legacyApi() {
  const app = { innerHTML: "", addEventListener() {} };
  const window = { scrollTo() {}, confirm: () => true, addEventListener() {} };
  const context = {
    window,
    document: { getElementById: () => app, querySelector: () => null },
    localStorage: { getItem: () => null, setItem() {} },
    location: { hash: "" },
    history: { replaceState() {} },
    fetch: async () => ({ ok: false, status: 404 }),
    setTimeout() {},
    clearTimeout() {}
  };
  runInNewContext(survivalCode, context);
  runInNewContext(legacyCode + "\nglobalThis.testApi = { defaultScenario, makeFund, normalizeFunds, calculateScenario, runDynamicBacktest, compareDynamicBacktests };\n", context);
  return context.testApi;
}

function makeSeries(count = 520) {
  const dates = [];
  const day = new Date("2024-01-02T00:00:00Z");
  while (dates.length < count) {
    if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6) dates.push(day.toISOString().slice(0, 10));
    day.setUTCDate(day.getUTCDate() + 1);
  }
  const rows = dates.map((date, index) => ({ date, nav: 100 * Math.exp(0.00022 * index + 0.035 * Math.sin(index / 21)) }));
  return { dates, series: { "006208": { symbol: "006208", kind: core.PRICE_GRADE, rows, start: dates[0], end: dates.at(-1), count: rows.length } } };
}
const stable = value => JSON.stringify(value);

test("V0.7 financial core matches the preserved V0.6 calculation for 300 seeded cases", () => {
  const legacy = legacyApi();
  let seed = 812;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  for (let i = 0; i < 300; i++) {
    const scenario = legacy.defaultScenario();
    scenario.ownCapital = 1000 + random() * 1e8;
    scenario.ownCashPct = random() * 100;
    scenario.tradeCostPct = random() * 3;
    scenario.borrowUtilPct = random() * 100;
    scenario.originationFeePct = random() * 5;
    scenario.loanInvestPct = random() * 100;
    scenario.funds = [core.makeFund("006208", random() * 100, random() * 100), core.makeFund("00685L", random() * 100, random() * 100)];
    scenario.funds = core.normalizeFunds(core.normalizeFunds(scenario.funds, "ownWeightPct"), "loanWeightPct");
    for (const fund of scenario.funds) {
      fund.pledgePct = random() * 100;
      fund.ltvPct = random() * 80;
      fund.pledgeStatus = random() > 0.5 ? "blocked" : "assumed";
    }
    assert.equal(stable(core.calculateScenario(scenario)), stable(legacy.calculateScenario(scenario)));
  }
});

test("V0.7 history and A/B/C output match V0.6 and still reject unfair capital", () => {
  const legacy = legacyApi();
  const { dates, series } = makeSeries();
  const scenario = legacy.defaultScenario();
  scenario.funds = [core.makeFund("006208", 100, 100)];
  scenario.funds[0].pledgePct = 100;
  scenario.tradeCostPct = 0.2425;
  scenario.monthlyFreeCashFlow = 8000;
  const options = { from: dates[0], to: dates.at(-1), rebalance: "quarterly", repayment: "conditional_rollover" };
  assert.equal(stable(core.runDynamicBacktest(scenario, series, options)), stable(legacy.runDynamicBacktest(scenario, series, options)));
  const items = [
    { name: "A", scenario },
    { name: "B", scenario: { ...scenario, borrowUtilPct: 50 } },
    { name: "C", scenario: { ...scenario, borrowUtilPct: 0 } }
  ];
  assert.equal(stable(core.compareDynamicBacktests(items, series, options)), stable(legacy.compareDynamicBacktests(items, series, options)));
  assert.throws(() => core.compareDynamicBacktests([items[0], { name: "B", scenario: { ...scenario, ownCapital: 2000000 } }], series, options), /相同自有資金/);
});

test("adjusted price parser rejects too-short series and unsupported symbols", () => {
  const valid = "date,nav,strategy\n2024-01-02,1,buy_hold_006208\n";
  assert.throws(() => core.parsePublishedBuyHoldCsv("006208", valid), /行情筆數異常|有效行情不足/);
  assert.throws(() => core.parsePublishedBuyHoldCsv("00878", valid), /不支援/);
});

test("one report model contains all eight sections, a vector chart, and monthly return rows", async () => {
  const source = readFileSync("apps/lpos/src/report.ts", "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
  const { dates } = makeSeries(90);
  const report = module.buildReport({
    schemaVersion: 1, requestId: "r1", runId: "run-r1", parameterFingerprint: "p".repeat(64), dataFingerprint: "d".repeat(64),
    createdAt: new Date(0).toISOString(), appVersion: "0.7.0", modelVersions: { portfolio: "p", survival: "s" },
    requestedPeriod: { from: "", to: "" }, actualPeriod: { start: dates[0], end: dates.at(-1), sessions: dates.length },
    scenario: { scenarioName: "fixture", ownCapital: 1000000 }, allocation: { accountingDifference: 0, legs: [] },
    backtest: { ok: true, version: "fixture", priceGrade: core.PRICE_GRADE, period: {}, stats: { cagrPct: 2, mddPct: -4, sharpe: 0.5, sortino: 0.7 }, path: dates.map((date, index) => ({ date, twrIndex: 1 + index / 100, nav: 1000 + index, cash: 100, debt: 10 })), events: [], flags: {} },
    benchmark: { name: "同標的無借款基準", scenario: {}, backtest: { period: { start: dates[0], end: dates.at(-1), sessions: dates.length }, stats: { cagrPct: 1, mddPct: -3, sharpe: 0.4, interestPaidTwd: 0 } } },
    comparison: null, comparisonError: "not run", survival: [], reference: { formal_conclusions_blocked: true, validation_layers: {} },
    validationLayers: [], limitations: ["fixture limit"], marketSeries: {}, sourceDigests: { "backtests/buy_hold_006208.csv": "a".repeat(64) }, sourceFiles: {}
  });
  assert.equal(report.blocks.length, 8);
  assert.equal(report.charts.length, 1);
  assert.ok(report.blocks.find(x => x.id === "returns").table.rows.length > 1);
  assert.ok(report.blocks.find(x => x.id === "returns").tables[0].rows.some(row => row[0] === "同標的無借款基準"));
  assert.equal(report.caveat, "研究行情是調整價格代理，非已驗證含息真實可執行融資回測。");
});

test("new UI and workers keep reports local and refuse to use stale results", () => {
  const app = readFileSync("apps/lpos/src/App.tsx", "utf8");
  const research = readFileSync("apps/lpos/src/research.worker.ts", "utf8");
  const pdf = readFileSync("apps/lpos/src/pdf.worker.ts", "utf8");
  const fonts = readFileSync("scripts/build_lpos_pdf_fonts.py", "utf8");
  assert.match(app, /設定已變更，舊研究結果已隱藏/);
  assert.match(app, /new Worker\(new URL\("\.\/research\.worker\.ts"/);
  assert.match(app, /new Worker\(new URL\("\.\/pdf\.worker\.ts"/);
  assert.match(research, /formal_conclusions_blocked/);
  assert.match(research, /crypto\.subtle\.digest/);
  assert.match(pdf, /toBlob\(\)/);
  assert.match(pdf, /NotoSansTC-400\.ttf/);
  assert.match(fonts, /chinese-traditional.*119/);
  assert.doesNotMatch(app, /window\.print\(/);
});
