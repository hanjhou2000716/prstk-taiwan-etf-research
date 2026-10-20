import "./engine/survival-engine.js";
import { calculateScenario, compareDynamicBacktests, DYNAMIC_VERSION, MODEL_VERSION, parsePublishedBuyHoldCsv, runDynamicBacktest, sharedDates, supportedSymbols, validateScenario } from "./engine/portfolio.js";
import type { MarketSeries, ScenarioV1 } from "./engine/portfolio.js";
import type { ResearchRequest, ResearchRun, ValidationLayer } from "./types.js";

const APP_VERSION = "0.7.1";
const workerScope = self as unknown as DedicatedWorkerGlobalScope;
const SURVIVAL_VERSION = "LPOS-integrated-survival-" + workerScope.LPOSSurvival.version;
const APP_BASE = new URL(import.meta.env.BASE_URL, self.location.origin);
const DATA_BASE = new URL(import.meta.env.VITE_DATA_BASE_URL || "../data/", APP_BASE);
const LIMITATIONS = [
  "研究行情是調整價格代理，非已驗證含息真實可執行融資回測。",
  "自由歷史報酬模型採即時出售入帳代理；生存模型另以第二個觀察交易日結算 T+2 應收款，兩者不可互相替代。",
  "質押資格、實際可貸成數、券商追繳執行與到期續借均未獲得契約驗證。",
  "參考 Python 快照使用不同歷史模型及來源，獨立呈現，不與本次自由設定混排。",
  "SHA-256 僅供確認匯出內容一致，不證明行情來源真實性或完整性。"
];
function canonical(value: any): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
  return JSON.stringify(value);
}
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, "0")).join("");
}
function progress(requestId: string, stage: string, percent: number): void {
  self.postMessage({ type: "progress", requestId, stage, percent });
}
function statusOf(value: unknown): ValidationLayer["state"] {
  if (value === "passed") return "passed";
  if (value === "partial") return "partial";
  if (value === "assumption_only") return "assumption_only";
  if (value === "pending_required_layers") return "blocked";
  if (value === "failed" || value === "invalid") return "failed";
  return "not_run";
}
function compareSlots(request: ResearchRequest): Array<{ name: string; scenario: ScenarioV1 }> {
  return (["A", "B", "C"] as const).map(name => {
    const scenario = request.comparison[name];
    if (!scenario) throw new Error("請先在設定中儲存 A、B、C 三個比較方案");
    return { name, scenario };
  });
}
async function run(request: ResearchRequest): Promise<ResearchRun> {
  const currentCheck = validateScenario(request.current);
  if (currentCheck.errors.length) throw new Error("目前情境設定無效：" + currentCheck.errors.join("；"));
  progress(request.requestId, "檢查 ETF 支援範圍與研究設定", 8);
  const main = supportedSymbols(request.current);
  if (main.unsupported.length) throw new Error("目前情境包含無逐日資料或倍數不符標的：" + main.unsupported.join("、") + "。可載入已標示的 006208 示範，或保留設定並稍後再研究。");
  const slots = request.comparison;
  const hasAllSlots = !!slots.A && !!slots.B && !!slots.C;
  let comparisonItems: Array<{ name: string; scenario: ScenarioV1 }> = [];
  let comparisonError: string | null = null;
  if (hasAllSlots) {
    try {
      comparisonItems = compareSlots(request);
      for (const item of comparisonItems) {
        const validity = validateScenario(item.scenario);
        if (validity.errors.length) throw new Error(item.name + " 設定無效：" + validity.errors.join("；"));
        const active = supportedSymbols(item.scenario);
        if (active.unsupported.length) throw new Error(item.name + " 包含未支援標的：" + active.unsupported.join("、"));
      }
    } catch (error) { comparisonItems = []; comparisonError = String((error as Error).message); }
  } else comparisonError = "請儲存 A、B、C 三個方案後，執行公平比較。";
  const allScenarios = [request.current, ...comparisonItems.map(x => x.scenario)];
  const symbols = Array.from(new Set(allScenarios.flatMap(x => supportedSymbols(x).symbols))).sort();
  progress(request.requestId, "載入並驗證調整價格資料", 18);
  const series: Record<string, MarketSeries> = {};
  const sourceDigests: Record<string, string> = {};
  const sourceFiles: Record<string, string> = {};
  for (let i = 0; i < symbols.length; i++) {
    const symbol = symbols[i];
    const path = "backtests/buy_hold_" + symbol + ".csv";
    let text: string;
    if (request.replay) {
      text = request.replay.sourceFiles[path] || "";
      if (!text) throw new Error("重現包缺少 " + path);
      sourceDigests[path] = await sha256(text);
      if (sourceDigests[path] !== request.replay.sourceDigests[path]) throw new Error(path + " SHA-256 與重現包來源指紋不符");
    } else {
      const response = await fetch(new URL(path, DATA_BASE), { cache: "no-store" });
      if (!response.ok) throw new Error(symbol + " 行情檔無法載入，HTTP " + response.status);
      text = await response.text();
      sourceDigests[path] = await sha256(text);
    }
    sourceFiles[path] = text;
    series[symbol] = parsePublishedBuyHoldCsv(symbol, text);
    progress(request.requestId, "已驗證 " + symbol + " 價格序列", 20 + Math.round((i + 1) / symbols.length * 24));
  }
  const reference: any = { formal_conclusions_blocked: true, validation_layers: {}, sourceStatus: "unavailable", message: "稽核資料尚未載入；正式研究結論仍維持受阻。" };
  try {
    let text: string | null = request.replay?.sourceFiles["reconciliation_report.json"] || null;
    if (!request.replay) {
      const response = await fetch(new URL("reconciliation_report.json", DATA_BASE), { cache: "no-store" });
      if (response.ok) text = await response.text();
    }
    if (text) {
      sourceDigests["reconciliation_report.json"] = await sha256(text);
      if (request.replay && sourceDigests["reconciliation_report.json"] !== request.replay.sourceDigests["reconciliation_report.json"]) throw new Error("reconciliation_report.json SHA-256 不符");
      sourceFiles["reconciliation_report.json"] = text;
      Object.assign(reference, JSON.parse(text), { sourceStatus: "loaded" });
    }
  } catch (error) {
    if (request.replay) throw error;
    reference.message = "稽核資料讀取失敗：" + String((error as Error).message);
  }
  try {
    let text: string | null = request.replay?.sourceFiles["v3_observed_snapshots.json"] || null;
    if (!request.replay) {
      const response = await fetch(new URL("research/v3_observed_snapshots.json", APP_BASE), { cache: "no-store" });
      if (response.ok) text = await response.text();
    }
    if (text) {
      sourceDigests["v3_observed_snapshots.json"] = await sha256(text);
      if (request.replay && sourceDigests["v3_observed_snapshots.json"] !== request.replay.sourceDigests["v3_observed_snapshots.json"]) throw new Error("v3_observed_snapshots.json SHA-256 不符");
      sourceFiles["v3_observed_snapshots.json"] = text;
      const snapshot = JSON.parse(text);
      if (snapshot.schemaVersion !== 2 || snapshot.webVersion !== "0.2.0" || !Array.isArray(snapshot.cases) || snapshot.cases.length !== 10 || snapshot.loanRenewalVerified !== false) throw new Error("參考快照欄位或版本不符");
      reference.snapshot = { schemaVersion: snapshot.schemaVersion, researchVersion: snapshot.researchVersion, sourceGrade: snapshot.sourceGrade, period: { start: snapshot.marketData.start, end: snapshot.marketData.end, sessions: snapshot.marketData.tradeSessions }, loanRenewalVerified: snapshot.loanRenewalVerified, cases: snapshot.cases, limitations: snapshot.limitations };
    }
  } catch (error) {
    if (request.replay) throw error;
    reference.snapshotError = String((error as Error).message);
  }
  progress(request.requestId, "執行報酬與公平比較模型", 48);
  const dates = sharedDates([request.current], series, request.requestedPeriod);
  const backtest = runDynamicBacktest(request.current, series, { ...request.research, dates });
  const benchmarkScenario: ScenarioV1 = {
    ...request.current,
    scenarioName: request.current.scenarioName + "｜同標的無借款基準",
    borrowUtilPct: 0,
    loanInvestPct: 0
  };
  const benchmark = {
    name: "同標的無借款基準",
    scenario: benchmarkScenario,
    backtest: runDynamicBacktest(benchmarkScenario, series, { ...request.research, dates })
  };
  let comparison: ReturnType<typeof compareDynamicBacktests> | null = null;
  if (comparisonItems.length === 3) {
    try { comparison = compareDynamicBacktests(comparisonItems, series, { ...request.research, from: request.requestedPeriod.from, to: request.requestedPeriod.to }); }
    catch (error) { comparisonError = String((error as Error).message); }
  }
  progress(request.requestId, "執行獨立 T+2 生存分析", 66);
  const initial = calculateScenario(request.current);
  const settings = workerScope.LPOSSurvival.validate(request.survivalSettings);
  const svDates = sharedDates([request.current], series, request.requestedPeriod);
  const scenarios = workerScope.LPOSSurvival.scenarios(settings);
  const survival = scenarios.map(([name, config]) => ({ name, result: workerScope.LPOSSurvival.run(request.current, initial, series, svDates, config) }));
  progress(request.requestId, "建立資料指紋與一致性檢查", 88);
  const sortedDigests = Object.keys(sourceDigests).sort().map(key => key + ":" + sourceDigests[key]).join("\n");
  const dataFingerprint = await sha256(sortedDigests);
  if (request.replay && dataFingerprint !== await sha256(Object.keys(request.replay.sourceDigests).sort().map(key => key + ":" + request.replay!.sourceDigests[key]).join("\n"))) throw new Error("重現包資料清單與重新計算的指紋不一致");
  const parameterFingerprint = await sha256(canonical({ current: request.current, comparison: request.comparison, requestedPeriod: request.requestedPeriod, research: request.research, survivalSettings: request.survivalSettings }));
  const now = new Date().toISOString(), runId = "run-" + request.requestId;
  const layers: ValidationLayer[] = [
    { key: "配置驗證", state: "passed", detail: currentCheck.warnings.length ? "設定合法；含有情境假設警示。" : "欄位範圍、標的唯一性及權重總和通過。" },
    { key: "資產負債恆等式", state: Math.abs(initial.accountingDifference) < 0.01 ? "passed" : "failed", detail: "起始淨資產＝自有資金－初始交易與融資費用；差額 " + initial.accountingDifference.toFixed(4) + " 元。" },
    { key: "價格檔結構", state: "passed", detail: symbols.length + " 檔行情依日期排序、價格為正並且逐列驗證。" },
    { key: "同標的無借款比較基準", state: benchmark.backtest.ok ? "passed" : "failed", detail: "使用相同 ETF、日期、自有本金、外部現金流及交易成本；借款動用與再投入均為 0。" },
    { key: "總報酬與公司行動", state: statusOf(reference.validation_layers?.corporate_action_validation), detail: String(reference.validation_layers?.corporate_action_validation || "稽核報告未載入") },
    { key: "回測引擎獨立驗證", state: statusOf(reference.validation_layers?.backtest_engine_validation), detail: String(reference.validation_layers?.backtest_engine_validation || "尚未執行獨立引擎驗證") },
    { key: "前視偏誤檢查", state: statusOf(reference.validation_layers?.lookahead_validation), detail: String(reference.validation_layers?.lookahead_validation || "尚未執行") },
    { key: "Python／JavaScript 對照", state: statusOf(reference.validation_layers?.python_js_parity), detail: String(reference.validation_layers?.python_js_parity || "尚未執行") },
    { key: "券商條件與交易執行", state: "assumption_only", detail: "質押資格、維持率處置、即時成交與續借尚未以券商契約驗證。" },
    { key: "正式結論", state: reference.formal_conclusions_blocked ? "blocked" : "not_run", detail: "reconciliation_report.json formal_conclusions_blocked=" + String(reference.formal_conclusions_blocked) }
  ];
  return {
    schemaVersion: 1, requestId: request.requestId, runId, parameterFingerprint, dataFingerprint, createdAt: now,
    appVersion: APP_VERSION, modelVersions: { portfolio: MODEL_VERSION + " / " + DYNAMIC_VERSION, survival: SURVIVAL_VERSION },
    requestedPeriod: request.requestedPeriod, actualPeriod: { start: backtest.period.start, end: backtest.period.end, sessions: backtest.period.sessions },
    scenario: request.current, allocation: initial, backtest, benchmark, comparison, comparisonError, survival, reference,
    validationLayers: layers, limitations: LIMITATIONS, marketSeries: series, sourceDigests, sourceFiles
  };
}
self.addEventListener("message", async (event: MessageEvent) => {
  if (event.data?.type !== "run") return;
  const request = event.data.request as ResearchRequest;
  try {
    const result = await run(request);
    progress(request.requestId, "研究完成，報告可供檢視", 100);
    self.postMessage({ type: "complete", requestId: request.requestId, result });
  } catch (error) {
    self.postMessage({ type: "error", requestId: request.requestId, message: String((error as Error).message || error) });
  }
});
