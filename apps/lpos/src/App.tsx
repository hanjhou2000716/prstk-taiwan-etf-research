import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CATALOG, MODEL_VERSION, backtestCsv, calculateScenario, makeFund, normalizeFunds, supportedSymbols, validateScenario } from "./engine/portfolio.js";
import type { FundV1, ScenarioV1 } from "./engine/portfolio.js";
import { buildReport } from "./report.js";
import { createDefaultWorkspace, exportScenario, exportWorkspace, loadEditorState, persistEditorState, previewImport, validateWorkspace } from "./workspace.js";
import type { ImportPreview, ResearchBundleV1, ResearchReportV1, ResearchRequest, ResearchRun, SlotName, WorkspaceV2 } from "./types.js";

const APP_VERSION = "0.7.1";
const CAVEAT = "研究行情是調整價格代理，非已驗證含息真實可執行融資回測。";
const NAV: Array<{ id: string; label: string; short: string; icon: string }> = [
  { id: "overview", label: "負擔試算", short: "試算", icon: "◫" },
  { id: "setup", label: "設定", short: "設定", icon: "◈" },
  { id: "tools", label: "進階研究與工具", short: "進階", icon: "⋯" }
];
const TITLES: Record<string, [string, string]> = {
  overview: ["借款負擔試算", "先查看每月利息、可用現金、到期本金缺口與下跌壓力。"],
  setup: ["設定你的情境", "依步驟輸入資金、ETF 配置與借款條件；進階假設可以展開。"],
  tools: ["進階研究與工具", "歷史研究、A/B/C、公平比較、報告與資料備份。"],
  research: ["歷史研究", "以共同日期與可驗證的資料檔，執行報酬模型與獨立 T+2 生存模型。"],
  compare: ["A/B/C 公平比較", "三方案使用相同自有本金、每月外部淨現金流及共同交易日期。"],
  report: ["研究報告", "網頁、PDF 與重現包共用同一次研究結果及相同指紋。"]
};
const SLOT_NAMES: SlotName[] = ["A", "B", "C"];
const money = (value: unknown): string => typeof value === "number" && Number.isFinite(value) ? "NT$ " + Math.round(value).toLocaleString("en-US") : "無資料";
const percent = (value: unknown, digits = 2): string => typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) + "%" : "無資料";
const valueOf = (value: unknown): string => typeof value === "number" && Number.isFinite(value) ? String(value) : "";
function parseNumericDraft(raw: string): number | null {
  const normalized = raw.replace(/[０-９]/g, digit => String(digit.charCodeAt(0) - 0xff10)).replace(/[，,]/g, ",").trim();
  if (!normalized) return null;
  const grouped = /^-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(normalized);
  const plain = /^-?\d+(?:\.\d+)?$/.test(normalized);
  if (!grouped && !plain) return null;
  const value = Number(normalized.replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}
function formatNumericDraft(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 12 });
}
function draftKeyForInput(id: string): string | null {
  const direct: Record<string, string> = {
    "current-ownCapital": "current.ownCapital", "cash-reserve": "cash.reserve", "current-monthlyFreeCashFlow": "current.monthlyFreeCashFlow",
    "loan-amount": "loan.amount", "rf-rate": "research.rfPct", "sv-horizon": "survival.horizonMonths", "sv-shock": "survival.shockPct",
    "sv-shock-month": "survival.shockMonth", "sv-unemployment": "survival.unemploymentMonths", "sv-rate": "survival.rateHikePct"
  };
  if (direct[id]) return direct[id];
  if (id.startsWith("current-")) return "current." + id.slice(8);
  if (id.startsWith("own-")) return "fund." + id.slice(4) + ".ownWeightPct";
  if (id.startsWith("loan-")) return "fund." + id.slice(5) + ".loanWeightPct";
  if (id.startsWith("pledge-")) return "fund." + id.slice(7) + ".pledgePct";
  if (id.startsWith("ltv-")) return "fund." + id.slice(4) + ".ltvPct";
  return null;
}
function initialDraftErrors(drafts: Record<string, string>, workspace: WorkspaceV2): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [key, raw] of Object.entries(drafts)) {
    if (key === "current.scenarioName") {
      if (!raw.trim()) errors[key] = "情境名稱不可空白。";
      else if (raw.length > 60) errors[key] = "情境名稱最多 60 個字元。";
      continue;
    }
    const value = parseNumericDraft(raw);
    if (value === null) { errors[key] = "請檢查尚未完成的輸入。重填後才可試算。"; continue; }
    let min = -Infinity, max = Infinity, integer = false;
    if (key.startsWith("current.")) {
      const field = key.slice("current.".length);
      const limits: Record<string, [number, number, boolean]> = {
        ownCapital: [1, 1e12, false], monthlyFreeCashFlow: [-1e9, 1e9, false], monthlyLivingExpense: [0, 1e9, false],
        minReserveMonths: [0, 36, true], tradeCostPct: [0, 20, false], shockPct: [0, 100, false],
        aprPct: [0, 50, false], termMonths: [1, 360, true], loanInvestPct: [0, 100, false], originationFeePct: [0, 20, false]
      };
      [min, max, integer] = limits[field] || [0, 100, false];
    } else if (key.startsWith("fund.")) { min = 0; max = 100; }
    else if (key === "cash.reserve") { min = 0; max = workspace.current.ownCapital; }
    else if (key === "loan.amount") { min = 0; max = 1e12; }
    else if (key === "research.rfPct") { min = 0; max = 30; }
    else if (key.startsWith("survival.")) {
      const field = key.slice("survival.".length);
      const limits: Record<string, [number, number, boolean]> = { horizonMonths: [1, 120, true], shockPct: [0, 90, false], shockMonth: [0, 120, true], unemploymentMonths: [0, 120, true], rateHikePct: [0, 20, false] };
      [min, max, integer] = limits[field] || [0, 0, false];
    }
    if (value < min || value > max) errors[key] = `數值需介於 ${min} 至 ${max}。`;
    else if (integer && !Number.isInteger(value)) errors[key] = "此欄位需輸入整數。";
  }
  const loanDraft = parseNumericDraft(drafts["loan.amount"] || "");
  const capacity = calculateScenario({ ...workspace.current, borrowUtilPct: 0 });
  if (loanDraft !== null && capacity.valid && loanDraft > Number(capacity.loanCapacity || 0)) errors["loan.amount"] = "借款金額超過目前模型估計額度；請調整金額或配置。";
  return errors;
}
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
  const base = hash.split("/")[0];
  const route = aliases[base] || base;
  return ["overview", "setup", "tools", "research", "compare", "report"].includes(route) ? route : "overview";
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
  const inputType = props.type === "date" ? "date" : props.type === "text" ? "text" : "text";
  return <label className="field" htmlFor={props.id}>
    <span className="field-title">{props.label}</span>
    <span className="input-wrap"><input id={props.id} name={props.id} type={inputType} value={props.value} min={props.min} max={props.max} step={props.step} inputMode={props.type === "date" ? undefined : props.type === "text" || (props.min ?? 0) < 0 ? "text" : "decimal"} autoComplete="off" onChange={e => props.onChange(e.currentTarget.value)} aria-invalid={!!props.error} aria-describedby={props.error ? props.id + "-error" : props.note ? props.id + "-note" : undefined} />{props.suffix && <span className="suffix">{props.suffix}</span>}</span>
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
  const loaded = useMemo(loadEditorState, []);
  const [workspace, setWorkspace] = useState<WorkspaceV2>(loaded.workspace);
  const lastValidWorkspace = useRef<WorkspaceV2>(loaded.lastValidWorkspace);
  const [route, setRoute] = useState(routeFromHash);
  const [notice, setNotice] = useState(loaded.notice);
  const [canPersist, setCanPersist] = useState(loaded.canPersist);
  const [recoveryBackupDownloaded, setRecoveryBackupDownloaded] = useState(!loaded.rawBackup);
  const [draft, setDraft] = useState<Record<string, string>>(loaded.drafts);
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>(() => initialDraftErrors(loaded.drafts, loaded.workspace));
  const [wizardStep, setWizardStep] = useState(loaded.activeStep);
  const [loanAmountTwd, setLoanAmountTwd] = useState(loaded.loanAmountTwd);
  const [loanAmountText, setLoanAmountText] = useState(loaded.drafts["loan.amount"] ?? String(Math.round(loaded.loanAmountTwd)));
  const [cashReserveTwd, setCashReserveTwd] = useState(loaded.cashReserveTwd);
  const [loanLinked, setLoanLinked] = useState(loaded.linkLoanWeights);
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
  const capacityCalc = useMemo(() => calculateScenario({ ...scenario, borrowUtilPct: 0 }), [scenario]);
  const validation = useMemo(() => validateScenario(scenario), [scenario]);
  const activeTitle = TITLES[route] || TITLES.overview;
  useEffect(() => {
    const onHash = () => {
      const hash = location.hash.replace(/^#/, "");
      const [base, section] = hash.split("/", 2);
      if (base === "survival") setSubtab("survival");
      setRoute(routeFromHash());
      const target = base === "sources" ? "sources" : section;
      if (target) setTimeout(() => document.getElementById(target)?.scrollIntoView({ block: "start" }), 0);
    };
    window.addEventListener("hashchange", onHash);
    onHash();
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    let valid = false;
    try { valid = validateWorkspace(workspace).schemaVersion === 2; } catch { valid = false; }
    if (valid && Object.keys(draftErrors).length === 0) {
      lastValidWorkspace.current = workspace;
    }
    if (!canPersist) return;
    const timer = window.setTimeout(() => {
      const error = persistEditorState({ lastValidWorkspace: lastValidWorkspace.current, drafts: draft, activeStep: wizardStep, loanAmountTwd, cashReserveTwd, linkLoanWeights: loanLinked });
      setSavedMessage(error);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [workspace, draft, draftErrors, wizardStep, loanAmountTwd, cashReserveTwd, loanLinked, canPersist]);
  const persistNow = useCallback(() => {
    if (!canPersist) return;
    setSavedMessage(persistEditorState({ lastValidWorkspace: lastValidWorkspace.current, drafts: draft, activeStep: wizardStep, loanAmountTwd, cashReserveTwd, linkLoanWeights: loanLinked }));
  }, [canPersist, draft, wizardStep, loanAmountTwd, cashReserveTwd, loanLinked]);
  useEffect(() => {
    const onVisibilityChange = () => { if (document.visibilityState === "hidden") persistNow(); };
    window.addEventListener("pagehide", persistNow);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => { window.removeEventListener("pagehide", persistNow); document.removeEventListener("visibilitychange", onVisibilityChange); };
  }, [persistNow]);
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
  const withFixedAmounts = (next: ScenarioV1, loanTarget = loanAmountTwd, cashTarget = cashReserveTwd): ScenarioV1 => {
    const cashAdjusted = next.ownCapital > 0 && cashTarget <= next.ownCapital
      ? { ...next, ownCashPct: cashTarget / next.ownCapital * 100 } : next;
    const capacityResult = calculateScenario({ ...cashAdjusted, borrowUtilPct: 0 });
    if (!capacityResult.valid) return cashAdjusted;
    const capacity = Math.max(0, Number(capacityResult.loanCapacity) || 0);
    if (loanTarget === 0) return { ...cashAdjusted, borrowUtilPct: 0 };
    if (capacity > 0 && loanTarget <= capacity) return { ...cashAdjusted, borrowUtilPct: loanTarget / capacity * 100 };
    return cashAdjusted;
  };
  const updateScenario = useCallback((next: ScenarioV1) => updateWorkspace({ ...workspace, current: withFixedAmounts(next) }), [updateWorkspace, workspace, loanAmountTwd, cashReserveTwd]);
  const setScenarioName = (raw: string) => {
    setDraft(previous => ({ ...previous, "current.scenarioName": raw }));
    if (!raw.trim() || raw.length > 60) {
      setDraftErrors(previous => ({ ...previous, "current.scenarioName": !raw.trim() ? "情境名稱不可空白。" : "情境名稱最多 60 個字元。" }));
      invalidateResults();
      return;
    }
    setDraftErrors(previous => { const next = { ...previous }; delete next["current.scenarioName"]; return next; });
    updateScenario({ ...scenario, scenarioName: raw });
  };
  const numberChange = (key: string, raw: string, save: (value: number) => void, min = -Infinity, max = Infinity, integer = false) => {
    setDraft(previous => ({ ...previous, [key]: raw }));
    const number = parseNumericDraft(raw);
    if (number === null || number < min || number > max || (integer && !Number.isInteger(number))) {
      const reason = !raw.trim() ? "欄位尚未填寫；空白不會自動當成 0。" : number === null ? "請輸入完整數字；可使用千分位逗號。" : integer && !Number.isInteger(number) ? "此欄位需輸入整數。" : `數值需介於 ${min} 至 ${max}。`;
      setDraftErrors(previous => ({ ...previous, [key]: reason }));
      invalidateResults();
      return;
    }
    setDraftErrors(previous => { const next = { ...previous }; delete next[key]; return next; });
    save(number);
  };
  const fieldValue = (key: string, value: number): string => draft[key] ?? valueOf(value);
  const setCurrentField = (key: keyof ScenarioV1, raw: string, min = -1e12, max = 1e12, integer = false) => numberChange("current." + key, raw, value => updateScenario({ ...scenario, [key]: value }), min, max, integer);
  const setCashReserve = (raw: string) => numberChange("cash.reserve", raw, value => {
    if (value > scenario.ownCapital) return;
    setCashReserveTwd(value);
    updateWorkspace({ ...workspace, current: withFixedAmounts(scenario, loanAmountTwd, value) });
  }, 0, Math.min(1e12, scenario.ownCapital));
  const setLoanAmount = (raw: string) => {
    setLoanAmountText(raw);
    numberChange("loan.amount", raw, value => {
      const capacity = Math.max(0, Number(capacityCalc.loanCapacity) || 0);
      if (value > capacity) {
        setDraftErrors(previous => ({ ...previous, "loan.amount": "借款金額超過目前模型估計額度；請調整金額或配置。" }));
        setLoanAmountTwd(value);
        return;
      }
      setLoanAmountTwd(value);
      updateWorkspace({ ...workspace, current: withFixedAmounts(scenario, value, cashReserveTwd) });
    }, 0, 1e12);
  };
  const setResearchField = (key: keyof WorkspaceV2["research"], raw: string) => {
    if (key === "from" || key === "to") {
      updateWorkspace({ ...workspace, research: { ...workspace.research, [key]: raw } });
      setDraftErrors(prev => { const next = { ...prev }; delete next["research." + key]; return next; });
    } else numberChange("research." + key, raw, value => updateWorkspace({ ...workspace, research: { ...workspace.research, [key]: value } }), 0, 30);
  };
  const setSurvivalField = (key: string, raw: string) => {
    if (key === "rollover" || key === "marginPolicy" || key === "prefund") {
      const value = key === "prefund" ? raw === "true" : raw;
      updateWorkspace({ ...workspace, survival: { ...workspace.survival, [key]: value } as any });
    } else {
      const limits: Record<string, [number, number, boolean]> = { horizonMonths: [1, 120, true], shockPct: [0, 90, false], shockMonth: [0, 120, true], unemploymentMonths: [0, 120, true], rateHikePct: [0, 20, false] };
      const [min, max, integer] = limits[key] || [-1e9, 1e9, false];
      numberChange("survival." + key, raw, value => updateWorkspace({ ...workspace, survival: { ...workspace.survival, [key]: value } }), min, max, integer);
    }
  };
  const setFundField = (fundId: string, key: keyof FundV1, raw: string) => {
    const fund = scenario.funds.find(item => item.id === fundId);
    if (!fund) return;
    if (key === "symbol") {
      const found = CATALOG.find(item => item.symbol === raw);
      if (found) updateScenario({ ...scenario, funds: scenario.funds.map(item => item.id === fundId ? { ...item, symbol: found.symbol, name: found.name, factor: found.factor } : item) });
    } else if (key === "pledgeStatus") updateScenario({ ...scenario, funds: scenario.funds.map(item => item.id === fundId ? { ...item, pledgeStatus: raw as FundV1["pledgeStatus"] } : item) });
    else numberChange("fund." + fundId + "." + key, raw, value => updateScenario({ ...scenario, funds: scenario.funds.map(item => item.id === fundId ? { ...item, [key]: value, ...(key === "ownWeightPct" && loanLinked ? { loanWeightPct: value } : {}) } : item) }), 0, 100);
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
    if (cashReserveTwd > scenario.ownCapital) { setRunError("自有保留現金不能高於自有資金。"); navigate("setup"); setWizardStep(0); return; }
    if (!capacityCalc.valid || loanAmountTwd > Number(capacityCalc.loanCapacity || 0)) { setRunError("借款金額超過目前估計額度，請返回檢查資金與 ETF 質押設定。"); navigate("setup"); setWizardStep(2); return; }
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
    else if (workspace.saved[slot]) {
      const loadedScenario = JSON.parse(JSON.stringify(workspace.saved[slot])) as ScenarioV1;
      const loadedCalc = calculateScenario(loadedScenario);
      setDraft({}); setDraftErrors({});
      setLoanAmountTwd(loadedCalc.valid ? loadedCalc.borrow : 0);
      setLoanAmountText(String(Math.round(loadedCalc.valid ? loadedCalc.borrow : 0)));
      setCashReserveTwd(loadedScenario.ownCapital * loadedScenario.ownCashPct / 100);
      setSubtab("portfolio");
      updateWorkspace({ ...workspace, current: loadedScenario });
    }
  };
  const loadExample = () => {
    const example = { ...scenario, scenarioName: "示範｜富邦台50調整價格路徑", ownCashPct: 0, borrowUtilPct: 0 };
    const fund = makeFund("006208", 100, 100);
    fund.pledgePct = 100;
    setLoanAmountTwd(0); setLoanAmountText("0"); setCashReserveTwd(0);
    updateWorkspace({ ...workspace, current: { ...example, funds: [fund] } });
    setDraft({}); setDraftErrors({});
    setNotice("已載入單檔 006208 示範設定；只在你點選後更新目前情境。");
  };
  const normalize = (key: "ownWeightPct" | "loanWeightPct") => {
    setDraft(previous => Object.fromEntries(Object.entries(previous).filter(([path]) => !path.startsWith("fund."))));
    setDraftErrors(previous => Object.fromEntries(Object.entries(previous).filter(([path]) => !path.startsWith("fund."))));
    if (key === "loanWeightPct") setLoanLinked(false);
    const funds = normalizeFunds(scenario.funds, key);
    updateScenario({ ...scenario, funds: key === "ownWeightPct" && loanLinked ? funds.map(item => ({ ...item, loanWeightPct: item.ownWeightPct })) : funds });
  };
  const addFund = () => {
    if (scenario.funds.length >= 12) return;
    const candidate = CATALOG.find(item => !scenario.funds.some(fund => fund.symbol === item.symbol)) || CATALOG[0];
    updateScenario({ ...scenario, funds: [...scenario.funds, makeFund(candidate.symbol, 0, 0)] });
  };
  const removeFund = (fundId: string) => {
    setDraft(previous => Object.fromEntries(Object.entries(previous).filter(([path]) => !path.startsWith("fund." + fundId + "."))));
    setDraftErrors(previous => Object.fromEntries(Object.entries(previous).filter(([path]) => !path.startsWith("fund." + fundId + "."))));
    updateScenario({ ...scenario, funds: scenario.funds.filter(item => item.id !== fundId) });
  };
  const setLoanAllocationLinked = (linked: boolean) => {
    setLoanLinked(linked);
    if (linked) updateScenario({ ...scenario, funds: scenario.funds.map(item => ({ ...item, loanWeightPct: item.ownWeightPct })) });
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

  const renderOverview = () => {
    const isCurrentValid = calc.valid && validation.errors.length === 0 && Object.keys(draftErrors).length === 0 && cashReserveTwd <= scenario.ownCapital && loanAmountTwd <= Number(capacityCalc.loanCapacity || 0);
    return <div className="stack">
      {notice && <div className="notice" role="status">{notice}</div>}
      {savedMessage && <div className="notice warning" role="status">{savedMessage}</div>}
      <section className="panel affordability-hero"><div><span className="tag">固定情境試算</span><h2>借款後，每月現金夠不夠？</h2><p>先核對利息、現金與到期還本缺口，再決定是否深入歷史研究。</p></div><div className="hero-actions"><button className="button primary" onClick={() => { setSubtab("portfolio"); navigate("setup"); }}>調整設定</button><button className="button" onClick={() => navigate("tools")}>進階研究與工具</button></div></section>
      {isCurrentValid ? <><div className="metric-grid affordability-grid">
        <Metric label="預計借款" value={money(loanAmountTwd)} detail={capacityCalc.loanCapacity > 0 ? "估計額度使用 " + percent(loanAmountTwd / capacityCalc.loanCapacity * 100, 1) : "沒有模型可貸額度"} />
        <Metric label="每月利息估計" value={money(loanAmountTwd * scenario.aprPct / 1200)} detail={percent(scenario.aprPct, 2) + " 年利率 × 借款本金 ÷ 12"} />
        <Metric label="付息後月結餘" value={money(scenario.monthlyFreeCashFlow - loanAmountTwd * scenario.aprPct / 1200)} detail="每月收支結餘扣除此筆利息" tone={scenario.monthlyFreeCashFlow - loanAmountTwd * scenario.aprPct / 1200 < 0 ? "risk" : undefined} />
        <Metric label="可動用現金" value={money(calc.liquidCash)} detail="含借款後保留現金；不含未實現投資獲利" />
        <Metric label="到期還本缺口" value={money(Math.max(0, loanAmountTwd - Math.max(0, calc.liquidCash + (scenario.monthlyFreeCashFlow - loanAmountTwd * scenario.aprPct / 1200) * scenario.termMonths)))} detail={scenario.termMonths + " 個月；不假設出售 ETF 或續借"} tone={loanAmountTwd > Math.max(0, calc.liquidCash + calc.projectedMonthlyFlow * scenario.termMonths) ? "risk" : undefined} />
        <Metric label="下跌後擔保維持率" value={calc.stressedMaintenancePct == null ? "無借款" : percent(calc.stressedMaintenancePct, 1)} detail={"單步下跌 " + percent(scenario.shockPct, 1) + " 的模型假設"} tone={calc.marginTrigger ? "risk" : undefined} />
      </div><div className="notice warning">模型估計額度不是券商核貸承諾。{CAVEAT}</div>
      {scenario.monthlyLivingExpense <= 0 && <div className="notice">尚未填寫必要生活支出，因此未評估生活預備金與失業壓力。</div>}
      {showRun && run && report && <details className="panel history-summary"><summary>展開最近一次歷史研究</summary><div className="status-row"><div><StatusPill state={run.reference.formal_conclusions_blocked ? "blocked" : "partial"} /> <span>{run.actualPeriod.start} 至 {run.actualPeriod.end}</span></div><span>資料指紋 {run.dataFingerprint.slice(0, 12)}…</span></div><div className="metric-grid history-grid"><Metric label="歷史 CAGR" value={percent(run.backtest.stats.cagrPct)} detail="依實際研究期間" /><Metric label="同標的無借款 CAGR" value={percent(run.benchmark.backtest.stats.cagrPct)} detail="相同本金與期間" /><Metric label="最大回撤" value={percent(run.backtest.stats.mddPct)} detail="時間加權淨值" tone="risk" /><Metric label="完整生存情境" value={run.survival.filter(item => item.result.completed && item.result.horizonCovered).length + "／" + run.survival.length} detail="完成數不代表存活機率" /></div><Chart run={run} /><div className="layer-grid">{run.validationLayers.map(layer => <div className="layer" key={layer.key}><strong>{layer.key}　</strong><StatusPill state={layer.state} /><p>{layer.detail}</p></div>)}</div><button className="button" onClick={() => navigate("report")}>開啟研究報告</button></details>}
      </> : <section className="panel empty-state"><h2>設定還沒完成</h2><p>{draftErrors["loan.amount"] || (loanAmountTwd > Number(capacityCalc.loanCapacity || 0) ? "借款金額超過模型額度。" : validation.errors[0] || (cashReserveTwd > scenario.ownCapital ? "保留現金高於自有資金。" : "先修正欄位，再查看負擔結果。"))}</p><button className="button primary" onClick={() => { setSubtab("portfolio"); setWizardStep(Object.keys(draftErrors).length ? wizardStep : 0); navigate("setup"); }}>返回修正設定</button>{runError && <p className="error-banner" role="alert">{runError}</p>}</section>}
      {runStatus === "running" && <div className="run-strip"><Progress percent={progress.percent} stage={progress.stage} /><button className="button slim danger" onClick={startResearch}>取消歷史研究</button></div>}
    </div>;
  };

  const renderSetup = () => <div className="stack">
    {subtab === "portfolio" ? <>
      <ol className="wizard-steps" aria-label="設定步驟">{["資金", "ETF 配置", "借款", "確認試算"].map((label, index) => <li key={label}><button className={wizardStep === index ? "active" : wizardStep > index ? "complete" : ""} aria-current={wizardStep === index ? "step" : undefined} onClick={() => setWizardStep(index)}><span>{index + 1}</span>{label}</button></li>)}</ol>
      {wizardStep === 0 && <>
        <section className="panel"><div className="panel-head"><div><h2>可投入的資金</h2><p>每月結餘是在必要生活開支後、尚未扣除本筆利息的金額。</p></div><button className="button slim" onClick={loadExample}>載入回測示範</button></div>
          <div className="form-grid"><Field id="current-ownCapital" label="自有資金" value={fieldValue("current.ownCapital", scenario.ownCapital)} min={1} max={1000000000000} step={1000} suffix="NT$" error={draftErrors["current.ownCapital"]} onChange={raw => setCurrentField("ownCapital", raw, 1, 1000000000000)} /><Field id="cash-reserve" label="保留現金" value={fieldValue("cash.reserve", cashReserveTwd)} min={0} max={scenario.ownCapital} step={1000} suffix="NT$" error={draftErrors["cash.reserve"] || (cashReserveTwd > scenario.ownCapital ? "保留現金不能高於自有資金。" : "")} onChange={setCashReserve} /><Field id="current-monthlyFreeCashFlow" label="每月收支結餘" value={fieldValue("current.monthlyFreeCashFlow", scenario.monthlyFreeCashFlow)} min={-1000000000} max={1000000000} step={1000} suffix="NT$/月" error={draftErrors["current.monthlyFreeCashFlow"]} onChange={raw => setCurrentField("monthlyFreeCashFlow", raw, -1000000000, 1000000000)} /></div>
        </section>
        <details className="panel advanced-panel"><summary>進階資金與成本假設</summary><div className="form-grid advanced-grid"><Field id="scenarioName" type="text" label="情境名稱" value={draft["current.scenarioName"] ?? scenario.scenarioName} error={draftErrors["current.scenarioName"]} onChange={setScenarioName} /><Field id="current-monthlyLivingExpense" label="每月必要生活支出" value={fieldValue("current.monthlyLivingExpense", scenario.monthlyLivingExpense)} min={0} max={1000000000} step={1000} suffix="NT$/月" error={draftErrors["current.monthlyLivingExpense"]} onChange={raw => setCurrentField("monthlyLivingExpense", raw, 0, 1000000000)} /><Field id="current-minReserveMonths" label="必要預備金月數" value={fieldValue("current.minReserveMonths", scenario.minReserveMonths)} min={0} max={36} step={1} suffix="月" error={draftErrors["current.minReserveMonths"]} onChange={raw => setCurrentField("minReserveMonths", raw, 0, 36, true)} /><Field id="current-tradeCostPct" label="交易成本假設" value={fieldValue("current.tradeCostPct", scenario.tradeCostPct)} min={0} max={20} step={0.0001} suffix="%" error={draftErrors["current.tradeCostPct"]} onChange={raw => setCurrentField("tradeCostPct", raw, 0, 20)} /><Field id="current-shockPct" label="單步市場下跌壓力" value={fieldValue("current.shockPct", scenario.shockPct)} min={0} max={100} step={1} suffix="%" error={draftErrors["current.shockPct"]} onChange={raw => setCurrentField("shockPct", raw, 0, 100)} /></div></details>
      </>}
      {wizardStep === 1 && <section className="panel"><div className="panel-head"><div><h2>ETF 與自有資金配置</h2><p>先配置自有資金；借款權重預設跟隨，特殊配置可切換為自訂。</p></div><button className="button slim" onClick={addFund} disabled={scenario.funds.length >= 12}>＋ 新增 ETF</button></div>
        <label className="link-toggle"><input type="checkbox" checked={loanLinked} onChange={event => setLoanAllocationLinked(event.currentTarget.checked)} />借款配置跟隨自有配置</label>
        <div className="weight-tools"><div className={"weight-total " + (Math.abs(scenario.funds.reduce((s, f) => s + f.ownWeightPct, 0) - 100) > 0.000001 ? "invalid" : "")}>自有配置合計 <strong>{scenario.funds.reduce((s, f) => s + f.ownWeightPct, 0).toFixed(1)}%</strong><button className="text-button" onClick={() => normalize("ownWeightPct")}>調整至 100%</button></div>{!loanLinked && <div className={"weight-total " + (Math.abs(scenario.funds.reduce((s, f) => s + f.loanWeightPct, 0) - 100) > 0.000001 ? "invalid" : "")}>借款配置合計 <strong>{scenario.funds.reduce((s, f) => s + f.loanWeightPct, 0).toFixed(1)}%</strong><button className="text-button" onClick={() => normalize("loanWeightPct")}>調整至 100%</button></div>}</div>
        <div className="fund-list">{scenario.funds.map((fund, index) => { const historySupported = !supportedSymbols({ ...scenario, funds: [fund] }).unsupported.includes(fund.symbol); return <article className="fund-card" key={fund.id}>
          <div className="fund-title"><span className="fund-index">0{index + 1}</span><label className="field"><span className="field-title">ETF 標的</span><select aria-label="ETF 標的" value={fund.symbol} onChange={e => setFundField(fund.id, "symbol", e.currentTarget.value)}>{CATALOG.map(item => <option key={item.symbol} value={item.symbol}>{item.symbol}｜{item.name}</option>)}</select></label><button className="icon-button remove" aria-label={"移除 " + fund.symbol} disabled={scenario.funds.length < 2} onClick={() => removeFund(fund.id)}>移除</button></div>
          <div className="fund-values primary-fund-values"><Field id={"own-" + fund.id} label="自有權重" value={fieldValue("fund." + fund.id + ".ownWeightPct", fund.ownWeightPct)} min={0} max={100} step={0.1} suffix="%" error={draftErrors["fund." + fund.id + ".ownWeightPct"]} onChange={raw => setFundField(fund.id, "ownWeightPct", raw)} /><div className="capacity"><span>歷史研究資料</span><strong>{historySupported ? "核心模型標的" : "資金試算可用"}</strong><small>{historySupported ? "逐日資料仍以研究日期範圍核對" : "不支援歷史回測；不會替換成其他 ETF"}</small></div></div>
          <details className="fund-advanced"><summary>質押與借款配置</summary><div className="fund-values"><Field id={"loan-" + fund.id} label="借款權重" value={fieldValue("fund." + fund.id + ".loanWeightPct", fund.loanWeightPct)} min={0} max={100} step={0.1} suffix="%" error={draftErrors["fund." + fund.id + ".loanWeightPct"]} onChange={raw => { setLoanLinked(false); setFundField(fund.id, "loanWeightPct", raw); }} /><Field id={"pledge-" + fund.id} label="自有持倉質押比例" value={fieldValue("fund." + fund.id + ".pledgePct", fund.pledgePct)} min={0} max={100} step={0.1} suffix="%" error={draftErrors["fund." + fund.id + ".pledgePct"]} onChange={raw => setFundField(fund.id, "pledgePct", raw)} /><Field id={"ltv-" + fund.id} label="假設可貸成數 LTV" value={fieldValue("fund." + fund.id + ".ltvPct", fund.ltvPct)} min={0} max={100} step={0.1} suffix="%" error={draftErrors["fund." + fund.id + ".ltvPct"]} onChange={raw => setFundField(fund.id, "ltvPct", raw)} /><label className="field"><span className="field-title">質押資格</span><select value={fund.pledgeStatus} onChange={e => setFundField(fund.id, "pledgeStatus", e.currentTarget.value)}><option value="assumed">情境假設可質押</option><option value="blocked">設定為不可質押</option></select></label><div className="capacity"><span>單檔模型額度</span><strong>{money(capacityCalc.valid ? capacityCalc.legs[index]?.capacity : NaN)}</strong><small>券商資格與 LTV 尚未確認</small></div></div></details>
        </article>; })}</div>
        {validation.errors.length > 0 && <div className="error-banner" role="alert"><strong>目前配置需要修正</strong><ul>{validation.errors.map((item, i) => <li key={i}>{item}</li>)}</ul></div>}
        <details className="advanced-panel"><summary>保存 A/B/C 情境</summary><div className="slot-tools"><span>目前完整設定會保存至所選方案</span>{SLOT_NAMES.map(slot => <button key={slot} className="button slim" onClick={() => changeSlot(slot, "save")}>儲存 {slot}</button>)}</div></details>
      </section>}
      {wizardStep === 2 && <section className="panel"><div className="panel-head"><div><h2>借款條件</h2><p>ETF 質押、每月付息、期滿還本；額度只代表模型假設。</p></div></div><div className="form-grid"><Field id="loan-amount" label="預計借款金額" value={loanAmountText} min={0} max={1000000000000} step={1000} suffix="NT$" error={draftErrors["loan.amount"] || (loanAmountTwd > Number(capacityCalc.loanCapacity || 0) ? "超過目前估計額度；請改金額或返回調整配置。" : "")} onChange={setLoanAmount} /><Field id="current-aprPct" label="借款年利率假設" value={fieldValue("current.aprPct", scenario.aprPct)} min={0} max={50} step={0.01} suffix="%" error={draftErrors["current.aprPct"]} onChange={raw => setCurrentField("aprPct", raw, 0, 50)} /><Field id="current-termMonths" label="借款期間" value={fieldValue("current.termMonths", scenario.termMonths)} min={1} max={360} step={1} suffix="月" error={draftErrors["current.termMonths"]} onChange={raw => setCurrentField("termMonths", raw, 1, 360, true)} /></div><div className="capacity-strip"><strong>目前模型估計額度：{money(capacityCalc.valid ? capacityCalc.loanCapacity : NaN)}</strong><span>預計使用 {capacityCalc.valid && Number(capacityCalc.loanCapacity) > 0 ? percent(loanAmountTwd / Number(capacityCalc.loanCapacity) * 100, 1) : loanAmountTwd === 0 ? "0.0%" : "無法計算"}</span></div><details className="advanced-panel"><summary>借款費用與資金用途</summary><div className="form-grid advanced-grid"><Field id="current-loanInvestPct" label="借款再投入比例" value={fieldValue("current.loanInvestPct", scenario.loanInvestPct)} min={0} max={100} step={0.1} suffix="%" error={draftErrors["current.loanInvestPct"]} onChange={raw => setCurrentField("loanInvestPct", raw, 0, 100)} /><Field id="current-originationFeePct" label="融資開辦費假設" value={fieldValue("current.originationFeePct", scenario.originationFeePct)} min={0} max={20} step={0.0001} suffix="%" error={draftErrors["current.originationFeePct"]} onChange={raw => setCurrentField("originationFeePct", raw, 0, 20)} /></div></details></section>}
      {wizardStep === 3 && <section className="panel"><div className="panel-head"><div><h2>核對後查看負擔結果</h2><p>這是情境試算；不是券商核貸條件，也不計未來獲利。</p></div></div><div className="review-grid"><div><span>自有資金</span><strong>{money(scenario.ownCapital)}</strong></div><div><span>保留現金</span><strong>{money(cashReserveTwd)}</strong></div><div><span>ETF 配置</span><strong>{scenario.funds.map(item => item.symbol + " " + item.ownWeightPct + "%").join("、")}</strong></div><div><span>借款本金</span><strong>{money(loanAmountTwd)}</strong></div><div><span>利率與期限</span><strong>{percent(scenario.aprPct, 2)}｜{scenario.termMonths} 個月</strong></div><div><span>每月收支結餘</span><strong>{money(scenario.monthlyFreeCashFlow)}／月</strong></div></div>{(validation.errors.length > 0 || Object.keys(draftErrors).length > 0 || cashReserveTwd > scenario.ownCapital || loanAmountTwd > Number(capacityCalc.loanCapacity || 0)) && <div className="error-banner" role="alert">目前資料尚未完整或借款超過估計額度。請返回修正後再查看結果。</div>}<p className="assumption-box">模型不假設可續借、投資獲利或立即賣出 ETF 還款。正二 ETF 跌幅只採單步近似。</p></section>}
      <div className="wizard-controls"><button className="button" disabled={wizardStep === 0} onClick={() => setWizardStep(step => Math.max(0, step - 1))}>上一步</button><span>步驟 {wizardStep + 1}／4</span>{wizardStep < 3 ? <button className="button primary" onClick={() => { if (Object.keys(draftErrors).length) return; if (wizardStep === 1 && validation.errors.length) return; setWizardStep(step => Math.min(3, step + 1)); }}>下一步</button> : <button className="button primary" onClick={() => { if (Object.keys(draftErrors).length || validation.errors.length || cashReserveTwd > scenario.ownCapital || loanAmountTwd > Number(capacityCalc.loanCapacity || 0)) return; setStale(false); navigate("overview"); }}>查看負擔試算</button>}</div>
    </> : <><button className="text-button back-to-wizard" onClick={() => { setSubtab("portfolio"); setWizardStep(0); }}>← 返回設定步驟</button>{subtab === "survival" && <section className="panel"><div className="panel-head"><div><h2>獨立生存分析假設</h2><p>生存模型使用 T+2 帳務，與負擔試算及報酬模型分開。</p></div></div><div className="form-grid">
      <Field id="sv-horizon" label="觀察期間" value={fieldValue("survival.horizonMonths", workspace.survival.horizonMonths)} min={1} max={120} step={1} suffix="月" onChange={raw => setSurvivalField("horizonMonths", raw)} />
      <Field id="sv-shock" label="額外市場跌幅" value={fieldValue("survival.shockPct", workspace.survival.shockPct)} min={0} max={90} step={1} suffix="%" onChange={raw => setSurvivalField("shockPct", raw)} />
      <Field id="sv-shock-month" label="衝擊月份" value={fieldValue("survival.shockMonth", workspace.survival.shockMonth)} min={0} max={120} step={1} suffix="月" onChange={raw => setSurvivalField("shockMonth", raw)} />
      <Field id="sv-unemployment" label="無收入月數" value={fieldValue("survival.unemploymentMonths", workspace.survival.unemploymentMonths)} min={0} max={120} step={1} suffix="月" onChange={raw => setSurvivalField("unemploymentMonths", raw)} />
      <Field id="sv-rate" label="利率額外上升" value={fieldValue("survival.rateHikePct", workspace.survival.rateHikePct)} min={0} max={20} step={0.1} suffix="百分點" onChange={raw => setSurvivalField("rateHikePct", raw)} />
      <label className="field"><span className="field-title">到期處理</span><select value={workspace.survival.rollover} onChange={e => setSurvivalField("rollover", e.currentTarget.value)}><option value="deny">不續借並清償</option><option value="conditional">條件式假設續借</option></select></label>
      <label className="field"><span className="field-title">已知到期款項</span><select value={String(workspace.survival.prefund)} onChange={e => setSurvivalField("prefund", e.currentTarget.value)}><option value="true">提前兩個觀察交易日預售</option><option value="false">不提前預售</option></select></label>
      <label className="field"><span className="field-title">維持率處理</span><select value={workspace.survival.marginPolicy} onChange={e => setSurvivalField("marginPolicy", e.currentTarget.value)}><option value="warning">只標示低於 130%</option><option value="hypothetical_two_day_cure">假設兩日內補至 166%</option></select></label>
    </div><div className="assumption-box">T+2 以第二個觀察交易日結算應收款的研究近似，不代表券商交割、追繳或實際清算規則。</div></section>}
    {subtab === "data" && <section className="panel"><div className="panel-head"><div><h2>匯入、匯出與資料備份</h2><p>匯入前會先驗證格式並預覽將影響的設定。</p></div></div><div className="action-grid"><button className="button" onClick={() => fileInput.current?.click()}>選擇 JSON 匯入</button><button className="button" onClick={() => download("LPOS-工作區-V2.json", exportWorkspace(validateWorkspace(workspace)), "application/json;charset=utf-8")} disabled={Object.keys(draftErrors).length > 0 || validation.errors.length > 0}>下載完整工作區</button><button className="button" onClick={() => download("LPOS-目前情境-V1.json", exportScenario(scenario), "application/json;charset=utf-8")} disabled={Object.keys(draftErrors).length > 0 || validation.errors.length > 0}>下載目前情境</button><button className="button" disabled={!showRun} onClick={exportBundle}>下載研究重現包</button></div><div className="assumption-box">使用者設定只保存在本機。無效草稿不會被匯出為有效研究情境。</div>{runError && <p className="error-banner">{runError}</p>}</section>}</>}
  </div>;

  const renderTools = () => <div className="stack">
    <section className="tool-cards">
      <button className="panel tool-card" onClick={() => navigate("research")}><span className="tool-icon">↗</span><strong>歷史研究</strong><small>調整價格代理、資料期間與獨立 T+2 生存研究</small></button>
      <button className="panel tool-card" onClick={() => navigate("compare")}><span className="tool-icon">⇄</span><strong>A／B／C 公平比較</strong><small>共同本金、外部金流及日期後再比較</small></button>
      <button className="panel tool-card" onClick={() => navigate("report")}><span className="tool-icon">▤</span><strong>研究報告與下載</strong><small>網頁、PDF、CSV 及研究重現包</small></button>
      <button className="panel tool-card" onClick={() => { setSubtab("survival"); navigate("setup"); }}><span className="tool-icon">⌁</span><strong>生存分析假設</strong><small>獨立設定 T+2、到期與現金壓力條件</small></button>
      <button className="panel tool-card" onClick={() => { setSubtab("data"); navigate("setup"); }}><span className="tool-icon">⇧</span><strong>匯入與資料備份</strong><small>預覽匯入內容、匯出工作區或情境</small></button>
    </section>
    <div className="notice warning">A/B/C 使用相同本金、每月外部淨現金流與共同日期。任一方案中斷時，不提供跨期間報酬排名。</div>
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
      <nav className="report-index" aria-label="報告章節">{report.blocks.map(block => <a key={block.id} href={"#report/" + block.id} onClick={event => { event.preventDefault(); navigate("report"); setTimeout(() => document.getElementById(block.id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 0); }}>{block.title}</a>)}</nav>
      <Chart run={run} />
      {report.blocks.map(reportBlock)}
      {run.reference.snapshot && <section className="panel"><div className="panel-head"><h2>封存 Python 參考快照（獨立模型）</h2><StatusPill state="partial" /></div><p>此快照使用固定 2020-07-20 至 2026-03-06 歷史設定，不與本次自由配置混排。</p><p>{run.reference.snapshot.researchVersion}｜來源分級 {run.reference.snapshot.sourceGrade}｜{run.reference.snapshot.period.sessions} 觀察日</p><details><summary>檢視 10 組封存條件</summary><div className="table-scroll"><table><thead><tr><th>組合</th><th>借款本金</th><th>CAGR</th><th>MDD</th><th>Sharpe</th><th>未償本金</th></tr></thead><tbody>{run.reference.snapshot.cases.map((row: any, index: number) => <tr key={index}><td>{row.portfolio}</td><td>{money(row.loanTwd)}</td><td>{percent(row.stats.cagr_pct)}</td><td>{percent(row.stats.mdd_pct)}</td><td>{Number(row.stats.sharpe_0rf).toFixed(3)}</td><td>{money(row.stats.remaining_loan_twd)}</td></tr>)}</tbody></table></div></details></section>}
    </> : <section className="panel empty-state"><span className="tag">報告中心</span><h2>{stale ? "目前報告已過期" : "沒有可用的研究報告"}</h2><p>{stale ? "參數已變更，請重新計算後才能下載新報告。" : "需要先完成一次有效研究。你仍可在設定中下載情境或工作區 JSON。"}</p><button className="button primary" onClick={() => navigate("research")}>前往歷史研究</button>{runError && <p className="error-banner">{runError}</p>}</section>}
  </div>;

  const isToolsRoute = ["tools", "research", "compare", "report"].includes(route);
  const body = route === "setup" ? renderSetup() : route === "tools" ? renderTools() : route === "research" ? renderResearch() : route === "compare" ? renderCompare() : route === "report" ? renderReport() : renderOverview();
  return <div className="app-shell" onBlurCapture={event => {
    const target = event.target;
    if (target instanceof HTMLInputElement) {
      const key = draftKeyForInput(target.id);
      if (key && draft[key] !== undefined && !draftErrors[key]) {
        const number = parseNumericDraft(draft[key]);
        if (number !== null) setDraft(previous => ({ ...previous, [key]: formatNumericDraft(number) }));
      }
    }
    if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) window.setTimeout(persistNow, 0);
  }}>
    <aside className="sidebar">
      <a className="brand" href="#overview" onClick={e => { e.preventDefault(); navigate("overview"); }}><span className="brand-mark">L</span><span><strong>LPOS</strong><small>PORTFOLIO LAB</small></span></a>
      <div className="side-caption">研究工作台</div>
      <nav className="side-nav" aria-label="主要導覽">{NAV.map(item => { const active = item.id === "tools" ? isToolsRoute : route === item.id; return <button key={item.id} className={active ? "active" : ""} aria-current={active ? "page" : undefined} onClick={() => navigate(item.id)}><span className="nav-icon">{item.icon}</span>{item.label}</button>; })}</nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-footer"><span className="version-tag">WEB V{APP_VERSION}</span><p>設定儲存在本機瀏覽器</p><p>資料截至日依來源檔案列示</p></div>
    </aside>
    <main className="main-content">
      <header className="topbar"><div><div className="eyebrow">LPOS PORTFOLIO LAB / V0.7.1</div><h1>{activeTitle[0]}</h1><p>{activeTitle[1]}</p></div><div className="top-actions"><button className="button icon-action" aria-label="匯入工作區 JSON" title="匯入工作區 JSON" onClick={() => fileInput.current?.click()}>⇧ 匯入</button><input ref={fileInput} type="file" accept="application/json,.json" className="visually-hidden" aria-label="匯入 JSON" onChange={e => void selectImportFile(e.currentTarget.files?.[0])} /></div></header>
      {!canPersist && <section className="recovery-notice" role="alert"><strong>原工作區無法安全讀取</strong><p>{notice}你仍可先下載原始內容，再明確建立新的本機工作區。</p>{loaded.rawBackup && <button className="button" onClick={() => { download("LPOS-原始工作區備份.json", loaded.rawBackup, "application/json;charset=utf-8"); setRecoveryBackupDownloaded(true); }}>下載原始工作區備份</button>}<button className="button danger" disabled={!recoveryBackupDownloaded} onClick={() => { const fresh = createDefaultWorkspace(); fresh.current.borrowUtilPct = 0; lastValidWorkspace.current = fresh; setWorkspace(fresh); setDraft({}); setDraftErrors({}); setWizardStep(0); setLoanAmountTwd(0); setLoanAmountText("0"); setCashReserveTwd(0); setCanPersist(true); setNotice("已建立新的工作區；原始資料備份仍由你保管。"); }}>建立新的空白工作區</button></section>}
      {stale && <div className="notice warning" role="status">設定已變更，舊研究結果已隱藏。請重新計算。</div>}
      {runStatus === "running" && route !== "research" && <div className="run-strip"><Progress percent={progress.percent} stage={progress.stage} /><button className="button slim danger" onClick={startResearch}>取消研究</button></div>}
      {body}
    </main>
    <nav className="mobile-nav" aria-label="手機主要導覽">{NAV.map(item => { const active = item.id === "tools" ? isToolsRoute : route === item.id; return <button key={item.id} className={active ? "active" : ""} aria-current={active ? "page" : undefined} onClick={() => navigate(item.id)}><span>{item.icon}</span>{item.short}</button>; })}</nav>
    {importPreviewState && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setImportPreviewState(null); }}><section className="modal panel" role="dialog" aria-modal="true" aria-labelledby="import-title"><div className="panel-head"><h2 id="import-title">確認匯入內容</h2><button className="icon-button" onClick={() => setImportPreviewState(null)} aria-label="關閉">×</button></div><p>類型：{importPreviewState.type === "bundle" ? "研究重現包" : importPreviewState.type === "workspace" ? "完整工作區 V2" : "單一情境 V1"}</p><p>方案：<strong>{importPreviewState.name}</strong></p><ul>{importPreviewState.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul><div className="modal-actions"><button className="button" onClick={() => setImportPreviewState(null)}>取消</button><button className="button primary" onClick={applyImport}>套用匯入</button></div></section></div>}
  </div>;
}
