import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CATALOG, MODEL_VERSION, backtestCsv, calculateScenario, makeFund, normalizeFunds, validateScenario } from "./engine/portfolio.js";
import type { FundV1, ScenarioV1 } from "./engine/portfolio.js";
import { buildReport } from "./report.js";
import { createDefaultWorkspace, exportScenario, exportWorkspace, loadWorkspace, persistWorkspace, previewImport, validateWorkspace } from "./workspace.js";
import type { ImportPreview, ResearchBundleV1, ResearchReportV1, ResearchRequest, ResearchRun, SlotName, WorkspaceV2 } from "./types.js";

const APP_VERSION = "0.7.0";
const CAVEAT = "研究行情是調整價格代理，非已驗證含息真實可執行融資回測。";
const NAV: Array<{ id: string; label: string; short: string; icon: string }> = [
  { id: "overview", label: "研究總覽", short: "總覽", icon: "◫" },
  { id: "setup", label: "設定與配置", short: "設定", icon: "◈" },
  { id: "research", label: "歷史研究", short: "研究", icon: "↗" },
  { id: "compare", label: "A/B/C 比較", short: "比較", icon: "⇄" },
  { id: "report", label: "研究報告", short: "報告", icon: "▤" }
];
const TITLES: Record<string, [string, string]> = {
  overview: ["研究總覽", "先核對報酬、風險、現金與模型限制，再決定要深入檢視的方案。"],
  setup: ["設定與配置", "調整自有資金、每檔 ETF 權重、質押假設、融資條件及生存情境。"],
  research: ["歷史研究", "以共同日期與可驗證的資料檔，執行報酬模型與獨立 T+2 生存模型。"],
  compare: ["A/B/C 公平比較", "三方案使用相同自有本金、每月外部淨現金流及共同交易日期。"],
  report: ["研究報告", "網頁、PDF 與重現包共用同一次研究結果及相同指紋。"]
};
const FIELDS: Array<[keyof ScenarioV1, string, number, number, number, string]> = [
  ["ownCapital", "自有資金", 1, 1000000000000, 10000, "NT$"],
  ["ownCashPct", "自有資金保留現金", 0, 100, 0.1, "%"],
  ["tradeCostPct", "每筆買進與賣出成本", 0, 20, 0.0001, "%"],
  ["borrowUtilPct", "借款動用比例", 0, 100, 0.1, "%"],
  ["loanInvestPct", "借款再投入比例", 0, 100, 0.1, "%"],
  ["originationFeePct", "融資開辦費", 0, 20, 0.0001, "%"],
  ["aprPct", "借款年利率假設", 0, 50, 0.01, "%"],
  ["termMonths", "借款期間", 1, 360, 1, "月"],
  ["monthlyFreeCashFlow", "每月外部淨現金流", -1000000000, 1000000000, 1000, "NT$/月"],
  ["monthlyLivingExpense", "每月必要支出", 0, 1000000000, 1000, "NT$/月"],
  ["minReserveMonths", "必要預備金月數", 0, 36, 1, "月"],
  ["shockPct", "單步市場下跌壓力", 0, 100, 1, "%"]
];
const SLOT_NAMES: SlotName[] = ["A", "B", "C"];
const money = (value: unknown): string => typeof value === "number" && Number.isFinite(value) ? "NT$ " + Math.round(value).toLocaleString("en-US") : "無資料";
const percent = (value: unknown, digits = 2): string => typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) + "%" : "無資料";
const valueOf = (value: unknown): string => typeof value === "number" && Number.isFinite(value) ? String(value) : "";
function download(filename: string, content: string | Blob, mime: string): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function routeFromHash(): string {
  const hash = location.hash.replace(/^#/, "");
  const aliases: Record<string, string> = { portfolio: "setup", financing: "setup", survival: "setup", backtest: "research", stress: "setup", sources: "report" };
  const route = aliases[hash] || hash;
  return NAV.some(x => x.id === route) ? route : "overview";
}
function storageInit(): { workspace: WorkspaceV2; notice: string } {
  try { return loadWorkspace(); }
  catch { return { workspace: createDefaultWorkspace(), notice: "瀏覽器儲存功能不可用；資料只保留在目前分頁，請定期下載工作區 JSON。" }; }
}
function replayMatches(expected: ResearchRun, actual: ResearchRun): string {
  if (expected.requestId !== actual.requestId || expected.runId !== actual.runId) return "研究識別碼不一致。";
  if (expected.parameterFingerprint !== actual.parameterFingerprint || expected.dataFingerprint !== actual.dataFingerprint) return "重新計算的參數或資料指紋不一致。";
  if (expected.actualPeriod.start !== actual.actualPeriod.start || expected.actualPeriod.end !== actual.actualPeriod.end || expected.actualPeriod.sessions !== actual.actualPeriod.sessions) return "重新計算的實際期間不一致。";
  const keys = ["cagrPct", "mddPct", "sharpe", "sortino", "endNetAssetTwd", "interestPaidTwd"] as const;
  for (const key of keys) {
    const a = expected.backtest.stats?.[key], b = actual.backtest.stats?.[key];
    if (a == null && b == null) continue;
    if (typeof a !== "number" || typeof b !== "number" || Math.abs(a - b) > Math.max(1e-8, Math.abs(a) * 1e-10)) return "重新計算的 " + key + " 與研究包內數值不同。";
  }
  if (!expected.benchmark || !actual.benchmark) return "研究包缺少同標的無借款基準。";
  for (const key of ["cagrPct", "mddPct", "sharpe", "endNetAssetTwd", "interestPaidTwd"] as const) {
    const a = expected.benchmark.backtest.stats?.[key], b = actual.benchmark.backtest.stats?.[key];
    if (a == null && b == null) continue;
    if (typeof a !== "number" || typeof b !== "number" || Math.abs(a - b) > Math.max(1e-8, Math.abs(a) * 1e-10)) return "重新計算的無借款基準 " + key + " 與研究包內數值不同。";
  }
  if (expected.survival.length !== actual.survival.length) return "生存情境數量不一致。";
  for (let i = 0; i < expected.survival.length; i++) {
    const a = expected.survival[i], b = actual.survival[i];
    if (a.name !== b.name || a.result.completed !== b.result.completed || a.result.horizonCovered !== b.result.horizonCovered || a.result.firstHard?.date !== b.result.firstHard?.date || Math.abs((a.result.unpaidLoan || 0) - (b.result.unpaidLoan || 0)) > 0.01) return "生存情境「" + a.name + "」重新計算不一致。";
  }
  if (!!expected.comparison !== !!actual.comparison || expected.comparison?.rankingEligible !== actual.comparison?.rankingEligible) return "A/B/C 比較完整性狀態不一致。";
  return "";
}
function Field(props: { id: string; label: string; value: string | number; type?: string; min?: number; max?: number; step?: number; suffix?: string; note?: string; error?: string; onChange: (value: string) => void }) {
  return <label className="field" htmlFor={props.id}>
    <span className="field-title">{props.label}</span>
    <span className="input-wrap"><input id={props.id} name={props.id} type={props.type || "number"} value={props.value} min={props.min} max={props.max} step={props.step} inputMode={props.type === "date" ? undefined : "decimal"} onChange={e => props.onChange(e.currentTarget.value)} aria-invalid={!!props.error} aria-describedby={props.error ? props.id + "-error" : props.note ? props.id + "-note" : undefined} />{props.suffix && <span className="suffix">{props.suffix}</span>}</span>
    {props.error && <span className="field-error" id={props.id + "-error"}>{props.error}</span>}
    {!props.error && props.note && <span className="field-note" id={props.id + "-note"}>{props.note}</span>}
  </label>;
}
function Chart({ run }: { run: ResearchRun }) {
  const path = run.backtest.path || [];
  const [selectedIndex, setSelectedIndex] = useState(0);
  if (path.length < 2) return <div className="empty compact">研究沒有足夠的有效路徑可畫圖。</div>;
  const reduced = path.filter((_: any, index: number) => index === 0 || index === path.length - 1 || index % Math.max(1, Math.ceil(path.length / 150)) === 0);
  const values = reduced.map((x: any) => x.twrIndex);
  const low = Math.min(...values), high = Math.max(...values), span = Math.max(high - low, 0.0001);
  const points = values.map((value: number, index: number) => (12 + index * 676 / Math.max(1, values.length - 1)) + "," + (138 - (value - low) / span * 118)).join(" ");
  const activeIndex = Math.min(selectedIndex, reduced.length - 1);
  const selected = reduced[activeIndex] || reduced[0];
  const selectByPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    setSelectedIndex(Math.round(fraction * (reduced.length - 1)));
  };
  const moveSelection = (event: React.KeyboardEvent<SVGSVGElement>) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") setSelectedIndex(value => Math.max(0, value - 1));
    else if (event.key === "ArrowRight" || event.key === "ArrowUp") setSelectedIndex(value => Math.min(reduced.length - 1, value + 1));
    else if (event.key === "Home") setSelectedIndex(0);
    else if (event.key === "End") setSelectedIndex(reduced.length - 1);
    else return;
    event.preventDefault();
  };
  const markerX = 12 + activeIndex * 676 / Math.max(1, values.length - 1);
  const markerY = 138 - (values[activeIndex] - low) / span * 118;
  const lastRows = path.slice(-12).reverse();
  return <section className="panel chart-panel">
    <div className="panel-head"><div><h3>時間加權淨值路徑</h3><p>起點設為 1.00｜不含外部淨現金流</p></div><span className="tag">調整價格代理</span></div>
    <svg viewBox="0 0 700 160" role="group" tabIndex={0} aria-label={"時間加權淨值路徑，由 " + run.actualPeriod.start + " 至 " + run.actualPeriod.end + "；可用方向鍵檢視數值"} onPointerMove={selectByPointer} onPointerDown={selectByPointer} onKeyDown={moveSelection}>
      <line x1="12" x2="688" y1="140" y2="140" className="axis" /><line x1="12" x2="688" y1="80" y2="80" className="gridline" />
      <polyline points={points} className="chart-line" aria-hidden="true" /><circle cx={markerX} cy={markerY} r="5" className="chart-marker" aria-hidden="true" />
      <text x="12" y="155" className="chart-label">{run.actualPeriod.start}</text><text x="688" y="155" textAnchor="end" className="chart-label">{run.actualPeriod.end}</text>
      <text x="12" y="17" className="chart-label">指數 {low.toFixed(2)} – {high.toFixed(2)}</text>
    </svg>
    <output id="chart-selection" className="chart-selection" aria-live="polite">{selected.date}｜時間加權指數 {Number(selected.twrIndex).toFixed(4)}｜淨資產 {money(selected.nav)}｜現金 {money(selected.cash)}｜借款 {money(selected.debt)}</output>
    <details><summary>檢視最近 12 筆數值</summary><div className="table-scroll"><table><thead><tr><th>日期</th><th>淨資產</th><th>現金</th><th>借款</th><th>時間加權指數</th></tr></thead><tbody>{lastRows.map((x: any) => <tr key={x.date}><td>{x.date}</td><td>{money(x.nav)}</td><td>{money(x.cash)}</td><td>{money(x.debt)}</td><td>{x.twrIndex.toFixed(4)}</td></tr>)}</tbody></table></div></details>
  </section>;
}
function StatusPill({ state }: { state: string }) {
  const label: Record<string, string> = { passed: "通過", partial: "部分完成", not_run: "未執行", assumption_only: "情境假設", blocked: "正式結論受阻", failed: "失敗" };
  return <span className={"status-pill status-" + state}>{label[state] || state}</span>;
}
function Metric(props: { label: string; value: string; detail: string; tone?: "risk" }) { return <section className={"panel metric " + (props.tone || "")}><span>{props.label}</span><strong>{props.value}</strong><small>{props.detail}</small></section>; }
function Info(props: { title: string; body: string }) { return <section className="panel info"><h3>{props.title}</h3><p>{props.body}</p></section>; }
function Progress(props: { percent: number; stage: string }) { return <div className="progress"><div className="progress-label"><span>{props.stage}</span><strong>{props.percent}%</strong></div><div className="progress-track"><span style={{ width: props.percent + "%" }} /></div></div>; }

export function App() {
  const loaded = useMemo(storageInit, []);
  const [workspace, setWorkspace] = useState<WorkspaceV2>(loaded.workspace);
  const [route, setRoute] = useState(routeFromHash);
  const [notice, setNotice] = useState(loaded.notice);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({});
  const [run, setRun] = useState<ResearchRun | null>(null);
  const [report, setReport] = useState<ResearchReportV1 | null>(null);
  const [stale, setStale] = useState(false);
  const [runStatus, setRunStatus] = useState<"idle" | "running" | "complete" | "error" | "cancelled">("idle");
  const [progress, setProgress] = useState({ stage: "", percent: 0 });
  const [runError, setRunError] = useState("");
  const [busyPdf, setBusyPdf] = useState(false);
  const [importPreviewState, setImportPreviewState] = useState<ImportPreview | null>(null);
  const [replayMessage, setReplayMessage] = useState("");
  const [subtab, setSubtab] = useState<"portfolio" | "survival" | "data">("portfolio");
  const [savedMessage, setSavedMessage] = useState("");
  const researchWorker = useRef<Worker | null>(null);
  const activeResearchId = useRef<string | null>(null);
  const pdfWorker = useRef<Worker | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const scenario = workspace.current;
  const calc = useMemo(() => calculateScenario(scenario), [scenario]);
  const validation = useMemo(() => validateScenario(scenario), [scenario]);
  const activeTitle = TITLES[route] || TITLES.overview;
  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    const error = persistWorkspace(workspace);
    if (error) setSavedMessage(error);
    else setSavedMessage("");
  }, [workspace]);
  useEffect(() => () => { researchWorker.current?.terminate(); pdfWorker.current?.terminate(); }, []);
  const navigate = useCallback((next: string) => {
    setRoute(next); history.replaceState(null, "", "#" + next);
  }, []);
  const invalidateResults = useCallback(() => {
    if (run || runStatus === "running") setStale(true);
    if (pdfWorker.current) {
      pdfWorker.current.terminate(); pdfWorker.current = null; setBusyPdf(false);
    }
  }, [run, runStatus]);
  const updateWorkspace = useCallback((next: WorkspaceV2) => {
    setWorkspace({ ...next, updatedAt: new Date().toISOString() });
    invalidateResults();
    setNotice("");
  }, [invalidateResults]);
  const updateScenario = useCallback((next: ScenarioV1) => updateWorkspace({ ...workspace, current: next }), [updateWorkspace, workspace]);
  const numberChange = (key: string, raw: string, save: (value: number) => void) => {
    setDraft(previous => ({ ...previous, [key]: raw }));
    if (raw.trim() === "" || !Number.isFinite(Number(raw))) {
      setDraftErrors(previous => ({ ...previous, [key]: "請輸入有效數字；空白不會自動當成 0。" }));
      invalidateResults();
      return;
    }
    setDraftErrors(previous => { const next = { ...previous }; delete next[key]; return next; });
    save(Number(raw));
  };
  const fieldValue = (key: string, value: number): string => draft[key] ?? valueOf(value);
  const setCurrentField = (key: keyof ScenarioV1, raw: string) => numberChange("current." + key, raw, value => updateScenario({ ...scenario, [key]: value }));
  const setResearchField = (key: keyof WorkspaceV2["research"], raw: string) => {
    if (key === "from" || key === "to") {
      updateWorkspace({ ...workspace, research: { ...workspace.research, [key]: raw } });
      setDraftErrors(prev => { const next = { ...prev }; delete next["research." + key]; return next; });
    } else numberChange("research." + key, raw, value => updateWorkspace({ ...workspace, research: { ...workspace.research, [key]: value } }));
  };
  const setSurvivalField = (key: string, raw: string) => {
    if (key === "rollover" || key === "marginPolicy" || key === "prefund") {
      const value = key === "prefund" ? raw === "true" : raw;
      updateWorkspace({ ...workspace, survival: { ...workspace.survival, [key]: value } as any });
    } else numberChange("survival." + key, raw, value => updateWorkspace({ ...workspace, survival: { ...workspace.survival, [key]: value } }));
  };
  const setFundField = (fundId: string, key: keyof FundV1, raw: string) => {
    const fund = scenario.funds.find(item => item.id === fundId);
    if (!fund) return;
    if (key === "symbol") {
      const found = CATALOG.find(item => item.symbol === raw);
      if (found) updateScenario({ ...scenario, funds: scenario.funds.map(item => item.id === fundId ? { ...item, symbol: found.symbol, name: found.name, factor: found.factor } : item) });
    } else if (key === "pledgeStatus") updateScenario({ ...scenario, funds: scenario.funds.map(item => item.id === fundId ? { ...item, pledgeStatus: raw as FundV1["pledgeStatus"] } : item) });
    else numberChange("fund." + fundId + "." + key, raw, value => updateScenario({ ...scenario, funds: scenario.funds.map(item => item.id === fundId ? { ...item, [key]: value } : item) }));
  };
  const showRun = !!run && !stale;
  const startResearch = () => {
    if (runStatus === "running") {
      activeResearchId.current = null;
      researchWorker.current?.terminate(); researchWorker.current = null;
      setRunStatus("cancelled"); setProgress({ stage: "研究已取消；目前沒有新的研究結果。", percent: 0 });
      return;
    }
    if (Object.keys(draftErrors).length) { setRunError("先修正表單中的空白或無效欄位，再開始研究。"); navigate("setup"); return; }
    const issues = validateScenario(scenario).errors;
    if (issues.length) { setRunError(issues.join("；")); navigate("setup"); return; }
    const requestId = crypto.randomUUID(), frozenWorkspace = JSON.parse(JSON.stringify(workspace)) as WorkspaceV2;
    activeResearchId.current = requestId;
    setReplayMessage("");
    const request: ResearchRequest = {
      schemaVersion: 1, requestId, createdAt: new Date().toISOString(), appVersion: APP_VERSION,
      portfolioModelVersion: MODEL_VERSION, survivalModelVersion: "LPOS-integrated-survival-0.5.0",
      workspace: frozenWorkspace, current: frozenWorkspace.current, comparison: frozenWorkspace.saved,
      requestedPeriod: { from: frozenWorkspace.research.from, to: frozenWorkspace.research.to },
      research: frozenWorkspace.research, survivalSettings: frozenWorkspace.survival
    };
    setRun(null); setReport(null); setStale(false); setRunError(""); setRunStatus("running"); setProgress({ stage: "建立不可變研究請求", percent: 2 });
    const worker = new Worker(new URL("./research.worker.ts", import.meta.url), { type: "module" });
    researchWorker.current = worker;
    worker.onmessage = event => {
      if (event.data.requestId !== requestId || activeResearchId.current !== requestId) return;
      if (event.data.type === "progress") setProgress({ stage: event.data.stage, percent: event.data.percent });
      if (event.data.type === "complete") {
        activeResearchId.current = null;
        const result = event.data.result as ResearchRun;
        setRun(result); setReport(buildReport(result)); setRunStatus("complete"); setProgress({ stage: "研究完成", percent: 100 });
        worker.terminate(); researchWorker.current = null;
      }
      if (event.data.type === "error") {
        activeResearchId.current = null;
        setRunError(event.data.message); setRunStatus("error"); worker.terminate(); researchWorker.current = null;
      }
    };
    worker.onerror = event => {
      if (activeResearchId.current !== requestId) return;
      activeResearchId.current = null;
      setRunError("研究 Worker 發生錯誤：" + event.message); setRunStatus("error"); worker.terminate(); researchWorker.current = null;
    };
    worker.postMessage({ type: "run", request });
  };
  const changeSlot = (slot: SlotName, mode: "save" | "load") => {
    if (mode === "save") updateWorkspace({ ...workspace, saved: { ...workspace.saved, [slot]: JSON.parse(JSON.stringify(scenario)) } });
    else if (workspace.saved[slot]) updateScenario(JSON.parse(JSON.stringify(workspace.saved[slot])));
  };
  const loadExample = () => {
    const example = { ...scenario, scenarioName: "示範｜富邦台50調整價格路徑" };
    const fund = makeFund("006208", 100, 100);
    fund.pledgePct = 100;
    updateScenario({ ...example, funds: [fund] });
    setDraft({}); setDraftErrors({});
    setNotice("已載入單檔 006208 示範設定；只在你點選後更新目前情境。");
  };
  const normalize = (key: "ownWeightPct" | "loanWeightPct") => updateScenario({ ...scenario, funds: normalizeFunds(scenario.funds, key) });
  const addFund = () => {
    if (scenario.funds.length >= 12) return;
    const candidate = CATALOG.find(item => !scenario.funds.some(fund => fund.symbol === item.symbol)) || CATALOG[0];
    updateScenario({ ...scenario, funds: [...scenario.funds, makeFund(candidate.symbol, 0, 0)] });
  };
  const replayBundle = (bundle: ResearchBundleV1) => {
    const request: ResearchRequest = {
      ...bundle.request,
      replay: { sourceFiles: bundle.run.sourceFiles, sourceDigests: bundle.run.sourceDigests }
    };
    const requestId = request.requestId;
    activeResearchId.current = requestId;
    setRun(null); setReport(null); setStale(false); setRunError("");
    setReplayMessage("");
    setRunStatus("running"); setProgress({ stage: "使用研究包內封存價格重新執行模型", percent: 2 });
    const worker = new Worker(new URL("./research.worker.ts", import.meta.url), { type: "module" });
    researchWorker.current = worker;
    worker.onmessage = event => {
      if (event.data.requestId !== requestId || activeResearchId.current !== requestId) return;
      if (event.data.type === "progress") setProgress({ stage: event.data.stage, percent: event.data.percent });
      if (event.data.type === "error") {
        activeResearchId.current = null;
        setRunError("研究包重現失敗：" + event.data.message); setRunStatus("error"); worker.terminate(); researchWorker.current = null;
      }
      if (event.data.type === "complete") {
        activeResearchId.current = null;
        const result = event.data.result as ResearchRun;
        const mismatch = replayMatches(bundle.run, result);
        if (mismatch) {
          setRunError("重現結果未通過核對：" + mismatch + "；沒有將研究包內舊數值標示為新結果。");
          setRunStatus("error");
        } else {
          setRun(result); setReport(buildReport(result)); setRunStatus("complete");
          setReplayMessage("研究包已使用封存價格與相同版本模型重新計算；參數、資料指紋與核心指標一致。來源真實性仍未由校驗碼證明。");
        }
        worker.terminate(); researchWorker.current = null;
        navigate("report");
      }
    };
    worker.onerror = event => {
      if (activeResearchId.current !== requestId) return;
      activeResearchId.current = null;
      setRunError("重現 Worker 發生錯誤：" + event.message); setRunStatus("error"); worker.terminate(); researchWorker.current = null; navigate("report");
    };
    worker.postMessage({ type: "run", request });
  };
  const applyImport = () => {
    if (!importPreviewState) return;
    if (importPreviewState.type === "bundle" && importPreviewState.bundle) {
      const bundle = importPreviewState.bundle;
      const next = validateWorkspace(bundle.request.workspace);
      setWorkspace(next); setStale(false); setDraft({}); setDraftErrors({});
      setImportPreviewState(null);
      replayBundle(bundle);
      return;
    }
    if (importPreviewState.type === "workspace" && importPreviewState.workspace) updateWorkspace(importPreviewState.workspace);
    else updateScenario(importPreviewState.scenario);
    setDraft({}); setDraftErrors({}); setImportPreviewState(null);
  };
  const selectImportFile = async (file?: File) => {
    if (!file) return;
    try { setImportPreviewState(await previewImport(await file.text())); setRunError(""); }
    catch (error) { setRunError("匯入失敗：" + String((error as Error).message)); }
    if (fileInput.current) fileInput.current.value = "";
  };
  const requestPdf = () => {
    if (!showRun || !report || busyPdf) return;
    setBusyPdf(true); setRunError("");
    const worker = new Worker(new URL("./pdf.worker.ts", import.meta.url), { type: "module" });
    pdfWorker.current = worker;
    worker.onmessage = event => {
      if (pdfWorker.current !== worker) return;
      if (event.data.type === "complete") {
        download(event.data.fileName, event.data.blob, "application/pdf");
        setBusyPdf(false); worker.terminate(); pdfWorker.current = null;
      } else if (event.data.type === "error") {
        setRunError("PDF 產生失敗，請重試；研究結果仍保留。" + event.data.message);
        setBusyPdf(false); worker.terminate(); pdfWorker.current = null;
      }
    };
    worker.onerror = event => {
      if (pdfWorker.current !== worker) return;
      setRunError("PDF Worker 無法完成：" + event.message); setBusyPdf(false); worker.terminate(); pdfWorker.current = null;
    };
    worker.postMessage({ type: "render", report });
  };
  const exportBundle = () => {
    if (!showRun || !run || !report) return;
    const request: ResearchRequest = {
      schemaVersion: 1, requestId: run.requestId, createdAt: run.createdAt, appVersion: run.appVersion,
      portfolioModelVersion: run.modelVersions.portfolio, survivalModelVersion: run.modelVersions.survival,
      workspace, current: run.scenario, comparison: workspace.saved, requestedPeriod: run.requestedPeriod,
      research: workspace.research, survivalSettings: workspace.survival
    };
    const bundle: ResearchBundleV1 = { schemaVersion: 1, type: "LPOS_RESEARCH_BUNDLE", request, run, report, exportedAt: new Date().toISOString() };
    download("LPOS-研究重現包-" + run.runId + ".json", JSON.stringify(bundle, null, 2), "application/json;charset=utf-8");
  };
  const exportCsv = () => {
    if (showRun && run) download("LPOS-逐日帳務-" + run.runId + ".csv", backtestCsv(run.backtest), "text/csv;charset=utf-8");
  };
  const reportBlock = (block: ResearchReportV1["blocks"][number]) => <section className="panel report-block" id={block.id} key={block.id}>
    <div className="panel-head"><h2>{block.title}</h2>{block.status && <StatusPill state={block.status} />}</div>
    <div className="narrative">{block.narrative.map((line, i) => <p key={i}>{line}</p>)}</div>
    {[...(block.table ? [block.table] : []), ...(block.tables || [])].map((table, tableIndex) => <div className="table-scroll" key={tableIndex}><table><thead><tr>{table.headers.map((head, i) => <th key={i}>{head}</th>)}</tr></thead><tbody>{table.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>)}
    {block.links?.map(link => <a className="source-link" href={link.url} key={link.url} target="_blank" rel="noreferrer">{link.label}</a>)}
  </section>;

  const renderOverview = () => <div className="stack">
    <div className="hero-grid">
      <section className="panel hero"><span className="eyebrow">LPOS PORTFOLIO LAB · V0.7</span><h2>讓每個結果都能回到它的資料、參數與模型。</h2><p>同一份研究結果支援網頁檢視、PDF 下載和 JSON 重現包；更改設定後，舊研究會立即標示過期。</p><div className="hero-actions"><button className="button primary" onClick={() => navigate("setup")}>檢視目前設定</button><button className="button" onClick={() => navigate("research")}>執行研究</button></div></section>
      <section className="panel caveat-panel"><span className="tag tag-warn">行情與執行限制</span><p>{CAVEAT}</p><p>正式結論狀態依資料稽核各層顯示。測試通過不會解除資料證據的正式結論限制。</p></section>
    </div>
    {notice && <div className="notice" role="status">{notice}</div>}
    {savedMessage && <div className="notice warning" role="status">{savedMessage}</div>}
    {showRun && run && report ? <>
      <div className="status-row"><div><StatusPill state={run.reference.formal_conclusions_blocked ? "blocked" : "partial"} /> <span>最近研究：{run.actualPeriod.start} 至 {run.actualPeriod.end}</span></div><span>資料指紋 {run.dataFingerprint.slice(0, 12)}…</span></div>
      <div className="metric-grid">
        <Metric label="時間加權 CAGR" value={percent(run.backtest.stats.cagrPct)} detail="按實際回測期間年化" />
        <Metric label="同標的無借款 CAGR" value={percent(run.benchmark.backtest.stats.cagrPct)} detail="相同本金、外部現金流與期間" />
        <Metric label="最大回撤" value={percent(run.backtest.stats.mddPct)} detail="使用時間加權淨值" tone="risk" />
        <Metric label="最差生存情境" value={run.survival.find(x => !!x.result.firstHard)?.result.firstHard?.date || "期間內未觀察到"} detail="不是未來存活保證" tone="risk" />
        <Metric label="完整生存情境" value={run.survival.filter(x => x.result.completed && x.result.horizonCovered).length + " / " + run.survival.length} detail="完成數不是存活機率" />
      </div>
      <Chart run={run} />
      <section className="panel"><div className="panel-head"><h2>證據與執行限制</h2><button className="text-button" onClick={() => navigate("report")}>開啟完整報告 →</button></div><div className="layer-grid">{run.validationLayers.map(layer => <div className="layer" key={layer.key}><div><strong>{layer.key}</strong><StatusPill state={layer.state} /></div><p>{layer.detail}</p></div>)}</div></section>
    </> : <section className="panel empty-state"><div className="empty-icon">◌</div><h2>目前沒有新鮮的研究結果</h2><p>{stale ? "設定已變更。重新執行研究後，報酬、生存與報告才會更新。" : runStatus === "running" ? progress.stage : "先檢查目前的配置，再選擇歷史區間並開始研究。"}</p>{runStatus === "running" && <Progress percent={progress.percent} stage={progress.stage} />}{runError && <p className="error-banner" role="alert">{runError}</p>}<div className="hero-actions"><button className="button primary" onClick={() => navigate("setup")}>設定與配置</button><button className="button" onClick={() => navigate("research")}>前往歷史研究</button></div></section>}
    <div className="disclosure-grid"><Info title="報酬模型" body="調整價格代理、即時出售入帳近似、外部現金流以時間加權方式排除。" /><Info title="生存模型" body="單獨處理每日利息、T+2 應收款、限制現金、到期清償與條件續借。" /><Info title="研究證據" body="資料稽核的部分、未執行、假設與正式結論受阻狀態會分層呈現。" /></div>
  </div>;

  const renderSetup = () => <div className="stack">
    <div className="subnav" role="tablist" aria-label="設定類別">{[["portfolio","配置與融資"],["survival","生存假設"],["data","匯入與備份"]].map(([key,label]) => <button role="tab" aria-selected={subtab === key} className={subtab === key ? "selected" : ""} key={key} onClick={() => setSubtab(key as any)}>{label}</button>)}</div>
    {subtab === "portfolio" && <>
      <section className="panel"><div className="panel-head"><div><h2>目前情境</h2><p>設定暫時空白時會保留欄位錯誤，不會自動改成 0。</p></div><button className="button slim" onClick={loadExample}>載入可回測示範</button></div>
        <div className="form-grid"><Field id="scenarioName" type="text" label="情境名稱" value={scenario.scenarioName} onChange={value => updateScenario({ ...scenario, scenarioName: value.slice(0, 60) })} />{FIELDS.map(([key, label, min, max, step, suffix]) => <Field key={key} id={"current-" + key} label={label} value={fieldValue("current." + key, scenario[key] as number)} min={min} max={max} step={step} suffix={suffix} error={draftErrors["current." + key]} onChange={raw => setCurrentField(key, raw)} />)}</div>
      </section>
      <section className="panel"><div className="panel-head"><div><h2>ETF 配置與質押設定</h2><p>自有權重與借款權重各自合計 100%；質押資格採情境假設。</p></div><button className="button slim" onClick={addFund} disabled={scenario.funds.length >= 12}>＋ 新增 ETF</button></div>
        <div className="weight-tools"><div className={"weight-total " + (Math.abs(scenario.funds.reduce((s, f) => s + f.ownWeightPct, 0) - 100) > 0.000001 ? "invalid" : "")}>自有配置合計 <strong>{scenario.funds.reduce((s, f) => s + f.ownWeightPct, 0).toFixed(1)}%</strong><button className="text-button" onClick={() => normalize("ownWeightPct")}>自有權重正規化</button></div><div className={"weight-total " + (Math.abs(scenario.funds.reduce((s, f) => s + f.loanWeightPct, 0) - 100) > 0.000001 ? "invalid" : "")}>借款配置合計 <strong>{scenario.funds.reduce((s, f) => s + f.loanWeightPct, 0).toFixed(1)}%</strong><button className="text-button" onClick={() => normalize("loanWeightPct")}>借款權重正規化</button></div></div>
        <div className="fund-list">{scenario.funds.map((fund, index) => <article className="fund-card" key={fund.id}>
          <div className="fund-title"><span className="fund-index">0{index + 1}</span><label className="field"><span className="field-title">ETF 標的</span><select aria-label="ETF 標的" value={fund.symbol} onChange={e => setFundField(fund.id, "symbol", e.currentTarget.value)}>{CATALOG.map(item => <option key={item.symbol} value={item.symbol}>{item.symbol}｜{item.name}</option>)}</select></label><button className="icon-button remove" aria-label={"移除 " + fund.symbol} disabled={scenario.funds.length < 2} onClick={() => updateScenario({ ...scenario, funds: scenario.funds.filter(item => item.id !== fund.id) })}>移除</button></div>
          <div className="fund-values">
            <Field id={"own-" + fund.id} label="自有權重" value={fieldValue("fund." + fund.id + ".ownWeightPct", fund.ownWeightPct)} min={0} max={100} step={0.1} suffix="%" error={draftErrors["fund." + fund.id + ".ownWeightPct"]} onChange={raw => setFundField(fund.id, "ownWeightPct", raw)} />
            <Field id={"loan-" + fund.id} label="借款權重" value={fieldValue("fund." + fund.id + ".loanWeightPct", fund.loanWeightPct)} min={0} max={100} step={0.1} suffix="%" error={draftErrors["fund." + fund.id + ".loanWeightPct"]} onChange={raw => setFundField(fund.id, "loanWeightPct", raw)} />
            <Field id={"pledge-" + fund.id} label="自有持倉質押比例" value={fieldValue("fund." + fund.id + ".pledgePct", fund.pledgePct)} min={0} max={100} step={0.1} suffix="%" error={draftErrors["fund." + fund.id + ".pledgePct"]} onChange={raw => setFundField(fund.id, "pledgePct", raw)} />
            <Field id={"ltv-" + fund.id} label="假設可貸成數 LTV" value={fieldValue("fund." + fund.id + ".ltvPct", fund.ltvPct)} min={0} max={100} step={0.1} suffix="%" error={draftErrors["fund." + fund.id + ".ltvPct"]} onChange={raw => setFundField(fund.id, "ltvPct", raw)} />
            <label className="field"><span className="field-title">質押資格</span><select value={fund.pledgeStatus} onChange={e => setFundField(fund.id, "pledgeStatus", e.currentTarget.value)}><option value="assumed">情境假設可質押</option><option value="blocked">設定為不可質押</option></select></label>
            <div className="capacity"><span>初始模型額度</span><strong>{money(calc.valid ? calc.legs[index]?.capacity : NaN)}</strong><small>資格與 LTV 未經券商確認</small></div>
          </div>
        </article>)}</div>
        {validation.errors.length > 0 && <div className="error-banner" role="alert"><strong>目前設定需修正</strong><ul>{validation.errors.map((item, i) => <li key={i}>{item}</li>)}</ul></div>}
        {validation.warnings.length > 0 && <div className="assumption-box"><strong>模型假設提醒</strong><ul>{validation.warnings.slice(0, 5).map((item, i) => <li key={i}>{item}</li>)}</ul></div>}
        <div className="slot-tools"><span>快速保存 A/B/C</span>{SLOT_NAMES.map(slot => <button key={slot} className="button slim" onClick={() => changeSlot(slot, "save")}>儲存 {slot}</button>)}</div>
      </section>
    </>}
    {subtab === "survival" && <section className="panel"><div className="panel-head"><div><h2>獨立生存模型假設</h2><p>這些條件不會改寫報酬模型的即時變現代理。</p></div></div><div className="form-grid">
      <Field id="sv-horizon" label="觀察期間" value={fieldValue("survival.horizonMonths", workspace.survival.horizonMonths)} min={1} max={120} step={1} suffix="月" onChange={raw => setSurvivalField("horizonMonths", raw)} />
      <Field id="sv-shock" label="額外市場跌幅" value={fieldValue("survival.shockPct", workspace.survival.shockPct)} min={0} max={90} step={1} suffix="%" onChange={raw => setSurvivalField("shockPct", raw)} />
      <Field id="sv-shock-month" label="衝擊月份" value={fieldValue("survival.shockMonth", workspace.survival.shockMonth)} min={0} max={120} step={1} suffix="月" onChange={raw => setSurvivalField("shockMonth", raw)} />
      <Field id="sv-unemployment" label="無收入月數" value={fieldValue("survival.unemploymentMonths", workspace.survival.unemploymentMonths)} min={0} max={120} step={1} suffix="月" onChange={raw => setSurvivalField("unemploymentMonths", raw)} />
      <Field id="sv-rate" label="利率額外上升" value={fieldValue("survival.rateHikePct", workspace.survival.rateHikePct)} min={0} max={20} step={0.1} suffix="百分點" onChange={raw => setSurvivalField("rateHikePct", raw)} />
      <label className="field"><span className="field-title">到期處理</span><select value={workspace.survival.rollover} onChange={e => setSurvivalField("rollover", e.currentTarget.value)}><option value="deny">不續借並清償</option><option value="conditional">條件式假設續借</option></select></label>
      <label className="field"><span className="field-title">已知到期款項</span><select value={String(workspace.survival.prefund)} onChange={e => setSurvivalField("prefund", e.currentTarget.value)}><option value="true">提前兩個觀察交易日預售</option><option value="false">不提前預售</option></select></label>
      <label className="field"><span className="field-title">維持率處理</span><select value={workspace.survival.marginPolicy} onChange={e => setSurvivalField("marginPolicy", e.currentTarget.value)}><option value="warning">只標示低於 130%</option><option value="hypothetical_two_day_cure">假設兩日內補至 166%</option></select></label>
    </div><div className="assumption-box">T+2 以第二個觀察交易日結算應收款的研究近似，不代表券商交割、追繳或實際清算規則。</div></section>}
    {subtab === "data" && <section className="panel"><div className="panel-head"><div><h2>匯入、匯出與資料備份</h2><p>匯入前會先驗證格式並預覽將影響的設定。</p></div></div><div className="action-grid"><button className="button" onClick={() => fileInput.current?.click()}>選擇 JSON 匯入</button><button className="button" onClick={() => download("LPOS-工作區-V2.json", exportWorkspace(workspace), "application/json;charset=utf-8")}>下載完整工作區</button><button className="button" onClick={() => download("LPOS-目前情境-V1.json", exportScenario(scenario), "application/json;charset=utf-8")}>下載目前情境</button><button className="button" disabled={!showRun} onClick={exportBundle}>下載研究重現包</button></div><div className="assumption-box">V0.6 匯入時會先建立瀏覽器內備份。研究結果不會自動上傳或寫入公開儲存庫。</div>{runError && <p className="error-banner">{runError}</p>}</section>}
  </div>;

  const renderResearch = () => <div className="stack">
    <section className="panel"><div className="panel-head"><div><h2>研究期間與報酬口徑</h2><p>日期會先取目前投資標的共同資料期間；留白表示採用可用完整範圍。</p></div></div>
      <div className="form-grid four"><Field id="date-from" type="date" label="起始日期" value={workspace.research.from} onChange={raw => setResearchField("from", raw)} /><Field id="date-to" type="date" label="結束日期" value={workspace.research.to} onChange={raw => setResearchField("to", raw)} />
        <label className="field"><span className="field-title">再平衡頻率</span><select value={workspace.research.rebalance} onChange={e => updateWorkspace({ ...workspace, research: { ...workspace.research, rebalance: e.currentTarget.value } })}>{[["none","不再平衡"],["monthly","每月"],["quarterly","每季"],["semiannual","每半年"],["annual","每年"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="field"><span className="field-title">到期本金</span><select value={workspace.research.repayment} onChange={e => updateWorkspace({ ...workspace, research: { ...workspace.research, repayment: e.currentTarget.value } })}><option value="repay_at_term">到期清償</option><option value="conditional_rollover">條件式假設續借</option></select></label>
        <Field id="rf-rate" label="Sharpe 無風險利率" value={fieldValue("research.rfPct", workspace.research.rfPct)} min={0} max={30} step={0.1} suffix="%" onChange={raw => setResearchField("rfPct", raw)} />
      </div>
    </section>
    <section className="panel run-panel"><div><span className="tag">本機瀏覽器計算</span><h2>凍結設定後執行本次研究</h2><p>開始時會建立研究請求編號與參數指紋。研究中的設定修改不會變成本次的輸入。</p><p className="caveat-inline">{CAVEAT}</p></div><div className="run-controls"><button className={"button " + (runStatus === "running" ? "danger" : "primary")} onClick={startResearch}>{runStatus === "running" ? "取消研究" : "開始完整研究"}</button>{runStatus === "running" && <Progress percent={progress.percent} stage={progress.stage} />}{runError && <p className="error-banner" role="alert">{runError}</p>}{runStatus === "complete" && <p className="success-text">研究完成。你可以查看總覽或前往報告中心。</p>}</div></section>
    <div className="disclosure-grid"><Info title="實際執行期間" body={showRun && run ? run.actualPeriod.start + " 至 " + run.actualPeriod.end + "，" + run.actualPeriod.sessions + " 個交易日。" : "研究完成後顯示實際日期；資料不足時不延伸曲線。"} /><Info title="資料來源" body="只採目前已封存的 006208、00631L、00685L 調整價格 CSV；不支援標的會明確拒絕，不以其他 ETF 代替。" /><Info title="兩種模型" body="歷史報酬與 T+2 生存結果分開執行並分別呈現其假設。" /></div>
  </div>;

  const renderCompare = () => <div className="stack">
    <section className="panel"><div className="panel-head"><div><h2>共同條件與方案設定</h2><p>A/B/C 使用相同日期區間與研究參數。方案資料保存在本機工作區。</p></div><button className="button primary" onClick={startResearch}>{runStatus === "running" ? "取消研究" : "執行含 A/B/C 的研究"}</button></div>
      <div className="comparison-slots">{SLOT_NAMES.map(slot => {
        const saved = workspace.saved[slot];
        return <article className={"slot-card " + (saved ? "available" : "missing")} key={slot}><div className="slot-heading"><span className="slot-letter">{slot}</span><div><strong>{saved?.scenarioName || "尚未儲存"}</strong><small>{saved ? money(saved.ownCapital) + "｜外部淨現金流 " + money(saved.monthlyFreeCashFlow) + " / 月" : "先前往設定，儲存目前方案"}</small></div></div>{saved && <div className="slot-summary"><span>自有權重：{saved.funds.map(f => f.symbol + " " + f.ownWeightPct + "%").join("、")}</span><span>借款動用 {saved.borrowUtilPct}%｜年利率假設 {saved.aprPct}%</span><span>質押設定與 LTV 由每檔 ETF 分別保存。</span></div>}<div className="slot-actions"><button className="button slim" onClick={() => changeSlot(slot, "load")} disabled={!saved}>載入至目前設定</button><button className="button slim" onClick={() => changeSlot(slot, "save")}>以目前設定覆存</button></div></article>;
      })}</div>
    </section>
    {showRun && run ? <section className="panel"><div className="panel-head"><div><h2>同期間結果</h2><p>{run.comparison ? run.comparison.period.start + " 至 " + run.comparison.period.end : run.comparisonError || "等待完整方案。"}</p></div><StatusPill state={run.comparison?.rankingEligible ? "passed" : "partial"} /></div>
      {run.comparison ? <><div className="compare-note">{run.comparison.rankingEligible ? "三方案均覆蓋完整共同期間，可查看 CAGR 與 Sharpe。" : "至少一個方案未覆蓋完整期間；不顯示跨方案 CAGR／Sharpe 排名。"}</div><div className="table-scroll"><table><thead><tr><th>方案</th><th>實際期間</th><th>年化報酬 CAGR</th><th>最大回撤</th><th>Sharpe</th><th>借款利息</th><th>結果</th></tr></thead><tbody>{run.comparison.results.map((item: any) => <tr key={item.name}><td>{item.name}</td><td>{item.period.start} 至 {item.period.end}</td><td>{run.comparison?.rankingEligible ? percent(item.comparableCagrPct) : "不排名"}</td><td>{percent(item.stats.mddPct)}</td><td>{run.comparison?.rankingEligible ? (Number.isFinite(item.stats.sharpe) ? item.stats.sharpe.toFixed(3) : "無資料") : "不排名"}</td><td>{money(item.stats.interestPaidTwd)}</td><td>{item.fullPeriod ? "完整" : "中斷"}</td></tr>)}</tbody></table></div></> : <div className="empty compact">{run.comparisonError || "需儲存 A、B、C 三個方案並重新計算，才會產生公平比較。"}</div>}
    </section> : <section className="panel empty-state"><h2>尚無新鮮比較結果</h2><p>完成研究後，這裡才會顯示共同日期、完整性與比較指標。</p><button className="button" onClick={() => navigate("setup")}>前往設定 A/B/C</button></section>}
    <div className="notice warning">不得將未完成期間的 CAGR 或 Sharpe 排序；A/B/C 共用本金與外部現金流是公平比較前提。</div>
  </div>;

  const renderReport = () => <div className="stack">
    {showRun && run && report ? <>
      <section className="report-cover panel"><div><span className="tag tag-warn">{report.status === "complete" ? "研究完成 · 證據限制仍適用" : "診斷報告 · 部分完成"}</span><h2>{report.title}</h2><p>{report.subtitle}</p><p className="caveat-inline">{report.caveat}</p><span className="fingerprint">Run {run.runId} · Param {run.parameterFingerprint.slice(0, 14)}… · Data {run.dataFingerprint.slice(0, 14)}…</span></div><div className="report-actions"><button className="button primary" onClick={requestPdf} disabled={busyPdf}>{busyPdf ? "PDF Worker 產生中…" : "下載 PDF 報告"}</button><button className="button" onClick={exportBundle}>下載研究重現包</button><button className="button" onClick={exportCsv}>下載逐日帳務 CSV</button></div></section>
      {replayMessage && <div className="notice" role="status">{replayMessage}</div>}
      {busyPdf && <div className="notice" role="status">正在產生可選取文字的繁體中文 PDF，完成後會自動下載。</div>}
      {runError && <p className="error-banner" role="alert">{runError}</p>}
      <nav className="report-index" aria-label="報告章節">{report.blocks.map(block => <a key={block.id} href={"#" + block.id}>{block.title}</a>)}</nav>
      <Chart run={run} />
      {report.blocks.map(reportBlock)}
      {run.reference.snapshot && <section className="panel"><div className="panel-head"><h2>封存 Python 參考快照（獨立模型）</h2><StatusPill state="partial" /></div><p>此快照使用固定 2020-07-20 至 2026-03-06 歷史設定，不與本次自由配置混排。</p><p>{run.reference.snapshot.researchVersion}｜來源分級 {run.reference.snapshot.sourceGrade}｜{run.reference.snapshot.period.sessions} 觀察日</p><details><summary>檢視 10 組封存條件</summary><div className="table-scroll"><table><thead><tr><th>組合</th><th>借款本金</th><th>CAGR</th><th>MDD</th><th>Sharpe</th><th>未償本金</th></tr></thead><tbody>{run.reference.snapshot.cases.map((row: any, index: number) => <tr key={index}><td>{row.portfolio}</td><td>{money(row.loanTwd)}</td><td>{percent(row.stats.cagr_pct)}</td><td>{percent(row.stats.mdd_pct)}</td><td>{Number(row.stats.sharpe_0rf).toFixed(3)}</td><td>{money(row.stats.remaining_loan_twd)}</td></tr>)}</tbody></table></div></details></section>}
    </> : <section className="panel empty-state"><span className="tag">報告中心</span><h2>{stale ? "目前報告已過期" : "沒有可用的研究報告"}</h2><p>{stale ? "參數已變更，請重新計算後才能下載新報告。" : "需要先完成一次有效研究。你仍可在設定中下載情境或工作區 JSON。"}</p><button className="button primary" onClick={() => navigate("research")}>前往歷史研究</button>{runError && <p className="error-banner">{runError}</p>}</section>}
  </div>;

  const body = route === "setup" ? renderSetup() : route === "research" ? renderResearch() : route === "compare" ? renderCompare() : route === "report" ? renderReport() : renderOverview();
  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#overview" onClick={e => { e.preventDefault(); navigate("overview"); }}><span className="brand-mark">L</span><span><strong>LPOS</strong><small>PORTFOLIO LAB</small></span></a>
      <div className="side-caption">研究工作台</div>
      <nav className="side-nav" aria-label="主要導覽">{NAV.map(item => <button key={item.id} className={route === item.id ? "active" : ""} aria-current={route === item.id ? "page" : undefined} onClick={() => navigate(item.id)}><span className="nav-icon">{item.icon}</span>{item.label}</button>)}</nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-footer"><span className="version-tag">WEB V0.{APP_VERSION.split(".")[1]}</span><p>設定儲存在本機瀏覽器</p><p>資料截至日依來源檔案列示</p></div>
    </aside>
    <main className="main-content">
      <header className="topbar"><div><div className="eyebrow">LPOS PORTFOLIO LAB / RESEARCH</div><h1>{activeTitle[0]}</h1><p>{activeTitle[1]}</p></div><div className="top-actions"><button className="button primary" onClick={() => navigate("research")}>開始研究</button><button className="button icon-action" aria-label="匯入工作區 JSON" title="匯入工作區 JSON" onClick={() => fileInput.current?.click()}>⇧ 匯入</button><input ref={fileInput} type="file" accept="application/json,.json" className="visually-hidden" aria-label="匯入 JSON" onChange={e => void selectImportFile(e.currentTarget.files?.[0])} /></div></header>
      {stale && <div className="notice warning" role="status">設定已變更，舊研究結果已隱藏。請重新計算。</div>}
      {runStatus === "running" && route !== "research" && <div className="run-strip"><Progress percent={progress.percent} stage={progress.stage} /><button className="button slim danger" onClick={startResearch}>取消研究</button></div>}
      {body}
    </main>
    <nav className="mobile-nav" aria-label="手機主要導覽">{NAV.map(item => <button key={item.id} className={route === item.id ? "active" : ""} aria-current={route === item.id ? "page" : undefined} onClick={() => navigate(item.id)}><span>{item.icon}</span>{item.short}</button>)}</nav>
    {importPreviewState && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setImportPreviewState(null); }}><section className="modal panel" role="dialog" aria-modal="true" aria-labelledby="import-title"><div className="panel-head"><h2 id="import-title">確認匯入內容</h2><button className="icon-button" onClick={() => setImportPreviewState(null)} aria-label="關閉">×</button></div><p>類型：{importPreviewState.type === "bundle" ? "研究重現包" : importPreviewState.type === "workspace" ? "完整工作區 V2" : "單一情境 V1"}</p><p>方案：<strong>{importPreviewState.name}</strong></p><ul>{importPreviewState.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul><div className="modal-actions"><button className="button" onClick={() => setImportPreviewState(null)}>取消</button><button className="button primary" onClick={applyImport}>套用匯入</button></div></section></div>}
  </div>;
}
